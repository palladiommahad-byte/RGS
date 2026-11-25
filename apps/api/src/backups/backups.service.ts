import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { BackupRun } from '@prisma/client';
import { BACKUP_STALE_HOURS, localDate, RESTORE_CONFIRM_WORD, TIMEZONE, type BackupRunDto, type BackupStatusDto } from '@riad/shared';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import type { AuthPrincipal } from '../common/auth/principal';
import { loadUserNames } from '../expenses/expense.mapper';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

const HOUR_MS = 3_600_000;
const ACTIVE = ['REQUESTED', 'RUNNING'];
// A good backup: a RESTORE row records a restore, not a copy that can be restored.
const GOOD_BACKUP = { status: 'OK', trigger: { not: 'RESTORE' } };

/**
 * Backups are made by the backup container (deploy/backup), which records each run in
 * backup_runs. Here: what the owner sees in Settings, "Back up now" (a REQUESTED row the
 * container picks up within a minute) and the alerts when backups fail or stop.
 */
@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);
  private readonly startedAt = new Date();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async status(p: AuthPrincipal, now: Date = new Date()): Promise<BackupStatusDto> {
    const [runs, lastOk, active, restoring] = await Promise.all([
      this.prisma.backupRun.findMany({ orderBy: { requestedAt: 'desc' }, take: 20 }),
      this.prisma.backupRun.findFirst({ where: GOOD_BACKUP, orderBy: { finishedAt: 'desc' } }),
      this.prisma.backupRun.count({ where: { status: { in: ACTIVE } } }),
      this.prisma.backupRun.count({ where: { status: { in: ACTIVE }, trigger: 'RESTORE' } }),
    ]);
    const names = await loadUserNames(this.prisma, p.riadId, runs.map((r) => r.requestedBy));
    const dto = (r: BackupRun): BackupRunDto => ({
      id: r.id,
      trigger: r.trigger === 'SCHEDULED' || r.trigger === 'RESTORE' ? r.trigger : 'MANUAL',
      status: r.status as BackupRunDto['status'],
      name: r.name,
      size: r.dbBytes === null ? null : Number(r.dbBytes) + Number(r.filesBytes ?? 0),
      encrypted: r.encrypted,
      offsite: r.offsite,
      error: r.error,
      requestedAt: r.requestedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
      requestedBy: (r.requestedBy && names.get(r.requestedBy)?.name) || null,
    });
    return {
      lastOk: lastOk ? dto(lastOk) : null,
      healthy: !!lastOk?.finishedAt && now.getTime() - lastOk.finishedAt.getTime() < BACKUP_STALE_HOURS * HOUR_MS,
      inProgress: active > 0,
      neverRan: runs.length === 0,
      restoring: restoring > 0,
      canRestore: p.roleKey === 'OWNER',
      runs: runs.map(dto),
    };
  }

  /** "Back up now": the backup container starts it within a minute. */
  async request(p: AuthPrincipal): Promise<void> {
    if (await this.prisma.backupRun.count({ where: { status: { in: ACTIVE } } })) {
      throw new AppException('BACKUP_IN_PROGRESS', 'A backup is already waiting or running', HttpStatus.CONFLICT);
    }
    const run = await this.prisma.backupRun.create({ data: { trigger: 'MANUAL', status: 'REQUESTED', requestedBy: p.userId } });
    await this.audit.log({ riadId: p.riadId, userId: p.userId, action: 'backup.request', entity: 'BackupRun', entityId: run.id });
  }

  /**
   * Restore (owner only): replaces every record and file with backup `name`. The backup
   * container picks the RESTORE row up within a minute, saves a safety copy of the current
   * data first, restores (from this server or off-site), and the API then restarts itself.
   */
  async restore(p: AuthPrincipal, name: string, confirm: string): Promise<void> {
    if (p.roleKey !== 'OWNER') {
      throw new AppException('OWNER_ONLY', 'Only an owner can restore a backup', HttpStatus.FORBIDDEN);
    }
    if (confirm !== RESTORE_CONFIRM_WORD) {
      throw new AppException('CONFIRM_REQUIRED', `Type ${RESTORE_CONFIRM_WORD} to confirm`, HttpStatus.BAD_REQUEST);
    }
    if (!(await this.prisma.backupRun.findFirst({ where: { ...GOOD_BACKUP, name } }))) {
      throw new AppException('BACKUP_NOT_FOUND', 'No good backup with this name', HttpStatus.NOT_FOUND);
    }
    if (await this.prisma.backupRun.count({ where: { status: { in: ACTIVE } } })) {
      throw new AppException('BACKUP_IN_PROGRESS', 'A backup or restore is already waiting or running', HttpStatus.CONFLICT);
    }
    const run = await this.prisma.backupRun.create({ data: { trigger: 'RESTORE', status: 'REQUESTED', name, requestedBy: p.userId } });
    await this.audit.log({ riadId: p.riadId, userId: p.userId, action: 'backup.restore_request', entity: 'BackupRun', entityId: run.id, diff: { name } });
  }

  /**
   * After a restore the database is the backup's: this process restarts (Docker brings it
   * back) so pending migrations run and nothing cached from before is kept. Production only.
   */
  @Cron('*/10 * * * * *', { name: 'restore-watch' })
  async restartAfterRestore(): Promise<boolean> {
    if (process.env.NODE_ENV !== 'production') return false;
    const done = await this.prisma.backupRun
      .findFirst({ where: { trigger: 'RESTORE', status: { in: ['OK', 'FAILED'] }, finishedAt: { gt: this.startedAt } } })
      .catch(() => null); // database being replaced right now: try again in 10 s
    if (!done) return false;
    this.logger.warn(`Backup ${done.name} restored (${done.status}): restarting the API`);
    setTimeout(() => process.exit(0), 500);
    return true;
  }

  /**
   * Alerts the owner: each failed backup once, and once a day while the last good backup is
   * older than BACKUP_STALE_HOURS. Silent where no backup service ever ran (development).
   */
  @Cron('0 20 * * * *', { name: 'backup-monitor', timeZone: TIMEZONE })
  async check(now: Date = new Date()): Promise<number> {
    let sent = 0;
    const lastOk = await this.prisma.backupRun.findFirst({ where: GOOD_BACKUP, orderBy: { finishedAt: 'desc' } });
    const failed = await this.prisma.backupRun.findMany({
      where: { status: 'FAILED', finishedAt: { gte: new Date(now.getTime() - 7 * 24 * HOUR_MS) } },
    });
    for (const run of failed) {
      sent += await this.notifications.backup(
        { kind: 'FAILED', runId: run.id, error: run.error, lastOkAt: lastOk?.finishedAt?.toISOString() ?? null },
        `backup-failed:${run.id}`,
      );
    }
    const first = await this.prisma.backupRun.findFirst({ orderBy: { requestedAt: 'asc' } });
    const since = lastOk?.finishedAt ?? first?.requestedAt;
    if (since && now.getTime() - since.getTime() > BACKUP_STALE_HOURS * HOUR_MS) {
      sent += await this.notifications.backup(
        { kind: 'STALE', runId: null, error: null, lastOkAt: lastOk?.finishedAt?.toISOString() ?? null },
        `backup-stale:${localDate(now)}`,
      );
    }
    return sent;
  }
}
