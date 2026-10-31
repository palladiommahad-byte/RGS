import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { addDays, todayIso, type PaymentsReportDto } from '@riad/shared';
import type TestAgent from 'supertest/lib/agent';
import { createApp, createRiad, loginAs, resetDatabase, type RiadFixture } from './fixtures';

const API = '/api/v1';

describe('Payments received (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let a: RiadFixture;
  let b: RiadFixture;
  let manager: TestAgent;
  let reception: TestAgent;
  let housekeeping: TestAgent;
  let ownerB: TestAgent;
  let receptionId: string;
  let managerId: string;
  const today = todayIso();

  const report = async (query = '', agent = manager) => (await agent.get(`${API}/payments${query}`).expect(200)).body as PaymentsReportDto;
  const checkIn = async (roomIndex: number, firstName: string) =>
    (
      await reception
        .post(`${API}/stays`)
        .send({
          source: 'DIRECT',
          checkInDate: today,
          checkOutDate: addDays(today, 2),
          adults: 1,
          children: 0,
          pricePerNight: 50000,
          roomId: a.rooms[roomIndex]!.id,
          checkInNow: true,
          mainGuest: { firstName, lastName: 'Guest' },
        })
        .expect(201)
    ).body.id as string;
  const pay = (agent: TestAgent, stayId: string, amount: number, method: string, paidAt?: string) =>
    agent.post(`${API}/stays/${stayId}/payments`).send({ amount, method, ...(paidAt ? { paidAt } : {}) }).expect(201);

  beforeAll(async () => {
    prisma = new PrismaClient();
    await resetDatabase(prisma);
    a = await createRiad(prisma, 'Riad A');
    b = await createRiad(prisma, 'Riad B');
    app = await createApp();
    manager = await loginAs(app, a.emails.MANAGER);
    reception = await loginAs(app, a.emails.RECEPTION);
    housekeeping = await loginAs(app, a.emails.HOUSEKEEPING);
    ownerB = await loginAs(app, b.emails.OWNER);
    receptionId = (await prisma.user.findUniqueOrThrow({ where: { email: a.emails.RECEPTION } })).id;
    managerId = (await prisma.user.findUniqueOrThrow({ where: { email: a.emails.MANAGER } })).id;

    const s1 = await checkIn(0, 'Karim');
    const s2 = await checkIn(1, 'Sofia');
    await pay(reception, s1, 90000, 'CASH');
    await pay(reception, s2, 40000, 'CASH');
    await pay(manager, s2, 60000, 'CARD');
    // Ten days ago: outside a "today" filter.
    await pay(reception, s1, 15000, 'TRANSFER', new Date(Date.now() - 10 * 86_400_000).toISOString());
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('is for staff who take payments or read finance', async () => {
    await housekeeping.get(`${API}/payments`).expect(403);
    await reception.get(`${API}/payments`).expect(200);
  });

  it('lists every payment, newest first, with the guest, the room and who received it', async () => {
    const r = await report();
    expect(r.total).toBe(4);
    expect(r.items[0]).toMatchObject({ amount: 60000, method: 'CARD', receivedBy: { id: managerId }, stay: { guestName: 'Sofia Guest', roomName: 'Room 2' } });
    expect(r.items.at(-1)).toMatchObject({ method: 'TRANSFER', stay: { guestName: 'Karim Guest', roomName: 'Room 1' } });
    expect(r.totals).toEqual({ CASH: 130000, CARD: 60000, TRANSFER: 15000, OTA_COLLECTED: 0, all: 205000, count: 4 });
    expect(r.receivers.map((u) => u.id).sort()).toEqual([managerId, receptionId].sort());
  });

  it('filters by day range, method and person', async () => {
    const day = await report(`?from=${today}&to=${today}`);
    expect(day.total).toBe(3);
    expect(day.totals).toMatchObject({ CASH: 130000, CARD: 60000, TRANSFER: 0, all: 190000 });

    // Method filter narrows the list; the totals keep every method for the period.
    const cash = await report(`?from=${today}&to=${today}&method=CASH`);
    expect(cash.items.map((i) => i.amount)).toEqual([40000, 90000]);
    expect(cash.totals.CARD).toBe(60000);

    const byReception = await report(`?receivedBy=${receptionId}`);
    expect(byReception.total).toBe(3);
    expect(byReception.totals).toMatchObject({ CASH: 130000, CARD: 0, TRANSFER: 15000, all: 145000 });

    expect((await report('?limit=1&page=2')).items).toHaveLength(1);
    await manager.get(`${API}/payments?method=BITCOIN`).expect(400);
    await manager.get(`${API}/payments?from=2026-02-30`).expect(400);
  });

  it('keeps riads apart', async () => {
    const r = await report('', ownerB);
    expect(r).toMatchObject({ total: 0, totals: { all: 0, count: 0 }, receivers: [] });
  });
});
