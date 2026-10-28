import type { Prisma } from '@prisma/client';
import { isoToUtcDate } from '@riad/shared';
import type { FieldEncryption } from '../common/crypto/field-encryption';
import type { GuestInputDto, UpdateGuestDto } from './stays.dto';

/** Guest row from form input; the document number is encrypted with a blind index. */
export function guestCreateData(enc: FieldEncryption, riadId: string, g: GuestInputDto) {
  const doc = enc.encryptNullable(g.documentNumber);
  return {
    riadId,
    firstName: g.firstName,
    lastName: g.lastName,
    sex: g.sex,
    nationality: g.nationality,
    birthDate: g.birthDate ? isoToUtcDate(g.birthDate) : undefined,
    documentType: g.documentType,
    documentNumber: doc.cipher,
    documentNumberHash: doc.hash,
    documentExpiry: g.documentExpiry ? isoToUtcDate(g.documentExpiry) : undefined,
    phone: g.phone,
    email: g.email,
  };
}

/** `undefined` = leave unchanged, `null` = clear (required names are never cleared). */
export function guestUpdateData(enc: FieldEncryption, g: UpdateGuestDto): Prisma.GuestUncheckedUpdateInput {
  const data: Prisma.GuestUncheckedUpdateInput = {};
  if (g.firstName) data.firstName = g.firstName;
  if (g.lastName) data.lastName = g.lastName;
  if (g.sex !== undefined) data.sex = g.sex ?? null;
  if (g.nationality !== undefined) data.nationality = g.nationality ?? null;
  if (g.birthDate !== undefined) data.birthDate = g.birthDate ? isoToUtcDate(g.birthDate) : null;
  if (g.documentType !== undefined) data.documentType = g.documentType ?? null;
  if (g.documentNumber !== undefined) {
    const doc = enc.encryptNullable(g.documentNumber);
    data.documentNumber = doc.cipher;
    data.documentNumberHash = doc.hash;
  }
  if (g.documentExpiry !== undefined) {
    data.documentExpiry = g.documentExpiry ? isoToUtcDate(g.documentExpiry) : null;
  }
  if (g.phone !== undefined) data.phone = g.phone ?? null;
  if (g.email !== undefined) data.email = g.email ?? null;
  return data;
}
