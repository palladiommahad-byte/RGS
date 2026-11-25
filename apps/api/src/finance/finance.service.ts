import { HttpStatus, Injectable } from '@nestjs/common';
import {
  addDays,
  addMonths,
  adr,
  costPerOccupiedNight,
  htFromTtc,
  isoToUtcDate,
  isSpendingSpike,
  localDate,
  margin,
  monthStartOf,
  nightsBetween,
  occupancyRate,
  overlapNights,
  previousPeriod,
  prorate,
  revpar,
  utcDateToIso,
  zonedMidnight,
  type ExtraCategory,
  type FinanceDashboardDto,
  type IsoDate,
  type PeriodMetricsDto,
  type StaySource,
} from '@riad/shared';
import { AppException } from '../common/app-exception';
import { TaxRatesService } from '../billing/tax-rates.service';
import { PrismaService } from '../prisma/prisma.service';

const MAX_DAYS = 731;
const SERIES_MONTHS = 6;

type Breakdown = {
  metrics: PeriodMetricsDto;
  bySource: Map<StaySource, { revenue: number; commission: number }>;
  expensesByCategory: Map<string, number>;
  extrasByCategory: Map<ExtraCategory, number>;
};

/**
 * Finance KPIs on an accrual basis (all HT, centimes):
 * - accommodation revenue = nights stayed inside the period × nightly price, TVA removed;
 * - a guest who left early: the nights actually stayed are occupied (the room was free for
 *   others after), and the money billed for the stay is spread over those nights;
 * - money kept from a cancelled stay counts as accommodation revenue on the day it was paid
 *   (no occupied night, so ADR and RevPAR are computed on real nights only);
 * - extras by the date they were added; expenses by expense date, minus deductible TVA;
 * - OTA commissions are pro-rated by nights for the "net by source" view only (the
 *   commission invoices themselves are entered as expenses, so profit is not hit twice).
 */
@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taxRates: TaxRatesService,
  ) {}

  async dashboard(riadId: string, from: IsoDate, to: IsoDate): Promise<FinanceDashboardDto> {
    assertRange(from, to);
    const prev = previousPeriod(from, to);
    const seriesStart = addMonths(to, -(SERIES_MONTHS - 1));
    const monthStarts = Array.from({ length: SERIES_MONTHS }, (_, i) => addMonths(seriesStart, i));

    const [current, previous, months, alerts] = await Promise.all([
      this.period(riadId, from, addDays(to, 1)),
      this.period(riadId, prev.from, addDays(prev.to, 1)),
      Promise.all(monthStarts.map((m) => this.period(riadId, m, addMonths(m, 1)))),
      this.alerts(riadId, to),
    ]);

    const categories = await this.prisma.expenseCategory.findMany({ where: { riadId } });
    const catById = new Map(categories.map((c) => [c.id, c]));

    return {
      current: current.metrics,
      previous: previous.metrics,
      months: months.map((m, i) => ({ ...m.metrics, month: monthStarts[i]!.slice(0, 7) })),
      bySource: [...current.bySource.entries()]
        .map(([source, v]) => ({ source, revenue: v.revenue, commission: v.commission, net: v.revenue - v.commission }))
        .sort((a, b) => b.net - a.net),
      expensesByCategory: [...current.expensesByCategory.entries()]
        .map(([categoryId, amount]) => ({
          categoryId,
          key: catById.get(categoryId)?.key ?? null,
          nameFr: catById.get(categoryId)?.nameFr ?? '?',
          nameAr: catById.get(categoryId)?.nameAr ?? '?',
          amount,
        }))
        .sort((a, b) => b.amount - a.amount),
      extrasByCategory: [...current.extrasByCategory.entries()]
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount),
      alerts: alerts.map((a) => ({
        ...a,
        key: catById.get(a.categoryId)?.key ?? null,
        nameFr: catById.get(a.categoryId)?.nameFr ?? '?',
        nameAr: catById.get(a.categoryId)?.nameAr ?? '?',
      })),
    };
  }

  /** Monthly series (for the P&L export): `count` months ending with the month of `to`. */
  async monthly(riadId: string, to: IsoDate, count = 12) {
    const start = addMonths(to, -(count - 1));
    const starts = Array.from({ length: count }, (_, i) => addMonths(start, i));
    const rows = await Promise.all(starts.map((m) => this.period(riadId, m, addMonths(m, 1))));
    return rows.map((r, i) => ({ month: starts[i]!.slice(0, 7), ...r }));
  }

  /** Metrics for [from, toExclusive). */
  async period(riadId: string, from: IsoDate, toExclusive: IsoDate): Promise<Breakdown> {
    const start = isoToUtcDate(from);
    const end = isoToUtcDate(toExclusive);
    const lastDay = isoToUtcDate(addDays(toExclusive, -1));
    // Instants (created / paid at) are cut at the riad's local midnight, not UTC.
    const startAt = zonedMidnight(from);
    const endAt = zonedMidnight(toExclusive);
    const [stays, extras, kept, expenses, rooms, rates] = await Promise.all([
      this.prisma.stay.findMany({
        where: { riadId, status: { in: ['CHECKED_IN', 'CHECKED_OUT'] }, checkInDate: { lt: end }, checkOutDate: { gt: start } },
        select: {
          checkInDate: true,
          checkOutDate: true,
          checkedOutAt: true,
          status: true,
          nights: true,
          pricePerNight: true,
          otaCommission: true,
          source: true,
        },
      }),
      this.prisma.stayExtra.findMany({
        where: { riadId, createdAt: { gte: startAt, lt: endAt }, stay: { status: { in: ['CHECKED_IN', 'CHECKED_OUT'] } } },
        select: { category: true, total: true },
      }),
      // Cancelled stays whose money was kept (refunded payments are deleted).
      this.prisma.payment.findMany({
        where: { riadId, paidAt: { gte: startAt, lt: endAt }, stay: { status: 'CANCELLED' } },
        select: { amount: true, stay: { select: { source: true } } },
      }),
      this.prisma.expense.groupBy({
        by: ['categoryId'],
        where: { riadId, date: { gte: start, lt: end } },
        _sum: { amountTtc: true, tvaAmount: true },
      }),
      this.prisma.room.count({ where: { riadId, isActive: true } }),
      this.taxRates.ratesAt(riadId, lastDay),
    ]);
    const rate = (code: string) => rates.find((r) => r.code === code && r.mode === 'PERCENT')?.value;
    const accRate = rate('TVA_ACCOMMODATION') ?? 0;
    const foodRate = rate('TVA_FOOD') ?? accRate;

    let occupied = 0;
    let accommodation = 0;
    const bySource = new Map<StaySource, { revenue: number; commission: number }>();
    for (const s of stays) {
      const checkIn = utcDateToIso(s.checkInDate);
      // Left early: occupied until the real departure day (at least one night).
      let checkOut = utcDateToIso(s.checkOutDate);
      if (s.status === 'CHECKED_OUT' && s.checkedOutAt) {
        const left = localDate(s.checkedOutAt);
        const earliest = addDays(checkIn, 1);
        if (left < checkOut) checkOut = left > earliest ? left : earliest;
      }
      const stayed = nightsBetween(checkIn, checkOut);
      const nights = overlapNights(checkIn, checkOut, from, toExclusive);
      if (nights === 0) continue;
      occupied += nights;
      // The whole billed stay, spread over the nights actually stayed.
      const ht = htFromTtc(Math.round((s.nights * s.pricePerNight * nights) / stayed), accRate);
      accommodation += ht;
      const src = bySource.get(s.source) ?? { revenue: 0, commission: 0 };
      src.revenue += ht;
      src.commission += prorate(s.otaCommission, nights, stayed);
      bySource.set(s.source, src);
    }
    const nightsRevenue = accommodation;
    for (const k of kept) {
      const ht = htFromTtc(k.amount, accRate);
      accommodation += ht;
      const src = bySource.get(k.stay.source) ?? { revenue: 0, commission: 0 };
      src.revenue += ht;
      bySource.set(k.stay.source, src);
    }

    const extrasByCategory = new Map<ExtraCategory, number>();
    let extrasRevenue = 0;
    for (const e of extras) {
      const ht = htFromTtc(e.total, e.category === 'FOOD' ? foodRate : accRate);
      extrasRevenue += ht;
      extrasByCategory.set(e.category, (extrasByCategory.get(e.category) ?? 0) + ht);
    }

    const expensesByCategory = new Map<string, number>();
    let expenseTotal = 0;
    for (const g of expenses) {
      const ht = (g._sum.amountTtc ?? 0) - (g._sum.tvaAmount ?? 0);
      expenseTotal += ht;
      expensesByCategory.set(g.categoryId, ht);
    }

    const available = rooms * nightsBetween(from, toExclusive);
    const revenue = accommodation + extrasRevenue;
    const profit = revenue - expenseTotal;
    return {
      metrics: {
        from,
        to: addDays(toExclusive, -1),
        revenue,
        accommodationRevenue: accommodation,
        extrasRevenue,
        expenses: expenseTotal,
        profit,
        margin: margin(profit, revenue),
        occupancy: occupancyRate(occupied, available),
        adr: adr(nightsRevenue, occupied),
        revpar: revpar(nightsRevenue, available),
        costPerOccupiedNight: costPerOccupiedNight(expenseTotal, occupied),
        occupiedNights: occupied,
        availableNights: available,
      },
      bySource,
      expensesByCategory,
      extrasByCategory,
    };
  }

  /** Categories spending > 25 % above their average of the 3 previous full months. */
  private async alerts(riadId: string, day: IsoDate) {
    const month = monthStartOf(day);
    // Only compare with full months the riad was recording expenses: the first (partial)
    // month and anything before it would drag the average down and flag everything.
    const first = await this.prisma.expense.findFirst({ where: { riadId }, orderBy: { date: 'asc' }, select: { date: true } });
    if (!first) return [];
    const firstMonth = monthStartOf(utcDateToIso(first.date));
    const historyIdx = [0, 1, 2].filter((i) => addMonths(month, i - 3) > firstMonth);
    if (historyIdx.length < 2) return [];
    const windows = [-3, -2, -1, 0].map((n) => addMonths(month, n));
    const sums = await Promise.all(
      windows.map((m) =>
        this.prisma.expense.groupBy({
          by: ['categoryId'],
          where: { riadId, date: { gte: isoToUtcDate(m), lt: isoToUtcDate(addMonths(m, 1)) } },
          _sum: { amountTtc: true, tvaAmount: true },
        }),
      ),
    );
    const ht = (rows: (typeof sums)[number], id: string) => {
      const g = rows.find((r) => r.categoryId === id);
      return g ? (g._sum.amountTtc ?? 0) - (g._sum.tvaAmount ?? 0) : 0;
    };
    const currentRows = sums[3]!;
    return currentRows
      .map((g) => {
        const amount = ht(currentRows, g.categoryId);
        const history = historyIdx.map((i) => ht(sums[i]!, g.categoryId));
        const average = Math.round(history.reduce((a, b) => a + b, 0) / history.length);
        return { categoryId: g.categoryId, month: month.slice(0, 7), amount, average, spike: isSpendingSpike(amount, history) };
      })
      .filter((a) => a.spike)
      .map(({ spike: _spike, ...a }) => a);
  }
}

function assertRange(from: IsoDate, to: IsoDate): void {
  const days = nightsBetween(from, addDays(to, 1));
  if (days < 1 || days > MAX_DAYS) {
    throw new AppException('INVALID_DATES', `Choose a period of 1 to ${MAX_DAYS} days`, HttpStatus.BAD_REQUEST);
  }
}
