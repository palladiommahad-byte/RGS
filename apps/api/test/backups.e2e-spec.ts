import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { BackupStatusDto, NotificationListDto } from '@riad/shared';
import type TestAgent from 'supertest/lib/agent';
import { BackupsService } from '../src/backups/backups.service';
import { createApp, createRiad, loginAs, resetDatabase, type RiadFixture } from './fixtures';

const API = '/api/v1';
const HOUR = 3_600_000;

describe('Backups (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let a: RiadFixture;
  let owner: TestAgent;
  let manager: TestAgent;
  let reception: TestAgent;
  let monitor: BackupsService;

  const status = async () => (await owner.get(`${API}/backups`).expect(200)).body as BackupStatusDto;
  const ago = (h: number) => new Date(Date.now() - h * HOUR);

  beforeAll(async () => {
    prisma = new PrismaClient();
    await resetDatabase(prisma);
    await prisma.backupRun.deleteMany();
    a = await createRiad(prisma, 'Riad A');
    app = await createApp();
    monitor = app.get(BackupsService);
    owner = await loginAs(app, a.emails.OWNER);
    manager = await loginAs(app, a.emails.MANAGER);
    reception = await loginAs(app, a.emails.RECEPTION);
  });

  afterAll(async () => {
    await prisma?.backupRun.deleteMany();
    await app?.close();
    await prisma?.$disconnect();
  });

  it('is for riad settings holders (owner, manager), not reception', async () => {
    await reception.get(`${API}/backups`).expect(403);
    await reception.post(`${API}/backups`).expect(403);
    await manager.get(`${API}/backups`).expect(200);
  });

  it('stays silent where no backup service ever ran', async () => {
    expect(await status()).toMatchObject({ neverRan: true, healthy: false, lastOk: null, runs: [] });
    expect(await monitor.check()).toBe(0);
  });

  it('queues "Back up now" for the backup container, once at a time', async () => {
    await owner.post(`${API}/backups`).expect(202);
    const s = await status();
    expect(s).toMatchObject({ inProgress: true, neverRan: false });
    expect(s.runs[0]).toMatchObject({ trigger: 'MANUAL', status: 'REQUESTED', requestedBy: 'OWNER Riad A' });
    const again = await owner.post(`${API}/backups`).expect(409);
    expect(again.body.code).toBe('BACKUP_IN_PROGRESS');
    expect(await prisma.auditLog.count({ where: { action: 'backup.request' } })).toBe(1);
  });

  it('shows the last good backup with its size and off-site copy', async () => {
    // What the container records once done.
    await prisma.backupRun.updateMany({
      where: { status: 'REQUESTED' },
      data: { status: 'OK', name: '2026-10-31_030000', dbBytes: 200_000n, filesBytes: 50_000n, encrypted: true, offsite: true, startedAt: ago(1), finishedAt: ago(1) },
    });
    const s = await status();
    expect(s).toMatchObject({ healthy: true, inProgress: false });
    expect(s.lastOk).toMatchObject({ name: '2026-10-31_030000', size: 250_000, encrypted: true, offsite: true });
    expect(await monitor.check()).toBe(0);
  });

  it('alerts the owner once per failed backup', async () => {
    const failed = await prisma.backupRun.create({
      data: { trigger: 'SCHEDULED', status: 'FAILED', error: 'pg_dump: connection refused', requestedAt: ago(0.5), finishedAt: ago(0.5) },
    });
    expect(await monitor.check()).toBe(1);
    expect(await monitor.check()).toBe(0);
    const notes = (await owner.get(`${API}/notifications`).expect(200)).body as NotificationListDto;
    expect(notes.items[0]).toMatchObject({ type: 'BACKUP', actor: null, data: { kind: 'FAILED', runId: failed.id, error: 'pg_dump: connection refused' } });
    expect((await reception.get(`${API}/notifications`).expect(200)).body.items.map((n: { type: string }) => n.type)).not.toContain('BACKUP');
  });

  it('alerts once a day while the last good backup is too old', async () => {
    const later = new Date(Date.now() + 30 * HOUR);
    expect(await monitor.check(later)).toBe(1);
    expect(await monitor.check(new Date(later.getTime() + HOUR))).toBe(0);
    const notes = (await owner.get(`${API}/notifications`).expect(200)).body as NotificationListDto;
    expect(notes.items[0]).toMatchObject({ type: 'BACKUP', data: { kind: 'STALE' } });
    expect((notes.items[0]!.data as { lastOkAt: string | null }).lastOkAt).not.toBeNull();
  });

  describe('restore', () => {
    const NAME = '2026-11-20_030000';
    const good = async () => {
      await prisma.backupRun.updateMany({ where: { status: { in: ['REQUESTED', 'RUNNING'] } }, data: { status: 'FAILED' } });
      return prisma.backupRun.create({
        data: { trigger: 'SCHEDULED', status: 'OK', name: NAME, dbBytes: 1000, filesBytes: 2000, encrypted: true, offsite: true, finishedAt: ago(2) },
      });
    };

    it('is for owners only: managers with riad settings cannot', async () => {
      await good();
      const res = await manager.post(`${API}/backups/restore`).send({ name: NAME, confirm: 'RESTORE' }).expect(403);
      expect(res.body.code).toBe('OWNER_ONLY');
      await reception.post(`${API}/backups/restore`).send({ name: NAME, confirm: 'RESTORE' }).expect(403);
      expect((await manager.get(`${API}/backups`).expect(200)).body.canRestore).toBe(false);
      expect((await status()).canRestore).toBe(true);
    });

    it('needs the exact word RESTORE and an existing good backup', async () => {
      const wrong = await owner.post(`${API}/backups/restore`).send({ name: NAME, confirm: 'restore' }).expect(400);
      expect(wrong.body.code).toBe('CONFIRM_REQUIRED');
      const unknown = await owner.post(`${API}/backups/restore`).send({ name: '2020-01-01_030000', confirm: 'RESTORE' }).expect(404);
      expect(unknown.body.code).toBe('BACKUP_NOT_FOUND');
      // Only backup stamps: nothing else can reach the restore script.
      await owner.post(`${API}/backups/restore`).send({ name: '../../etc/passwd', confirm: 'RESTORE' }).expect(400);
    });

    it('queues the restore for the backup container, once at a time, and audits it', async () => {
      await owner.post(`${API}/backups/restore`).send({ name: NAME, confirm: 'RESTORE' }).expect(202);
      const s = await status();
      expect(s).toMatchObject({ restoring: true, inProgress: true });
      expect(s.runs[0]).toMatchObject({ trigger: 'RESTORE', status: 'REQUESTED', name: NAME });
      // A restore is not a backup: it never shows as the last good backup.
      expect(s.lastOk?.trigger).not.toBe('RESTORE');
      expect((await owner.post(`${API}/backups`).expect(409)).body.code).toBe('BACKUP_IN_PROGRESS');
      expect(await prisma.auditLog.count({ where: { action: 'backup.restore_request' } })).toBe(1);
    });

    it('never restarts the API outside production', async () => {
      await prisma.backupRun.updateMany({ where: { trigger: 'RESTORE' }, data: { status: 'OK', finishedAt: new Date() } });
      expect(await monitor.restartAfterRestore()).toBe(false);
    });
  });
});
