import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { addDays, addMonths, todayIso, type CashWalletDto, type ExpenseDto, type ExpenseListDto } from '@riad/shared';
import sharp from 'sharp';
import type TestAgent from 'supertest/lib/agent';
import { RecurringService } from '../src/expenses/recurring.service';
import { StorageService } from '../src/storage/storage.service';
import { createApp, createRiad, FakeStorage, loginAs, resetDatabase, type RiadFixture } from './fixtures';

const API = '/api/v1';

describe('Expenses, suppliers, petty cash, recurring (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let storage: FakeStorage;
  let a: RiadFixture;
  let b: RiadFixture;
  let managerA: TestAgent;
  let receptionA: TestAgent;
  let housekeepingA: TestAgent;
  let ownerB: TestAgent;
  const cat: Record<string, string> = {};
  let walletId: string;
  let pettyExpenseId: string;

  const walletBalance = async () => (await prisma.cashWallet.findUniqueOrThrow({ where: { id: walletId } })).balance;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await resetDatabase(prisma);
    a = await createRiad(prisma, 'Riad A');
    b = await createRiad(prisma, 'Riad B');
    for (const key of ['FOOD', 'CLEANING', 'UTILITIES']) {
      cat[key] = (
        await prisma.expenseCategory.create({ data: { riadId: a.riadId, key, nameFr: key, nameAr: key, icon: 'package' } })
      ).id;
    }
    await prisma.expenseCategory.create({ data: { riadId: b.riadId, key: 'FOOD', nameFr: 'FOOD', nameAr: 'FOOD', icon: 'package' } });

    storage = new FakeStorage();
    app = await createApp((builder) => builder.overrideProvider(StorageService).useValue(storage));
    managerA = await loginAs(app, a.emails.MANAGER);
    receptionA = await loginAs(app, a.emails.RECEPTION);
    housekeepingA = await loginAs(app, a.emails.HOUSEKEEPING);
    ownerB = await loginAs(app, b.emails.OWNER);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('keeps housekeeping out of expenses', async () => {
    await housekeepingA.get(`${API}/expenses`).expect(403);
    await housekeepingA.get(`${API}/expense-categories`).expect(403);
    await housekeepingA.get(`${API}/cash-wallets`).expect(403);
    const cats = await receptionA.get(`${API}/expense-categories`).expect(200);
    expect(cats.body).toHaveLength(3);
  });

  it('creates a supplier on the fly that remembers its category', async () => {
    const res = await managerA
      .post(`${API}/expenses`)
      .send({ amountTtc: 45000, tvaAmount: 7500, categoryId: cat.FOOD, supplierName: 'Épicerie Test', paymentMethod: 'CARD' })
      .expect(201);
    expect(res.body).toMatchObject({ amountTtc: 45000, paymentMethod: 'CARD', supplier: { name: 'Épicerie Test' }, source: 'MANUAL' });
    const again = await managerA
      .post(`${API}/expenses`)
      .send({ amountTtc: 1000, categoryId: cat.FOOD, supplierName: 'EPICERIE test' })
      .expect(201);
    expect(again.body.supplier.id).toBe(res.body.supplier.id); // same supplier despite case and accents
    // Accent- and case-insensitive: typing without accents on a phone still finds it.
    const sup = await receptionA.get(`${API}/suppliers?search=EPIC`).expect(200);
    expect(sup.body.items[0]).toMatchObject({ name: 'Épicerie Test', defaultCategoryId: cat.FOOD, expenseCount: 2 });
  });

  it('rejects TVA above the amount', async () => {
    const res = await managerA.post(`${API}/expenses`).send({ amountTtc: 100, tvaAmount: 200, categoryId: cat.FOOD }).expect(400);
    expect(res.body.code).toBe('INVALID_AMOUNT');
  });

  describe('petty cash', () => {
    it('refuses reception expenses until they have a wallet', async () => {
      const res = await receptionA.post(`${API}/expenses`).send({ amountTtc: 1000, categoryId: cat.FOOD }).expect(403);
      expect(res.body.code).toBe('NO_WALLET');
    });

    it('lets the manager open and top up a wallet', async () => {
      const users = await managerA.get(`${API}/cash-wallets/holders`).expect(200);
      const receptionUser = (users.body as { id: string; name: string }[]).find((u) => u.name.includes('RECEPTION'))!;
      const w = await managerA.post(`${API}/cash-wallets`).send({ holderId: receptionUser.id, name: 'Caisse réception' }).expect(201);
      walletId = w.body.id;
      await receptionA.post(`${API}/cash-wallets/${walletId}/top-up`).send({ amount: 50000 }).expect(403);
      const topped = await managerA.post(`${API}/cash-wallets/${walletId}/top-up`).send({ amount: 50000, note: 'Fonds' }).expect(201);
      expect((topped.body as CashWalletDto).balance).toBe(50000);
      const mine = await receptionA.get(`${API}/cash-wallets`).expect(200);
      expect(mine.body.map((x: CashWalletDto) => x.id)).toEqual([walletId]);
    });

    it('debits the wallet when reception records an expense (always petty cash)', async () => {
      const res = await receptionA
        .post(`${API}/expenses`)
        .send({ amountTtc: 12000, categoryId: cat.CLEANING, paymentMethod: 'CARD', note: 'Javel' })
        .expect(201);
      const e = res.body as ExpenseDto;
      pettyExpenseId = e.id;
      expect(e).toMatchObject({ paymentMethod: 'PETTY_CASH', wallet: { id: walletId } });
      expect(await walletBalance()).toBe(38000);
      const moves = await receptionA.get(`${API}/cash-wallets/${walletId}/movements`).expect(200);
      expect(moves.body.items.map((m: { type: string; amount: number }) => [m.type, m.amount])).toEqual([
        ['EXPENSE', -12000],
        ['TOP_UP', 50000],
      ]);
    });

    it('never lets a wallet go negative', async () => {
      const res = await receptionA.post(`${API}/expenses`).send({ amountTtc: 40000, categoryId: cat.FOOD }).expect(409);
      expect(res.body).toMatchObject({ code: 'INSUFFICIENT_FUNDS', details: { balance: 38000 } });
      await managerA.post(`${API}/cash-wallets/${walletId}/adjust`).send({ amount: -99999, note: 'x' }).expect(409);
      await managerA.post(`${API}/cash-wallets/${walletId}/adjust`).send({ amount: -1000, note: 'Comptage' }).expect(201);
      expect(await walletBalance()).toBe(37000);
    });

    it('shows reception only their own expenses; managers see everything with a total', async () => {
      const own = (await receptionA.get(`${API}/expenses`).expect(200)).body as ExpenseListDto;
      expect(own.items.map((e) => e.id)).toEqual([pettyExpenseId]);
      const all = (await managerA.get(`${API}/expenses?limit=50`).expect(200)).body as ExpenseListDto;
      expect(all.total).toBe(3);
      expect(all.sumTtc).toBe(45000 + 1000 + 12000);
      // Per-category totals cover the whole period and add up to the total.
      expect(all.byCategory.reduce((n, c) => n + c.amount, 0)).toBe(all.sumTtc);
      expect(all.byCategory.find((c) => c.categoryId === cat.FOOD)?.amount).toBe(46000);
      expect(all.sumTva).toBeGreaterThanOrEqual(0);
      const food = (await managerA.get(`${API}/expenses?categoryId=${cat.FOOD}`).expect(200)).body as ExpenseListDto;
      expect(food.sumTtc).toBe(46000);
      const byWallet = (await managerA.get(`${API}/expenses?walletId=${walletId}`).expect(200)).body as ExpenseListDto;
      expect(byWallet.total).toBe(1);
      const future = (await managerA.get(`${API}/expenses?from=${addDays(todayIso(), 1)}`).expect(200)).body as ExpenseListDto;
      expect(future.total).toBe(0);
    });

    it('lets only managers edit or delete, keeping the wallet in sync', async () => {
      await receptionA.patch(`${API}/expenses/${pettyExpenseId}`).send({ amountTtc: 1 }).expect(403);
      await receptionA.delete(`${API}/expenses/${pettyExpenseId}`).expect(403);
      await managerA.patch(`${API}/expenses/${pettyExpenseId}`).send({ amountTtc: 15000 }).expect(200);
      expect(await walletBalance()).toBe(34000);
      const move = await prisma.cashMovement.findFirstOrThrow({ where: { expenseId: pettyExpenseId } });
      expect(move.amount).toBe(-15000);
      const locked = await managerA.patch(`${API}/expenses/${pettyExpenseId}`).send({ paymentMethod: 'CASH' }).expect(409);
      expect(locked.body.code).toBe('METHOD_LOCKED');
    });

    it('stores receipts privately and serves them through signed links', async () => {
      const jpeg = await sharp({ create: { width: 300, height: 500, channels: 3, background: '#fff' } }).jpeg().toBuffer();
      const res = await receptionA
        .post(`${API}/expenses/${pettyExpenseId}/receipt`)
        .attach('file', jpeg, { filename: 'ticket.jpg', contentType: 'image/jpeg' })
        .expect(201);
      expect(res.body.hasReceipt).toBe(true);
      expect(storage.keys('receipts', `riads/${a.riadId}/receipts/`)).toHaveLength(1);
      const url = await receptionA.get(`${API}/expenses/${pettyExpenseId}/receipt`).expect(200);
      expect(url.body.url).toContain(`${pettyExpenseId}.jpg`);
      const bad = await receptionA
        .post(`${API}/expenses/${pettyExpenseId}/receipt`)
        .attach('file', Buffer.from('hello'), { filename: 'x.txt', contentType: 'text/plain' })
        .expect(400);
      expect(bad.body.code).toBe('UNSUPPORTED_FILE');
      await ownerB.get(`${API}/expenses/${pettyExpenseId}/receipt`).expect(404);
    });

    it('refunds the wallet and deletes the receipt when an expense is deleted', async () => {
      await managerA.delete(`${API}/expenses/${pettyExpenseId}`).expect(204);
      expect(await walletBalance()).toBe(49000);
      expect(await prisma.cashMovement.count({ where: { expenseId: pettyExpenseId } })).toBe(0);
      expect(storage.keys('receipts', `riads/${a.riadId}/receipts/`)).toHaveLength(0);
    });
  });

  describe('recurring expenses', () => {
    it('generates each month once (idempotent)', async () => {
      const day = Number(todayIso().slice(8, 10));
      await managerA
        .post(`${API}/recurring-expenses`)
        .send({ label: 'Internet', categoryId: cat.UTILITIES, amount: 49900, dayOfMonth: 31, paymentMethod: 'PETTY_CASH' })
        .expect(400);
      const r = await managerA
        .post(`${API}/recurring-expenses`)
        .send({ label: 'Internet', categoryId: cat.UTILITIES, amount: 49900, dayOfMonth: day, supplierName: 'Opérateur' })
        .expect(201);
      expect(r.body.supplier.name).toBe('Opérateur');
      await receptionA.post(`${API}/recurring-expenses/run`).expect(403);
      expect((await managerA.post(`${API}/recurring-expenses/run`).expect(200)).body.created).toBe(1);
      expect((await managerA.post(`${API}/recurring-expenses/run`).expect(200)).body.created).toBe(0);
      const list = (await managerA.get(`${API}/expenses?categoryId=${cat.UTILITIES}`).expect(200)).body as ExpenseListDto;
      expect(list.items[0]).toMatchObject({ amountTtc: 49900, source: 'RECURRING', note: 'Internet', date: todayIso() });

      // Next month the night job creates the next one: the same day of the month (or the
      // last day, when next month is shorter).
      const svc = app.get(RecurringService);
      const nextMonth = addMonths(todayIso(), 1);
      const lastDay = Number(addDays(addMonths(nextMonth, 1), -1).slice(8, 10));
      expect(await svc.generateDue(a.riadId, addDays(nextMonth, Math.min(day, lastDay) - 1))).toBe(1);

      const recurring = await managerA.get(`${API}/recurring-expenses`).expect(200);
      expect(recurring.body.items[0].lastGenerated).not.toBeNull();
      const del = await managerA.delete(`${API}/recurring-expenses/${r.body.id}`).expect(200);
      expect(del.body).toEqual({ deleted: false, deactivated: true });
    });
  });

  describe('tenant isolation', () => {
    it("never shows or touches another riad's expenses, suppliers or wallets", async () => {
      const list = (await ownerB.get(`${API}/expenses`).expect(200)).body as ExpenseListDto;
      expect(list.total).toBe(0);
      expect((await ownerB.get(`${API}/suppliers`).expect(200)).body.total).toBe(0);
      await ownerB.post(`${API}/cash-wallets/${walletId}/top-up`).send({ amount: 1 }).expect(404);
      await ownerB.post(`${API}/expenses`).send({ amountTtc: 100, categoryId: cat.FOOD }).expect(404);
      const sup = await managerA.get(`${API}/suppliers?search=picerie`).expect(200);
      await ownerB.delete(`${API}/suppliers/${sup.body.items[0].id}`).expect(404);
      const inUse = await managerA.delete(`${API}/suppliers/${sup.body.items[0].id}`).expect(409);
      expect(inUse.body.code).toBe('SUPPLIER_IN_USE');
    });
  });
});
