import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { FinanceDashboardDto, TaxReportDto, TaxSettingDto } from '@riad/shared';
import type TestAgent from 'supertest/lib/agent';
import { createApp, createRiad, loginAs, resetDatabase, type RiadFixture } from './fixtures';

const API = '/api/v1';
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

/**
 * Hand-checked April 2026 scenario (3 rooms × 30 days = 90 available nights):
 * - stay 1: 29 Mar → 2 Apr, 1 100 MAD TTC/night, Booking, commission 300 MAD (1 night in April)
 * - stay 2: 10 → 12 Apr, 2 200 MAD TTC/night, direct (2 nights), dinner 220 MAD TTC
 * - a pending and a cancelled stay in April that must be ignored
 * - expense 500 MAD TTC incl. 83,33 MAD deductible TVA
 * With TVA 10 %: accommodation HT = 1 000 + 4 000 = 5 000 MAD, extras HT 200 MAD.
 */
describe('Finance dashboard & taxes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let a: RiadFixture;
  let b: RiadFixture;
  let managerA: TestAgent;
  let receptionA: TestAgent;
  let ownerB: TestAgent;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await resetDatabase(prisma);
    a = await createRiad(prisma, 'Riad A');
    b = await createRiad(prisma, 'Riad B');
    const riadId = a.riadId;
    await prisma.taxSetting.create({ data: { riadId, code: 'TVA_ACCOMMODATION', mode: 'PERCENT', value: 1000, validFrom: d('2020-01-01') } });
    const stay = (roomIdx: number, inD: string, outD: string, nights: number, price: number, status: 'CHECKED_OUT' | 'CHECKED_IN' | 'PENDING' | 'CANCELLED', extra: object = {}) =>
      prisma.stay.create({
        data: {
          riadId,
          roomId: a.rooms[roomIdx]!.id,
          checkInDate: d(inD),
          checkOutDate: d(outD),
          nights,
          pricePerNight: price,
          totalAccommodation: price * nights,
          status,
          ...extra,
        },
      });
    await stay(0, '2026-03-29', '2026-04-02', 4, 110000, 'CHECKED_OUT', { source: 'BOOKING', otaCommission: 30000 });
    const s2 = await stay(1, '2026-04-10', '2026-04-12', 2, 220000, 'CHECKED_IN', { source: 'DIRECT' });
    await stay(2, '2026-04-05', '2026-04-08', 3, 999900, 'PENDING');
    await stay(2, '2026-04-15', '2026-04-18', 3, 999900, 'CANCELLED');
    await prisma.stayExtra.create({
      data: { riadId, stayId: s2.id, label: 'Dîner', category: 'FOOD', quantity: 1, unitPrice: 22000, total: 22000, createdAt: new Date('2026-04-10T19:00:00Z') },
    });
    const cat = await prisma.expenseCategory.create({ data: { riadId, key: 'MAINTENANCE', nameFr: 'Entretien', nameAr: 'الصيانة', icon: 'wrench' } });
    await prisma.expense.create({ data: { riadId, categoryId: cat.id, amountTtc: 50000, tvaAmount: 8333, date: d('2026-04-20') } });
    // Invoices issued in April (2) and May (1) for the tax report.
    const invoice = (seq: number, date: string, ht: number, tva: number, sejour: number) =>
      prisma.invoice.create({
        data: {
          riadId,
          stayId: s2.id,
          number: `A-2026-${seq}`,
          year: 2026,
          sequence: seq,
          totalHt: ht,
          tvaAmount: tva,
          taxeSejour: sejour,
          tpt: 0,
          totalTtc: ht + tva + sejour,
          breakdown: { ratesDate: date, tvaByRate: [{ rate: 1000, base: ht, tva }] },
        },
      });
    await invoice(1, '2026-04-02', 400000, 40000, 6000);
    await invoice(2, '2026-04-30', 100000, 10000, 0);
    await invoice(3, '2026-05-01', 999900, 99990, 0);

    app = await createApp();
    managerA = await loginAs(app, a.emails.MANAGER);
    receptionA = await loginAs(app, a.emails.RECEPTION);
    ownerB = await loginAs(app, b.emails.OWNER);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('keeps finance away from reception', async () => {
    await receptionA.get(`${API}/finance/dashboard?from=2026-04-01&to=2026-04-30`).expect(403);
    await receptionA.get(`${API}/tax-settings`).expect(403);
    await receptionA.get(`${API}/tax-report?month=2026-04`).expect(403);
  });

  it('computes revenue, expenses and hotel KPIs for the period', async () => {
    const res = await managerA.get(`${API}/finance/dashboard?from=2026-04-01&to=2026-04-30`).expect(200);
    const dash = res.body as FinanceDashboardDto;
    expect(dash.current).toMatchObject({
      accommodationRevenue: 500000,
      extrasRevenue: 20000,
      revenue: 520000,
      expenses: 41667,
      profit: 478333,
      occupiedNights: 3,
      availableNights: 90,
      adr: 166667,
      revpar: 5556,
      costPerOccupiedNight: 13889,
    });
    expect(dash.current.occupancy).toBeCloseTo(3 / 90);
    expect(dash.current.margin).toBeCloseTo(478333 / 520000);
    // Booking: 1 of 4 nights in April -> 1/4 of the 300 MAD commission.
    expect(dash.bySource).toEqual([
      { source: 'DIRECT', revenue: 400000, commission: 0, net: 400000 },
      { source: 'BOOKING', revenue: 100000, commission: 7500, net: 92500 },
    ]);
    expect(dash.extrasByCategory).toEqual([{ category: 'FOOD', amount: 20000 }]);
    expect(dash.expensesByCategory[0]).toMatchObject({ nameFr: 'Entretien', amount: 41667 });
    // March holds the 3 other Booking nights.
    expect(dash.previous).toMatchObject({ from: '2026-03-02', to: '2026-03-31', accommodationRevenue: 300000, occupiedNights: 3 });
    expect(dash.months.map((m) => m.month)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04']);
  });

  it('rejects invalid periods and isolates riads', async () => {
    const bad = await managerA.get(`${API}/finance/dashboard?from=2026-05-01&to=2026-04-01`).expect(400);
    expect(bad.body.code).toBe('INVALID_DATES');
    const other = await ownerB.get(`${API}/finance/dashboard?from=2026-04-01&to=2026-04-30`).expect(200);
    expect(other.body.current.revenue).toBe(0);
  });

  it('exports the P&L as Excel and PDF', async () => {
    const xlsx = await managerA.get(`${API}/finance/pnl/export?to=2026-04-30&format=xlsx`).responseType('blob').expect(200);
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    const pdf = await managerA.get(`${API}/finance/pnl/export?to=2026-04-30&format=pdf`).responseType('blob').expect(200);
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.headers['content-disposition']).toContain('compte-resultat_2026-04.pdf');
  });

  describe('tax settings', () => {
    it('adds a rate and closes the previous open-ended one', async () => {
      await managerA
        .post(`${API}/tax-settings`)
        .send({ code: 'TAXE_SEJOUR', mode: 'PER_PERSON_PER_NIGHT', value: 1500, validFrom: '2026-01-01' })
        .expect(201);
      await managerA
        .post(`${API}/tax-settings`)
        .send({ code: 'TVA_ACCOMMODATION', mode: 'PERCENT', value: 1200, validFrom: '2027-01-01' })
        .expect(201);
      const list = (await managerA.get(`${API}/tax-settings`).expect(200)).body as TaxSettingDto[];
      const tva = list.filter((s) => s.code === 'TVA_ACCOMMODATION');
      expect(tva.map((s) => [s.value, s.validFrom, s.validTo])).toEqual([
        [1200, '2027-01-01', null],
        [1000, '2020-01-01', '2026-12-31'],
      ]);
      expect(await prisma.auditLog.count({ where: { riadId: a.riadId, action: 'tax_setting.create' } })).toBe(2);
    });

    it('refuses overlapping periods and nonsense rates', async () => {
      const overlap = await managerA
        .post(`${API}/tax-settings`)
        .send({ code: 'TAXE_SEJOUR', mode: 'PER_PERSON_PER_NIGHT', value: 2000, validFrom: '2025-06-01', validTo: '2026-06-01' })
        .expect(409);
      expect(overlap.body.code).toBe('TAX_PERIOD_OVERLAP');
      const tvaPerPerson = await managerA
        .post(`${API}/tax-settings`)
        .send({ code: 'TVA_FOOD', mode: 'PER_PERSON_PER_NIGHT', value: 10, validFrom: '2026-01-01' })
        .expect(400);
      expect(tvaPerPerson.body.code).toBe('INVALID_RATE');
      await managerA.post(`${API}/tax-settings`).send({ code: 'TVA_FOOD', mode: 'PERCENT', value: 10001, validFrom: '2026-01-01' }).expect(400);
    });
  });

  it('builds the monthly tax report from invoices issued in the month', async () => {
    const r = (await managerA.get(`${API}/tax-report?month=2026-04`).expect(200)).body as TaxReportDto;
    expect(r).toMatchObject({
      invoiceCount: 2,
      totalHt: 500000,
      tvaCollected: 50000,
      tvaDeductible: 8333,
      tvaDue: 41667,
      taxeSejour: 6000,
      tpt: 0,
      tvaByRate: [{ rate: 1000, base: 500000, tva: 50000 }],
    });
    const xlsx = await managerA.get(`${API}/tax-report/export?month=2026-04`).responseType('blob').expect(200);
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    await managerA.get(`${API}/tax-report?month=2026-13`).expect(400);
  });
});
