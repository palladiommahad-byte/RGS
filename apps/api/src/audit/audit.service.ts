import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AuditEntry = {
  riadId: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  diff?: Prisma.InputJsonValue;
};

/**
 * Append-only audit trail for stays, payments, expenses, HR and tax settings.
 * Pass the transaction client so the log is written atomically with the change.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        riadId: entry.riadId,
        userId: entry.userId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        diff: entry.diff,
      },
    });
  }
}
