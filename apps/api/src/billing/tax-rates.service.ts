import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { TaxRate } from '@riad/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Tax rates in force on a given day. Settings carry validity dates so past invoices
 * keep their rates; when periods overlap the most recent `valid_from` wins.
 */
@Injectable()
export class TaxRatesService {
  constructor(private readonly prisma: PrismaService) {}

  async ratesAt(riadId: string, day: Date, tx?: Prisma.TransactionClient): Promise<TaxRate[]> {
    const rows = await (tx ?? this.prisma).taxSetting.findMany({
      where: {
        riadId,
        validFrom: { lte: day },
        OR: [{ validTo: null }, { validTo: { gte: day } }],
      },
      orderBy: { validFrom: 'desc' },
    });
    const byCode = new Map<string, TaxRate>();
    for (const r of rows) {
      if (!byCode.has(r.code)) byCode.set(r.code, { code: r.code, mode: r.mode, value: r.value });
    }
    return [...byCode.values()];
  }
}
