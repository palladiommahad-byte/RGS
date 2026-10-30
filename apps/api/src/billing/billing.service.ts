import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  computeBill,
  formatInvoiceNumber,
  isoToUtcDate,
  todayIso,
  utcDateToIso,
  type BillDto,
  type CheckoutResultDto,
  type PaymentDto,
  type StayExtraDto,
} from '@riad/shared';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import type { AuthPrincipal } from '../common/auth/principal';
import type { InvoiceBreakdown } from '../invoices/invoice-breakdown';
import { InvoicePdfService } from '../invoices/invoice-pdf.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { releaseRoom } from '../stays/room-locks';
import type { CheckoutDto, CreateExtraDto, CreatePaymentDto } from './billing.dto';
import { TaxRatesService } from './tax-rates.service';

const billInclude = {
  room: { select: { name: true } },
  extras: { orderBy: { createdAt: 'asc' } },
  payments: true,
  invoices: { orderBy: { issuedAt: 'desc' }, take: 1 },
  guests: { where: { isMain: true }, take: 1, select: { firstName: true, lastName: true, nationality: true } },
} satisfies Prisma.StayInclude;

type BillStay = Prisma.StayGetPayload<{ include: typeof billInclude }>;

const sumPayments = (stay: { payments: { amount: number }[] }) => stay.payments.reduce((n, p) => n + p.amount, 0);

/**
 * Extras, payments, the live bill and checkout. Once checked out the invoice snapshot is
 * the bill: extras are frozen; payments can still be recorded to settle a balance.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly taxRates: TaxRatesService,
    private readonly pdf: InvoicePdfService,
    private readonly realtime: RealtimeGateway,
  ) {}

  // ---------------------------------------------------------------------------
  // Extras
  // ---------------------------------------------------------------------------

  async addExtra(p: AuthPrincipal, stayId: string, dto: CreateExtraDto): Promise<StayExtraDto> {
    await this.openStayOrThrow(p.riadId, stayId);
    const total = dto.unitPrice * dto.quantity;
    if (!Number.isSafeInteger(total)) throw new AppException('INVALID_AMOUNT', 'Amount too large');
    const extra = await this.prisma.$transaction(async (tx) => {
      const created = await tx.stayExtra.create({
        data: { riadId: p.riadId, stayId, ...dto, total, createdBy: p.userId },
      });
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: 'extra.create',
          entity: 'StayExtra',
          entityId: created.id,
          diff: { stayId, label: dto.label, category: dto.category, total },
        },
        tx,
      );
      return created;
    });
    return { ...extra, createdAt: extra.createdAt.toISOString() };
  }

  async removeExtra(p: AuthPrincipal, stayId: string, extraId: string): Promise<void> {
    await this.openStayOrThrow(p.riadId, stayId);
    const extra = await this.prisma.stayExtra.findFirst({ where: { id: extraId, stayId, riadId: p.riadId } });
    if (!extra) throw notFound('Extra');
    await this.prisma.$transaction(async (tx) => {
      await tx.stayExtra.delete({ where: { id: extraId } });
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: 'extra.delete',
          entity: 'StayExtra',
          entityId: extraId,
          diff: { stayId, label: extra.label, total: extra.total },
        },
        tx,
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Payments
  // ---------------------------------------------------------------------------

  async addPayment(p: AuthPrincipal, stayId: string, dto: CreatePaymentDto): Promise<PaymentDto> {
    const stay = await this.stayOrThrow(p.riadId, stayId);
    if (stay.status === 'CANCELLED') {
      throw new AppException('STAY_LOCKED', 'A cancelled stay cannot receive payments', HttpStatus.CONFLICT);
    }
    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          riadId: p.riadId,
          stayId,
          amount: dto.amount,
          method: dto.method,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
          note: dto.note,
          receivedBy: p.userId,
        },
      });
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: 'payment.create',
          entity: 'Payment',
          entityId: created.id,
          diff: { stayId, amount: dto.amount, method: dto.method },
        },
        tx,
      );
      return created;
    });
    const user = await this.prisma.user.findUnique({ where: { id: p.userId }, select: { id: true, name: true } });
    return {
      id: payment.id,
      amount: payment.amount,
      method: payment.method,
      paidAt: payment.paidAt.toISOString(),
      note: payment.note,
      receivedBy: user,
    };
  }

  /** Mistyped payment: removable until the invoice is issued (then it is on the invoice). */
  async removePayment(p: AuthPrincipal, stayId: string, paymentId: string): Promise<void> {
    const stay = await this.stayOrThrow(p.riadId, stayId);
    const payment = await this.prisma.payment.findFirst({ where: { id: paymentId, stayId, riadId: p.riadId } });
    if (!payment) throw notFound('Payment');
    if (stay.status === 'CHECKED_OUT') {
      throw new AppException('PAYMENT_LOCKED', 'Payments on an issued invoice cannot be deleted', HttpStatus.CONFLICT);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.delete({ where: { id: paymentId } });
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: 'payment.delete',
          entity: 'Payment',
          entityId: paymentId,
          diff: { stayId, amount: payment.amount, method: payment.method },
        },
        tx,
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Bill & checkout
  // ---------------------------------------------------------------------------

  async bill(p: AuthPrincipal, stayId: string): Promise<BillDto> {
    const stay = await this.prisma.stay.findFirst({ where: { id: stayId, riadId: p.riadId }, include: billInclude });
    if (!stay) throw notFound('Stay');
    const paid = sumPayments(stay);
    const invoice = stay.invoices[0];
    if (invoice) {
      const b = invoice.breakdown as unknown as InvoiceBreakdown;
      return {
        lines: b.lines,
        totals: b.totals,
        tvaByRate: b.tvaByRate,
        missingRates: b.missingRates,
        paid,
        balance: invoice.totalTtc - paid,
        ratesDate: b.ratesDate,
        invoice: { id: invoice.id, number: invoice.number, totalTtc: invoice.totalTtc, issuedAt: invoice.issuedAt.toISOString() },
      };
    }
    const ratesDate = todayIso();
    const computed = await this.compute(stay, ratesDate);
    return { ...computed, paid, balance: computed.totals.totalTtc - paid, ratesDate, invoice: null };
  }

  /**
   * CHECKED_IN -> CHECKED_OUT: freezes the bill into a sequentially numbered invoice,
   * frees the room for cleaning, then renders the PDF.
   */
  async checkout(p: AuthPrincipal, stayId: string, dto: CheckoutDto): Promise<CheckoutResultDto> {
    const issuedOn = todayIso();
    const year = Number(issuedOn.slice(0, 4));

    const result = await this.prisma.$transaction(async (tx) => {
      const stay = await tx.stay.findFirst({ where: { id: stayId, riadId: p.riadId }, include: billInclude });
      if (!stay) throw notFound('Stay');
      if (stay.status !== 'CHECKED_IN') {
        throw new AppException('INVALID_TRANSITION', `Cannot check out a ${stay.status} stay`, HttpStatus.CONFLICT, {
          from: stay.status,
        });
      }
      const computed = await this.compute(stay, issuedOn, tx);
      const paid = sumPayments(stay);
      const balance = computed.totals.totalTtc - paid;
      if (balance > 0 && !dto.acceptBalanceDue) {
        throw new AppException('BALANCE_DUE', 'The guest still owes money', HttpStatus.CONFLICT, { balance });
      }

      const { count } = await tx.stay.updateMany({
        where: { id: stayId, riadId: p.riadId, status: 'CHECKED_IN' },
        data: { status: 'CHECKED_OUT', checkedOutAt: new Date() },
      });
      if (count !== 1) {
        throw new AppException('STAY_CHANGED', 'This stay was changed by someone else, reload and retry', HttpStatus.CONFLICT);
      }
      if (stay.roomId) await releaseRoom(tx, p.riadId, stay.roomId);

      // Gapless yearly numbering: an atomic upsert-increment on the riad/year counter.
      const seq = await tx.invoiceSequence.upsert({
        where: { riadId_year: { riadId: p.riadId, year } },
        create: { riadId: p.riadId, year, lastValue: 1 },
        update: { lastValue: { increment: 1 } },
      });
      const riad = await tx.riad.findUniqueOrThrow({ where: { id: p.riadId }, select: { invoicePrefix: true } });
      const main = stay.guests[0];
      const breakdown: InvoiceBreakdown = {
        ...computed,
        ratesDate: issuedOn,
        paidAtIssue: paid,
        stay: {
          roomName: stay.room?.name ?? null,
          checkInDate: utcDateToIso(stay.checkInDate),
          checkOutDate: utcDateToIso(stay.checkOutDate),
          nights: stay.nights,
          adults: stay.adults,
          children: stay.children,
        },
        guest: main ? { name: `${main.firstName} ${main.lastName}`, nationality: main.nationality } : null,
      };
      const invoice = await tx.invoice.create({
        data: {
          riadId: p.riadId,
          stayId,
          number: formatInvoiceNumber(riad.invoicePrefix, year, seq.lastValue),
          year,
          sequence: seq.lastValue,
          ...computed.totals,
          breakdown: breakdown as unknown as Prisma.InputJsonObject,
          createdBy: p.userId,
        },
      });
      await this.audit.log(
        {
          riadId: p.riadId,
          userId: p.userId,
          action: balance > 0 ? 'stay.checkout_balance_due' : 'stay.checkout',
          entity: 'Stay',
          entityId: stayId,
          diff: { invoice: invoice.number, totalTtc: invoice.totalTtc, paid, balance },
        },
        tx,
      );
      return { invoice, balance };
    });

    try {
      await this.pdf.generate(result.invoice.id);
    } catch (e) {
      // The invoice exists; the PDF is regenerated on first download.
      this.logger.error(`PDF for ${result.invoice.number} failed: ${String(e)}`);
    }
    // The room is now « to clean »: every open screen (housekeeping too) updates at once.
    this.realtime.staysChanged(p.riadId);
    this.realtime.roomsChanged(p.riadId);
    const i = result.invoice;
    return {
      invoice: { id: i.id, number: i.number, totalTtc: i.totalTtc, issuedAt: i.issuedAt.toISOString() },
      balance: result.balance,
    };
  }

  private async compute(stay: BillStay, ratesDate: string, tx?: Prisma.TransactionClient) {
    const rates = await this.taxRates.ratesAt(stay.riadId, isoToUtcDate(ratesDate), tx);
    return computeBill({
      nights: stay.nights,
      adults: stay.adults,
      pricePerNight: stay.pricePerNight,
      accommodationTtc: stay.totalAccommodation,
      extras: stay.extras,
      rates,
    });
  }

  private async stayOrThrow(riadId: string, stayId: string) {
    const stay = await this.prisma.stay.findFirst({ where: { id: stayId, riadId }, select: { id: true, status: true } });
    if (!stay) throw notFound('Stay');
    return stay;
  }

  /** Extras can change until the invoice is issued. */
  private async openStayOrThrow(riadId: string, stayId: string) {
    const stay = await this.stayOrThrow(riadId, stayId);
    if (stay.status !== 'PENDING' && stay.status !== 'CHECKED_IN') {
      throw new AppException('STAY_LOCKED', `A ${stay.status} stay can no longer be edited`, HttpStatus.CONFLICT);
    }
    return stay;
  }
}

const notFound = (what: string) => new AppException('NOT_FOUND', `${what} not found`, HttpStatus.NOT_FOUND);
