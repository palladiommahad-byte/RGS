import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { addDays, todayIso, type BillDto, type CheckoutResultDto, type GuestRegisterRowDto } from '@riad/shared';
import type TestAgent from 'supertest/lib/agent';
import { StorageService } from '../src/storage/storage.service';
import { createApp, createRiad, FakeStorage, loginAs, resetDatabase, type RiadFixture } from './fixtures';

const API = '/api/v1';
const year = Number(todayIso().slice(0, 4));

describe('Extras, payments, checkout, invoices, register (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let storage: FakeStorage;
  let a: RiadFixture;
  let b: RiadFixture;
  let receptionA: TestAgent;
  let housekeepingA: TestAgent;
  let ownerB: TestAgent;
  let stayId: string;
  let invoiceId: string;

  const today = todayIso();

  const createCheckedIn = async (roomIndex: number, doc: string) =>
    (
      await receptionA
        .post(`${API}/stays`)
        .send({
          source: 'DIRECT',
          checkInDate: today,
          checkOutDate: addDays(today, 3),
          adults: 2,
          children: 1,
          pricePerNight: 110000,
          roomId: a.rooms[roomIndex]!.id,
          checkInNow: true,
          mainGuest: { firstName: 'Lena', lastName: 'Vogel', nationality: 'AUT', documentType: 'PASSPORT', documentNumber: doc },
        })
        .expect(201)
    ).body.id as string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await resetDatabase(prisma);
    a = await createRiad(prisma, 'Riad A');
    b = await createRiad(prisma, 'Riad B');
    await prisma.riad.update({ where: { id: a.riadId }, data: { invoicePrefix: 'RA', ice: '001234567000089' } });
    const validFrom = new Date('2020-01-01');
    await prisma.taxSetting.createMany({
      data: [
        { riadId: a.riadId, code: 'TVA_ACCOMMODATION', mode: 'PERCENT', value: 1000, validFrom },
        { riadId: a.riadId, code: 'TVA_FOOD', mode: 'PERCENT', value: 2000, validFrom },
        { riadId: a.riadId, code: 'TAXE_SEJOUR', mode: 'PER_PERSON_PER_NIGHT', value: 2500, validFrom },
        { riadId: a.riadId, code: 'TPT', mode: 'PER_PERSON_PER_NIGHT', value: 1000, validFrom },
        // Expired rate: must never be applied.
        { riadId: a.riadId, code: 'TAXE_SEJOUR', mode: 'PER_PERSON_PER_NIGHT', value: 99900, validFrom: new Date('2010-01-01'), validTo: new Date('2019-12-31') },
      ],
    });

    storage = new FakeStorage();
    app = await createApp((builder) => builder.overrideProvider(StorageService).useValue(storage));
    receptionA = await loginAs(app, a.emails.RECEPTION);
    housekeepingA = await loginAs(app, a.emails.HOUSEKEEPING);
    ownerB = await loginAs(app, b.emails.OWNER);
    stayId = await createCheckedIn(0, 'P1234567');
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('adds and removes extras (stays.write only)', async () => {
    const extra = { label: 'Dîner', category: 'FOOD', quantity: 2, unitPrice: 18000 };
    await housekeepingA.post(`${API}/stays/${stayId}/extras`).send(extra).expect(403);
    const dinner = await receptionA.post(`${API}/stays/${stayId}/extras`).send(extra).expect(201);
    expect(dinner.body.total).toBe(36000);
    await receptionA
      .post(`${API}/stays/${stayId}/extras`)
      .send({ label: 'Hammam', category: 'HAMMAM', quantity: 1, unitPrice: 22000 })
      .expect(201);
    const mistake = await receptionA
      .post(`${API}/stays/${stayId}/extras`)
      .send({ label: 'Erreur', category: 'OTHER', quantity: 1, unitPrice: 5000 })
      .expect(201);
    await receptionA.delete(`${API}/stays/${stayId}/extras/${mistake.body.id}`).expect(204);
    await ownerB.post(`${API}/stays/${stayId}/extras`).send(extra).expect(404);
  });

  it('computes the bill with TVA per rate and per-person taxes', async () => {
    const bill = (await receptionA.get(`${API}/stays/${stayId}/bill`).expect(200)).body as BillDto;
    expect(bill.totals).toEqual({
      totalHt: 300000 + 30000 + 20000,
      tvaAmount: 30000 + 6000 + 2000,
      taxeSejour: 2500 * 2 * 3,
      tpt: 1000 * 2 * 3,
      totalTtc: 330000 + 36000 + 22000 + 15000 + 6000,
    });
    expect(bill.tvaByRate).toEqual([
      { rate: 1000, base: 320000, tva: 32000 },
      { rate: 2000, base: 30000, tva: 6000 },
    ]);
    expect(bill).toMatchObject({ paid: 0, balance: 409000, missingRates: [], invoice: null });
  });

  it('refuses to check out while money is owed', async () => {
    const res = await receptionA.post(`${API}/stays/${stayId}/checkout`).send({}).expect(409);
    expect(res.body).toMatchObject({ code: 'BALANCE_DUE', details: { balance: 409000 } });
  });

  it('records payments (payments.write only)', async () => {
    await housekeepingA.post(`${API}/stays/${stayId}/payments`).send({ amount: 1000, method: 'CASH' }).expect(403);
    const cash = await receptionA.post(`${API}/stays/${stayId}/payments`).send({ amount: 200000, method: 'CASH' }).expect(201);
    expect(cash.body.receivedBy.name).toContain('RECEPTION');
    await receptionA.post(`${API}/stays/${stayId}/payments`).send({ amount: 209000, method: 'CARD', note: 'TPE' }).expect(201);
    const typo = await receptionA.post(`${API}/stays/${stayId}/payments`).send({ amount: 5, method: 'CASH' }).expect(201);
    await receptionA.delete(`${API}/stays/${stayId}/payments/${typo.body.id}`).expect(204);
    await receptionA.post(`${API}/stays/${stayId}/payments`).send({ amount: 0, method: 'CASH' }).expect(400);
    const bill = (await receptionA.get(`${API}/stays/${stayId}/bill`).expect(200)).body as BillDto;
    expect(bill).toMatchObject({ paid: 409000, balance: 0 });
  });

  it('checks out: numbered invoice, PDF stored, room to clean', async () => {
    const res = await receptionA.post(`${API}/stays/${stayId}/checkout`).send({}).expect(200);
    const out = res.body as CheckoutResultDto;
    invoiceId = out.invoice.id;
    expect(out.invoice).toMatchObject({ number: `RA-${year}-00001`, totalTtc: 409000 });
    expect(out.balance).toBe(0);

    const room = await prisma.room.findUniqueOrThrow({ where: { id: a.rooms[0]!.id } });
    expect(room.status).toBe('CLEANING');

    const pdfKey = `riads/${a.riadId}/invoices/${year}/RA-${year}-00001.pdf`;
    expect(storage.has('documents', pdfKey)).toBe(true);
    expect(storage.objects.get(`documents/${pdfKey}`)!.subarray(0, 4).toString()).toBe('%PDF');

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice).toMatchObject({ totalHt: 350000, tvaAmount: 38000, taxeSejour: 15000, tpt: 6000, totalTtc: 409000 });
  });

  it('freezes the bill after checkout', async () => {
    const bill = (await receptionA.get(`${API}/stays/${stayId}/bill`).expect(200)).body as BillDto;
    expect(bill.invoice?.number).toBe(`RA-${year}-00001`);
    expect(bill.totals.totalTtc).toBe(409000);
    const extra = await receptionA
      .post(`${API}/stays/${stayId}/extras`)
      .send({ label: 'Late', category: 'OTHER', quantity: 1, unitPrice: 100 })
      .expect(409);
    expect(extra.body.code).toBe('STAY_LOCKED');
    const detail = await receptionA.get(`${API}/stays/${stayId}`).expect(200);
    const res = await receptionA.delete(`${API}/stays/${stayId}/payments/${detail.body.payments[0].id}`).expect(409);
    expect(res.body.code).toBe('PAYMENT_LOCKED');
    await receptionA.post(`${API}/stays/${stayId}/checkout`).send({}).expect(409);
  });

  it('numbers invoices sequentially and allows a documented balance due', async () => {
    const second = await createCheckedIn(1, 'P7654321');
    const res = await receptionA.post(`${API}/stays/${second}/checkout`).send({ acceptBalanceDue: true }).expect(200);
    expect(res.body.invoice.number).toBe(`RA-${year}-00002`);
    expect(res.body.balance).toBe(330000 + 15000 + 6000);
    expect(await prisma.auditLog.count({ where: { entityId: second, action: 'stay.checkout_balance_due' } })).toBe(1);
  });

  it('serves the PDF through a signed link, scoped to the riad', async () => {
    const res = await receptionA.get(`${API}/invoices/${invoiceId}/pdf`).expect(200);
    expect(res.body.url).toContain(`RA-${year}-00001.pdf`);
    await ownerB.get(`${API}/invoices/${invoiceId}/pdf`).expect(404);
  });

  describe('guest register', () => {
    it('lists guests who stayed, with decrypted document numbers', async () => {
      // A pending check-in must not appear in the police register.
      await receptionA
        .post(`${API}/stays`)
        .send({ source: 'DIRECT', checkInDate: today, checkOutDate: addDays(today, 1), adults: 1, children: 0, pricePerNight: 0, mainGuest: { firstName: 'Pending', lastName: 'Guest' } })
        .expect(201);
      const res = await receptionA.get(`${API}/guests?limit=50`).expect(200);
      const rows = res.body.items as GuestRegisterRowDto[];
      expect(rows.map((r) => r.lastName)).not.toContain('Guest');
      expect(rows.find((r) => r.documentNumber === 'P1234567')).toMatchObject({ nationality: 'AUT', room: 'Room 1' });
      await housekeepingA.get(`${API}/guests`).expect(403);
      expect((await ownerB.get(`${API}/guests`).expect(200)).body.total).toBe(0);
    });

    it('finds a guest by exact document number through the blind index', async () => {
      const res = await receptionA.get(`${API}/guests?search=p7654321`).expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].documentNumber).toBe('P7654321');
    });

    it('exports the police fiche as CSV and Excel, audit-logged', async () => {
      const range = `from=${addDays(today, -1)}&to=${addDays(today, 5)}`;
      const csv = await receptionA.get(`${API}/guests/export?${range}&format=csv`).expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.headers['content-disposition']).toContain('registre-clients_');
      const text = csv.text.charCodeAt(0) === 0xfeff ? csv.text.slice(1) : csv.text; // strip the BOM
      expect(text.split('\r\n')[0]).toBe("Nom;Prénom;Sexe;Date de naissance;Nationalité;Type de document;N° de document;Date d'arrivée;Date de départ;Chambre");
      expect(text).toContain('Vogel;Lena;;;AUT;Passeport;P1234567');

      const xlsx = await receptionA.get(`${API}/guests/export?${range}&format=xlsx`).responseType('blob').expect(200);
      expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');

      await receptionA.get(`${API}/guests/export?from=${today}&to=${today}&format=csv`).expect(400);
      expect(await prisma.auditLog.count({ where: { riadId: a.riadId, action: 'register.export' } })).toBe(2);
    });
  });
});
