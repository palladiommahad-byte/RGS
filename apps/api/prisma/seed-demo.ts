/**
 * Demo data for the finance dashboard: ~3 months of checked-out stays (with extras,
 * payments and invoices), expenses and HR (employees, badge scans, leaves, paid payroll),
 * so charts and reports show something realistic.
 *
 * DEVELOPMENT / DEMO ONLY. Deterministic (seeded random) and re-runnable: rows it
 * created earlier (stays and expenses noted "[demo]") are removed first.
 * Usage: pnpm db:seed-demo
 */
import { PrismaClient, type ExtraCategory, type PaymentMethod, type Prisma, type StaySource } from '@prisma/client';
import {
  addDays,
  computeBill,
  formatInvoiceNumber,
  isoToUtcDate,
  nightsBetween,
  todayIso,
  zonedMidnight,
  type TaxRate,
} from '@riad/shared';
import { FieldEncryption } from '../src/common/crypto/field-encryption';
import { seedHrDemo } from './seed-demo-hr';

if (process.env.NODE_ENV === 'production') {
  console.error('seed-demo refuses to run in production.');
  process.exit(1);
}

const prisma = new PrismaClient();
const enc = new FieldEncryption(process.env.FIELD_ENCRYPTION_KEY ?? '', process.env.FIELD_HASH_KEY ?? '');
const MARK = '[demo]';
const DAYS = 92;

// Small deterministic PRNG (mulberry32) so every run produces the same data.
let seed = 20261029;
function rand(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const weighted = <T>(pairs: [T, number][]): T => {
  let r = rand() * pairs.reduce((a, [, w]) => a + w, 0);
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[0]![0];
};
/** Riad-local wall-clock time (follows the tz data: Morocco is UTC+0 since 20 Sept 2026). */
const at = (iso: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(zonedMidnight(iso).getTime() + (h! * 60 + m!) * 60_000);
};
const round10 = (centimes: number) => Math.round(centimes / 1000) * 1000;

const GUESTS: [string, string, string][] = [
  ['Claire', 'Dubois', 'FRA'], ['Julien', 'Moreau', 'FRA'], ['Sophie', 'Laurent', 'FRA'], ['Emma', 'Wilson', 'GBR'],
  ['James', 'Taylor', 'GBR'], ['Lukas', 'Becker', 'DEU'], ['Anna', 'Schulz', 'DEU'], ['Lucía', 'García', 'ESP'],
  ['Pablo', 'Martínez', 'ESP'], ['Giulia', 'Rossi', 'ITA'], ['Marco', 'Bianchi', 'ITA'], ['Olivia', 'Smith', 'USA'],
  ['Noah', 'Johnson', 'USA'], ['Sanne', 'de Vries', 'NLD'], ['Youssef', 'El Amrani', 'MAR'], ['Salma', 'Benjelloun', 'MAR'],
  ['Hiroshi', 'Tanaka', 'JPN'], ['Léa', 'Peeters', 'BEL'], ['Mateus', 'Silva', 'BRA'], ['Ingrid', 'Larsen', 'NOR'],
];

async function main(): Promise<void> {
  const riad = await prisma.riad.findFirstOrThrow({ where: { name: process.env.SEED_RIAD_NAME ?? 'Riad Demo' } });
  const riadId = riad.id;
  const today = todayIso();
  const start = addDays(today, -DAYS);

  // --- Clean previous demo rows -------------------------------------------------
  const old = await prisma.stay.findMany({ where: { riadId, notes: MARK }, select: { id: true } });
  const oldIds = old.map((s) => s.id);
  await prisma.payment.deleteMany({ where: { stayId: { in: oldIds } } });
  await prisma.invoice.deleteMany({ where: { stayId: { in: oldIds } } });
  await prisma.stay.deleteMany({ where: { id: { in: oldIds } } });
  await prisma.expense.deleteMany({ where: { riadId, note: { startsWith: MARK } } });

  // --- Tax rates (demo values, to be replaced by the accountant's) --------------
  const ensureRate = async (code: 'TVA_FOOD' | 'TAXE_SEJOUR' | 'TPT', mode: 'PERCENT' | 'PER_PERSON_PER_NIGHT', value: number) => {
    if (!(await prisma.taxSetting.findFirst({ where: { riadId, code } }))) {
      await prisma.taxSetting.create({ data: { riadId, code, mode, value, validFrom: new Date('2020-01-01') } });
      console.log(`  added demo rate ${code} = ${value} (${mode}) — replace with your accountant's figure`);
    }
  };
  await ensureRate('TVA_FOOD', 'PERCENT', 1000);
  await ensureRate('TAXE_SEJOUR', 'PER_PERSON_PER_NIGHT', 1500);
  await ensureRate('TPT', 'PER_PERSON_PER_NIGHT', 500);
  const settings = await prisma.taxSetting.findMany({ where: { riadId } });
  const ratesAt = (iso: string): TaxRate[] => {
    const d = isoToUtcDate(iso);
    const valid = settings
      .filter((s) => s.validFrom <= d && (!s.validTo || s.validTo >= d))
      .sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime());
    const byCode = new Map<string, TaxRate>();
    for (const s of valid) if (!byCode.has(s.code)) byCode.set(s.code, { code: s.code, mode: s.mode, value: s.value });
    return [...byCode.values()];
  };

  // --- Stays -----------------------------------------------------------------------
  const rooms = await prisma.room.findMany({ where: { riadId, isActive: true }, orderBy: { sortOrder: 'asc' } });
  const reception = await prisma.user.findUniqueOrThrow({ where: { email: 'reception@riad.local' } });
  const bookingCommission = new Map<string, number>(); // month -> centimes
  let stayCount = 0;

  for (const room of rooms) {
    let day = addDays(start, int(0, 3));
    while (true) {
      const nights = weighted<number>([[1, 2], [2, 4], [3, 4], [4, 2], [5, 1]]);
      const checkOut = addDays(day, nights);
      if (checkOut > today) break;
      const source = weighted<StaySource>([['BOOKING', 45], ['AIRBNB', 25], ['DIRECT', 15], ['WALK_IN', 10], ['EXPEDIA', 5]]);
      const pricePerNight = round10(room.basePrice * (0.9 + rand() * 0.25));
      const accommodation = pricePerNight * nights;
      const commissionRate = source === 'BOOKING' || source === 'EXPEDIA' ? 0.17 : source === 'AIRBNB' ? 0.03 : 0;
      const otaCommission = Math.round(accommodation * commissionRate);
      if (source === 'BOOKING' || source === 'EXPEDIA') {
        const month = checkOut.slice(0, 7);
        bookingCommission.set(month, (bookingCommission.get(month) ?? 0) + otaCommission);
      }
      const adults = room.capacity >= 3 ? int(1, 3) : int(1, 2);
      const children = room.capacity >= 4 && rand() < 0.4 ? int(1, 2) : 0;
      const [firstName, lastName, nationality] = pick(GUESTS);
      const doc = enc.encryptNullable(`${nationality.slice(0, 2)}${int(1000000, 9999999)}`);

      const extras: { label: string; category: ExtraCategory; quantity: number; unitPrice: number }[] = [];
      if (rand() < 0.4) extras.push({ label: 'Dîner marocain', category: 'FOOD', quantity: adults, unitPrice: round10(int(18000, 25000)) });
      if (rand() < 0.2) extras.push({ label: 'Hammam & gommage', category: 'HAMMAM', quantity: adults, unitPrice: round10(int(25000, 35000)) });
      if (rand() < 0.25) extras.push({ label: 'Transfert aéroport', category: 'TRANSFER', quantity: 1, unitPrice: round10(int(20000, 30000)) });
      if (rand() < 0.1) extras.push({ label: 'Excursion Ourika', category: 'EXCURSION', quantity: adults, unitPrice: round10(int(35000, 50000)) });

      const issuedOn = checkOut;
      const bill = computeBill({
        nights,
        adults,
        pricePerNight,
        accommodationTtc: accommodation,
        extras: extras.map((e) => ({ ...e, total: e.unitPrice * e.quantity })),
        rates: ratesAt(issuedOn),
      });
      const year = Number(issuedOn.slice(0, 4));
      const seq = await prisma.invoiceSequence.upsert({
        where: { riadId_year: { riadId, year } },
        create: { riadId, year, lastValue: 1 },
        update: { lastValue: { increment: 1 } },
      });
      const method: PaymentMethod =
        source === 'AIRBNB' || source === 'EXPEDIA' ? 'OTA_COLLECTED' : weighted<PaymentMethod>([['CASH', 45], ['CARD', 45], ['TRANSFER', 10]]);

      await prisma.stay.create({
        data: {
          riadId,
          roomId: room.id,
          source,
          externalRef: source === 'BOOKING' ? `BK-${int(100000, 999999)}` : source === 'AIRBNB' ? `HM${int(10000, 99999)}` : null,
          checkInDate: isoToUtcDate(day),
          checkOutDate: isoToUtcDate(checkOut),
          nights,
          adults,
          children,
          pricePerNight,
          totalAccommodation: accommodation,
          otaCommission,
          status: 'CHECKED_OUT',
          confirmedBy: reception.id,
          confirmedAt: at(day, '15:00'),
          checkedOutAt: at(checkOut, '11:00'),
          notes: MARK,
          createdAt: at(day, '14:30'),
          guests: {
            create: {
              riadId,
              isMain: true,
              firstName,
              lastName,
              nationality,
              documentType: 'PASSPORT',
              documentNumber: doc.cipher,
              documentNumberHash: doc.hash,
              consentAt: at(day, '14:30'),
            },
          },
          extras: {
            create: extras.map((e, i) => ({
              riadId,
              ...e,
              total: e.unitPrice * e.quantity,
              createdAt: at(addDays(day, Math.min(i, nights - 1)), '20:00'),
            })),
          },
          payments: {
            create: { riadId, amount: bill.totals.totalTtc, method, paidAt: at(checkOut, '10:30'), receivedBy: reception.id, createdAt: at(checkOut, '10:30') },
          },
          invoices: {
            create: {
              riadId,
              number: formatInvoiceNumber(riad.invoicePrefix, year, seq.lastValue),
              year,
              sequence: seq.lastValue,
              ...bill.totals,
              issuedAt: at(issuedOn, '11:00'),
              createdAt: at(issuedOn, '11:00'),
              breakdown: {
                ...bill,
                ratesDate: issuedOn,
                paidAtIssue: bill.totals.totalTtc,
                stay: { roomName: room.name, checkInDate: day, checkOutDate: checkOut, nights, adults, children },
                guest: { name: `${firstName} ${lastName}`, nationality },
              } as unknown as Prisma.InputJsonObject,
            },
          },
        },
      });
      stayCount++;
      // Gap before the next booking: busier at weekends.
      day = addDays(checkOut, weighted<number>([[0, 4], [1, 3], [2, 2], [4, 1]]));
    }
  }

  // --- Expenses --------------------------------------------------------------------
  const cat = async (key: string) => (await prisma.expenseCategory.findUniqueOrThrow({ where: { riadId_key: { riadId, key } } })).id;
  const sup = async (name: string) => (await prisma.supplier.findFirst({ where: { riadId, name } }))?.id ?? null;
  const ids = {
    FOOD: await cat('FOOD'), CLEANING: await cat('CLEANING'), UTILITIES: await cat('UTILITIES'), SALARIES: await cat('SALARIES'),
    MAINTENANCE: await cat('MAINTENANCE'), OTA: await cat('OTA_COMMISSIONS'), MARKETING: await cat('MARKETING'),
    SUPPLIES: await cat('SUPPLIES'), OTHER: await cat('OTHER'),
  };
  const suppliers = {
    epicerie: await sup('Épicerie du Derb'), boucherie: await sup('Boucherie Mouassine'), blanchisserie: await sup('Blanchisserie Médina'),
    droguerie: await sup('Droguerie Atlas'), plombier: await sup('Plombier Hassan'),
  };
  const rows: Prisma.ExpenseCreateManyInput[] = [];
  const add = (date: string, categoryId: string, amountTtc: number, opts: { supplierId?: string | null; tva20?: boolean; note?: string; method?: 'CASH' | 'CARD' | 'TRANSFER' } = {}) =>
    rows.push({
      riadId,
      categoryId,
      supplierId: opts.supplierId ?? null,
      amountTtc,
      tvaAmount: opts.tva20 ? Math.round(amountTtc / 6) : 0, // 20 % TVA included
      date: isoToUtcDate(date),
      paymentMethod: opts.method ?? 'CASH',
      note: `${MARK}${opts.note ? ` ${opts.note}` : ''}`,
    });

  for (let i = 0; i < DAYS; i++) {
    const d = addDays(start, i);
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (i % 2 === 0) add(d, ids.FOOD, round10(int(15000, 60000)), { supplierId: suppliers.epicerie });
    if (dow === 1) add(d, ids.FOOD, round10(int(40000, 90000)), { supplierId: suppliers.boucherie });
    if (dow === 3) add(d, ids.CLEANING, round10(int(30000, 70000)), { supplierId: suppliers.blanchisserie, tva20: true, method: 'TRANSFER' });
    if (dow === 5 && i % 14 < 7) add(d, ids.SUPPLIES, round10(int(20000, 50000)), { supplierId: suppliers.droguerie, tva20: true });
    if (d.endsWith('-08')) add(d, ids.UTILITIES, round10(int(180000, 260000)), { tva20: true, note: 'Électricité', method: 'TRANSFER' });
    if (d.endsWith('-12')) add(d, ids.UTILITIES, round10(int(35000, 55000)), { tva20: true, note: 'Eau', method: 'TRANSFER' });
    if (d.endsWith('-15')) add(d, ids.MARKETING, round10(int(80000, 150000)), { tva20: true, note: 'Publicité Instagram', method: 'CARD' });
    if (d.endsWith('-01')) add(d, ids.OTHER, 1500000, { note: 'Loyer', method: 'TRANSFER' });
    if (rand() < 0.08) add(d, ids.MAINTENANCE, round10(int(20000, 150000)), { supplierId: suppliers.plombier });
    if (d.endsWith('-05')) {
      // Booking/Expedia invoice the previous month's commissions.
      const prevMonth = addDays(`${d.slice(0, 7)}-01`, -1).slice(0, 7);
      const c = bookingCommission.get(prevMonth);
      if (c) add(d, ids.OTA, c, { tva20: true, note: `Commissions OTA ${prevMonth}`, method: 'TRANSFER' });
    }
  }
  // A visible spike this month: boiler replacement (shows the >25 % alert).
  add(addDays(today, -6), ids.MAINTENANCE, 650000, { supplierId: suppliers.plombier, tva20: true, note: 'Remplacement chaudière', method: 'TRANSFER' });
  await prisma.expense.createMany({ data: rows });
  // Salaries come from payroll (paid lines create their expense).
  const hr = await seedHrDemo(prisma, enc, riadId, start, today, ids.SALARIES);

  console.log(`Demo data for "${riad.name}": ${stayCount} stays (with invoices), ${rows.length} expenses, ${start} → ${today}`);
  console.log(hr);
  console.log(`Nights covered: ${nightsBetween(start, today)} days × ${rooms.length} rooms`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
