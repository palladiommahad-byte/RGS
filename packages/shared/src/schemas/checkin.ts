import type { DocumentType, Sex } from '../constants';
import type { IsoDate } from '../dates';

export const CHECKIN_ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const CHECKIN_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
/** Client-side resize target before upload (slow 4G). */
export const CHECKIN_IMAGE_MAX_PX = 1600;

export type CheckinContextDto = {
  riadName: string;
  roomName: string | null;
  contactEmail: string | null;
  retentionDays: number;
};

export type MrzFieldsDto = {
  firstName?: string;
  lastName?: string;
  sex?: Sex;
  nationality?: string;
  birthDate?: IsoDate;
  documentType: DocumentType;
  documentNumber?: string;
  documentExpiry?: IsoDate;
};

export type PassportScanDto = {
  /** Opaque reference to the stored photo, sent back with the submission. */
  photoRef: string;
  mrz: { valid: boolean; raw: string; fields: MrzFieldsDto } | null;
};

export type CheckinDoneDto = { riadName: string; wifiInfo: string | null };

export type GuestFilesDto = { passportPhotoUrl: string | null; signatureUrl: string | null };
