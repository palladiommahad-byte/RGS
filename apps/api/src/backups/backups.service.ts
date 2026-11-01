import { HttpStatus, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { BackupRun } from '@prisma/client';
import { BACKUP_STALE_HOURS, localDate, TIMEZONE, type BackupRunDto, type BackupStatusDto } from '@riad/shared';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import type { AuthPrincipal } from '../common/auth/principal';
import { loadUserNames } from '../expenses/expense.mapper';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

const HOUR_MS = 3_600_000;
const ACTIVE = ['REQUESTED', 'RUNNING'];

/**
 * Backups are made by the backup container (deploy/backup), which records each run in
 * backup_runs. Here: what the owner sees in Settings, "Back up now" (a REQUESTED row the
 * container picks up within a minute) and the alerts when backups fail or stop.
 */
@Injectable()
export class BackupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async status(p: AuthPrincipal, now: Date = new Date()): Promise<BackupStatusDto> {
    const [runs, lastOk, active] = await Promise.all([
      this.prisma.backupRun.findMany({ orderBy: { requestedAt: 'desc' }, take: 20 }),
      this.prisma.backupRun.findFirst({ where: { status: 'OK' }, orderBy: { finishedAt: 'desc' } }),
      this.prisma.backupRun.count({ where: { status: { in: ACTIVE } } }),
    ]);
    const names = await loadUserNames(this.prisma, p.riadId, runs.map((r) => r.requestedBy));
    const dto = (r: BackupRun): BackupRunDto => ({
      id: r.id,
      trigger: r.trigger === 'SCHEDULED' ? 'SCHEDULED' : 'MANUAL',
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
   * Alerts the owner: each failed backup once, and once a day while the last good backup is
   * older than BACKUP_STALE_HOURS. Silent where no backup service ever ran (development).
   */
  @Cron('0 20 * * * *', { name: 'backup-monitor', timeZone: TIMEZONE })
  async check(now: Date = new Date()): Promise<number> {
    let sent = 0;
    const lastOk = await this.prisma.backupRun.findFirst({ where: { status: 'OK' }, orderBy: { finishedAt: 'desc' } });
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
