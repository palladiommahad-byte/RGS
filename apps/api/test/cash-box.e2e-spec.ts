import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { addDays, todayIso, type CashBoxReportDto, type CashWalletDto, type NotificationListDto } from '@riad/shared';
import type TestAgent from 'supertest/lib/agent';
import { createApp, createRiad, loginAs, resetDatabase, type RiadFixture } from './fixtures';

const API = '/api/v1';

describe('Cash box: every movement, guest cash included (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let a: RiadFixture;
  let manager: TestAgent;
  let reception: TestAgent;
  let housekeeping: TestAgent;
  let boxId: string;
  let stayId: string;
  let cashPaymentId: string;
  const today = todayIso();

  const balance = async (id = boxId) => (await prisma.cashWallet.findUniqueOrThrow({ where: { id } })).balance;
  const report = async (query = '', agent = reception, id = boxId) =>
    (await agent.get(`${API}/cash-wallets/${id}/movements${query}`).expect(200)).body as CashBoxReportDto;
  const pay = (agent: TestAgent, amount: number, method: string, extra: Record<string, unknown> = {}) =>
    agent.post(`${API}/stays/${stayId}/payments`).send({ amount, method, ...extra });

  beforeAll(async () => {
    prisma = new PrismaClient();
    await resetDatabase(prisma);
    a = await createRiad(prisma, 'Riad A');
    app = await createApp();
    manager = await loginAs(app, a.emails.MANAGER);
    reception = await loginAs(app, a.emails.RECEPTION);
    housekeeping = await loginAs(app, a.emails.HOUSEKEEPING);

    const receptionUser = await prisma.user.findUniqueOrThrow({ where: { email: a.emails.RECEPTION } });
    boxId = ((await manager.post(`${API}/cash-wallets`).send({ holderId: receptionUser.id, name: 'Caisse réception' }).expect(201)).body as CashWalletDto).id;
    await manager.post(`${API}/cash-wallets/${boxId}/top-up`).send({ amount: 50000, note: 'Fonds' }).expect(201);
    stayId = (
      await reception
        .post(`${API}/stays`)
        .send({
          source: 'DIRECT',
          checkInDate: today,
          checkOutDate: addDays(today, 2),
          adults: 1,
          children: 0,
          pricePerNight: 90000,
          roomId: a.rooms[0]!.id,
          checkInNow: true,
          mainGuest: { firstName: 'Karim', lastName: 'Test' },
        })
        .expect(201)
    ).body.id as string;
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('puts guest cash into the cash box of whoever received it', async () => {
    cashPaymentId = (await pay(reception, 90000, 'CASH').expect(201)).body.id as string;
    expect(await balance()).toBe(140000);
    // Card and transfers never touch the box.
    await pay(reception, 30000, 'CARD').expect(201);
    expect(await balance()).toBe(140000);

    const notes = (await manager.get(`${API}/notifications`).expect(200)).body as NotificationListDto;
    expect(notes.items[0]).toMatchObject({
      type: 'CASH',
      actor: 'RECEPTION Riad A',
      data: { kind: 'GUEST_PAYMENT', amount: 90000, balance: 140000, note: 'Karim Test · Room 1', walletName: 'Caisse réception' },
    });
  });

  it('lists every movement with the balance after it and the period totals', async () => {
    const category = await prisma.expenseCategory.create({ data: { riadId: a.riadId, key: 'FOOD', nameFr: 'Alimentation', nameAr: 'غذاء', icon: 'package' } });
    await reception.post(`${API}/expenses`).send({ amountTtc: 12000, categoryId: category.id, paymentMethod: 'PETTY_CASH', walletId: boxId, supplierName: 'Épicerie' }).expect(201);

    const r = await report();
    expect(r.items.map((m) => [m.type, m.amount, m.balanceAfter])).toEqual([
      ['EXPENSE', -12000, 128000],
      ['PAYMENT', 90000, 140000],
      ['TOP_UP', 50000, 50000],
    ]);
    expect(r.items[0]!.expense).toMatchObject({ categoryKey: 'FOOD', supplier: 'Épicerie' });
    expect(r.items[1]!.payment).toMatchObject({ id: cashPaymentId, stayId, guestName: 'Karim Test', roomName: 'Room 1' });
    expect(r.items[1]!.createdBy).toMatchObject({ name: 'RECEPTION Riad A' });
    expect(r.totals).toEqual({ in: 140000, out: 12000, byType: { TOP_UP: 50000, PAYMENT: 90000, EXPENSE: -12000, ADJUSTMENT: 0 } });

    // A type filter keeps the true running balance and the period totals.
    const payments = await report('?type=PAYMENT');
    expect(payments.items.map((m) => m.balanceAfter)).toEqual([140000]);
    expect(payments.totals.in).toBe(140000);
    expect((await report(`?from=${addDays(today, 1)}`)).total).toBe(0);
    await reception.get(`${API}/cash-wallets/${boxId}/movements?type=GIFT`).expect(400);
    await housekeeping.get(`${API}/cash-wallets/${boxId}/movements`).expect(403);
  });

  it('takes the cash back out when the payment is deleted, if it is still there', async () => {
    await reception.delete(`${API}/stays/${stayId}/payments/${cashPaymentId}`).expect(204);
    expect(await balance()).toBe(38000);
    expect(await prisma.cashMovement.count({ where: { paymentId: cashPaymentId } })).toBe(0);

    // 20 000 received, then the box is counted down to 10 000: the payment can't be undone.
    const id = (await pay(reception, 20000, 'CASH').expect(201)).body.id as string;
    await manager.post(`${API}/cash-wallets/${boxId}/adjust`).send({ amount: -48000, note: 'Count' }).expect(201);
    const res = await reception.delete(`${API}/stays/${stayId}/payments/${id}`).expect(409);
    expect(res.body.code).toBe('INSUFFICIENT_FUNDS');
    expect(await prisma.payment.count({ where: { id } })).toBe(1);
  });

  it('uses the only box when the receiver has none, else the one chosen', async () => {
    // Manager has no box; the riad has one: cash goes there.
    const before = await balance();
    await pay(manager, 5000, 'CASH').expect(201);
    expect(await balance()).toBe(before + 5000);

    // Two boxes: the manager's own is used; reception may not pick someone else's.
    const managerUser = await prisma.user.findUniqueOrThrow({ where: { email: a.emails.MANAGER } });
    const other = ((await manager.post(`${API}/cash-wallets`).send({ holderId: managerUser.id, name: 'Coffre' }).expect(201)).body as CashWalletDto).id;
    await pay(manager, 7000, 'CASH').expect(201);
    expect(await balance(other)).toBe(7000);
    await pay(manager, 3000, 'CASH', { walletId: boxId }).expect(201);
    expect(await balance()).toBe(before + 8000);
    const refused = await pay(reception, 1000, 'CASH', { walletId: other }).expect(403);
    expect(refused.body.code).toBe('FORBIDDEN');
  });
});
