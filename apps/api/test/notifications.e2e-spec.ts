import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { addDays, todayIso, zonedMidnight, type NotificationListDto } from '@riad/shared';
import type TestAgent from 'supertest/lib/agent';
import { NotificationsService } from '../src/notifications/notifications.service';
import { createApp, createRiad, loginAs, resetDatabase, type RiadFixture } from './fixtures';

const API = '/api/v1';
const HOUR = 3_600_000;

describe('Notification center (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let a: RiadFixture;
  let b: RiadFixture;
  let owner: TestAgent;
  let manager: TestAgent;
  let reception: TestAgent;
  let housekeeping: TestAgent;
  let ownerB: TestAgent;
  const today = todayIso();

  const list = async (agent: TestAgent, query = '') => (await agent.get(`${API}/notifications${query}`).expect(200)).body as NotificationListDto;
  const types = async (agent: TestAgent) => (await list(agent)).items.map((n) => n.type);
  const checkIn = async (roomIndex: number, checkOutDate: string) =>
    (
      await reception
        .post(`${API}/stays`)
        .send({
          source: 'DIRECT',
          checkInDate: today,
          checkOutDate,
          adults: 1,
          children: 0,
          pricePerNight: 50000,
          roomId: a.rooms[roomIndex]!.id,
          checkInNow: true,
          mainGuest: { firstName: 'Lena', lastName: 'Vogel', nationality: 'AUT', documentType: 'PASSPORT', documentNumber: `P${roomIndex}${checkOutDate}` },
        })
        .expect(201)
    ).body.id as string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await resetDatabase(prisma);
    a = await createRiad(prisma, 'Riad A');
    b = await createRiad(prisma, 'Riad B');
    app = await createApp();
    owner = await loginAs(app, a.emails.OWNER);
    manager = await loginAs(app, a.emails.MANAGER);
    reception = await loginAs(app, a.emails.RECEPTION);
    housekeeping = await loginAs(app, a.emails.HOUSEKEEPING);
    ownerB = await loginAs(app, b.emails.OWNER);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('tells the team about a check-in, never the person who did it', async () => {
    await checkIn(0, addDays(today, 3));
    const forOwner = await list(owner);
    expect(forOwner.items).toHaveLength(1);
    expect(forOwner.items[0]).toMatchObject({
      type: 'CHECKIN',
      read: false,
      actor: 'RECEPTION Riad A',
      data: { roomName: 'Room 1', guestName: 'Lena Vogel', nights: 3 },
    });
    expect(forOwner.unread).toBe(1);
    expect(await types(reception)).toEqual([]);
    // Housekeeping follows occupancy, without guest names.
    const forHousekeeping = await list(housekeeping);
    expect(forHousekeeping.items[0]).toMatchObject({ type: 'CHECKIN', data: { roomName: 'Room 1', guestName: null } });
    expect(await types(ownerB)).toEqual([]);
  });

  it('announces every check-out (with the balance still owed)', async () => {
    const stayId = await checkIn(1, addDays(today, 2));
    await reception.post(`${API}/stays/${stayId}/checkout`).send({ acceptBalanceDue: true }).expect(200);
    const [latest] = (await list(manager)).items;
    expect(latest).toMatchObject({ type: 'CHECKOUT', data: { stayId, roomName: 'Room 2' } });
    expect((latest!.data as { balance?: number }).balance).toBeGreaterThan(0);
    expect((await list(housekeeping)).items[0]).toMatchObject({ type: 'CHECKOUT', data: { roomName: 'Room 2', guestName: null } });
  });

  it('reminds the team 24 h before a check-out, once', async () => {
    const stayId = await checkIn(2, addDays(today, 1));
    const service = app.get(NotificationsService);
    const due = zonedMidnight(addDays(today, 1)).getTime() - 12 * HOUR; // noon today, riad time
    expect(await service.sendCheckoutReminders(new Date(due - 60_000))).toBe(0);
    expect(await service.sendCheckoutReminders(new Date(due + 60_000))).toBe(1);
    expect(await service.sendCheckoutReminders(new Date(due + 2 * HOUR))).toBe(0);
    // A job sent it: everyone concerned sees it, reception included.
    for (const agent of [owner, reception, housekeeping]) {
      expect((await list(agent)).items[0]).toMatchObject({ type: 'CHECKOUT_SOON', actor: null, data: { stayId, roomName: 'Room 3' } });
    }
  });

  it('reports every cash box movement to managers and to the holder', async () => {
    const receptionUser = await prisma.user.findUniqueOrThrow({ where: { email: a.emails.RECEPTION } });
    const wallet = (await manager.post(`${API}/cash-wallets`).send({ holderId: receptionUser.id, name: 'Caisse réception' }).expect(201)).body as { id: string };
    await manager.post(`${API}/cash-wallets/${wallet.id}/top-up`).send({ amount: 50000, note: 'Fonds' }).expect(201);

    const forHolder = (await list(reception)).items[0];
    expect(forHolder).toMatchObject({
      type: 'CASH',
      actor: 'MANAGER Riad A',
      data: { walletName: 'Caisse réception', kind: 'TOP_UP', amount: 50000, balance: 50000, note: 'Fonds' },
    });
    expect((await list(owner)).items[0]).toMatchObject({ type: 'CASH', data: { kind: 'TOP_UP' } });
    expect(await types(manager)).not.toContain('CASH'); // their own action
    expect(await types(housekeeping)).not.toContain('CASH');

    // Spending from the box (by its holder) reaches the managers.
    const category = await prisma.expenseCategory.create({ data: { riadId: a.riadId, key: 'FOOD', nameFr: 'FOOD', nameAr: 'FOOD', icon: 'package' } });
    await reception
      .post(`${API}/expenses`)
      .send({ amountTtc: 12000, categoryId: category.id, paymentMethod: 'PETTY_CASH', walletId: wallet.id, supplierName: 'Épicerie' })
      .expect(201);
    expect((await list(manager)).items[0]).toMatchObject({
      type: 'CASH',
      actor: 'RECEPTION Riad A',
      data: { kind: 'EXPENSE', amount: -12000, balance: 38000, note: 'Épicerie' },
    });
  });

  it('keeps a read state per person', async () => {
    const before = await list(owner);
    expect(before.unread).toBeGreaterThan(1);
    const first = before.items[0]!;
    expect((await owner.post(`${API}/notifications/${first.id}/read`).expect(200)).body).toEqual({ unread: before.unread - 1 });
    expect((await list(owner)).items[0]!.read).toBe(true);
    expect((await list(owner, '?unread=true')).items.map((n) => n.id)).not.toContain(first.id);
    // Someone else's state is untouched.
    expect((await list(manager)).items.find((n) => n.id === first.id)?.read ?? false).toBe(false);

    expect((await owner.post(`${API}/notifications/read-all`).expect(200)).body).toEqual({ unread: 0 });
    expect((await list(owner)).unread).toBe(0);
    // Reading what you cannot see does nothing.
    expect((await ownerB.post(`${API}/notifications/${first.id}/read`).expect(200)).body).toEqual({ unread: 0 });
    await owner.post(`${API}/notifications/not-a-uuid/read`).expect(400);
  });

  it('forgets notifications after 90 days', async () => {
    const service = app.get(NotificationsService);
    const total = await prisma.notification.count();
    expect(await service.purgeOld(new Date(Date.now() + 91 * 24 * HOUR))).toBe(total);
  });
});
