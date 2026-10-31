import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { AuditLogDto, Paginated } from '@riad/shared';
import type TestAgent from 'supertest/lib/agent';
import { createApp, createRiad, loginAs, resetDatabase, type RiadFixture } from './fixtures';

const API = '/api/v1';

describe('Audit log (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let a: RiadFixture;
  let b: RiadFixture;
  let owner: TestAgent;
  let manager: TestAgent;
  let reception: TestAgent;
  let ownerId: string;
  let managerId: string;

  const list = async (query = '') => (await owner.get(`${API}/audit${query}`).expect(200)).body as Paginated<AuditLogDto>;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await resetDatabase(prisma);
    a = await createRiad(prisma, 'Riad A');
    b = await createRiad(prisma, 'Riad B');
    app = await createApp();
    owner = await loginAs(app, a.emails.OWNER);
    manager = await loginAs(app, a.emails.MANAGER);
    reception = await loginAs(app, a.emails.RECEPTION);
    ownerId = (await prisma.user.findUniqueOrThrow({ where: { email: a.emails.OWNER } })).id;
    managerId = (await prisma.user.findUniqueOrThrow({ where: { email: a.emails.MANAGER } })).id;

    // Mid-day instants: they fall on the date they show whatever the riad's UTC offset.
    const entries = [
      { userId: ownerId, action: 'expense.delete', entity: 'Expense', at: '2026-10-01T09:00:00Z', diff: { amountTtc: 12000 } },
      { userId: managerId, action: 'payment.create', entity: 'Payment', at: '2026-10-02T10:00:00Z', diff: { amount: 50000 } },
      { userId: managerId, action: 'stay.confirm', entity: 'Stay', at: '2026-10-03T12:00:00Z', diff: { status: ['PENDING', 'CHECKED_IN'] } },
      { userId: null, action: 'stay.self_checkin', entity: 'Stay', at: '2026-10-04T08:00:00Z', diff: null },
    ];
    for (const e of entries) {
      await prisma.auditLog.create({
        data: { riadId: a.riadId, userId: e.userId, action: e.action, entity: e.entity, diff: e.diff ?? undefined, createdAt: new Date(e.at) },
      });
    }
    await prisma.auditLog.create({ data: { riadId: b.riadId, userId: null, action: 'expense.create', entity: 'Expense' } });
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('is reserved to audit.read', async () => {
    await reception.get(`${API}/audit`).expect(403);
    await reception.get(`${API}/audit/users`).expect(403);
    await manager.get(`${API}/audit`).expect(200);
  });

  it('lists this riad only, newest first, with who did it', async () => {
    const page = await list();
    expect(page.total).toBe(4);
    expect(page.items.map((i) => i.action)).toEqual(['stay.self_checkin', 'stay.confirm', 'payment.create', 'expense.delete']);
    expect(page.items[0]!.user).toBeNull();
    expect(page.items[1]).toMatchObject({ user: { id: managerId }, diff: { status: ['PENDING', 'CHECKED_IN'] } });
  });

  it('filters by area, person and day range', async () => {
    expect((await list('?area=stays')).items.map((i) => i.action)).toEqual(['stay.self_checkin', 'stay.confirm']);
    expect((await list('?area=billing')).total).toBe(1);
    expect((await list(`?userId=${managerId}`)).total).toBe(2);
    expect((await list('?from=2026-10-02&to=2026-10-03')).items.map((i) => i.action)).toEqual(['stay.confirm', 'payment.create']);
    expect((await list('?limit=1&page=2')).items.map((i) => i.action)).toEqual(['stay.confirm']);
    await owner.get(`${API}/audit?area=nope`).expect(400);
    await owner.get(`${API}/audit?from=2026-13-01`).expect(400);
  });

  it('offers the riad users for the filter', async () => {
    const users = (await owner.get(`${API}/audit/users`).expect(200)).body as { id: string; name: string }[];
    expect(users).toHaveLength(4);
    expect(users.map((u) => u.id)).toContain(ownerId);
  });
});
