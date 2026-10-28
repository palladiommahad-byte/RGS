import { z } from 'zod';
import { ROOM_STATUSES, type RoomStatus } from '../constants';

/** Staff form (amounts typed in MAD, converted to centimes before sending). */
export const roomFormSchema = z.object({
  name: z.string().trim().min(1).max(60),
  type: z.string().trim().min(1).max(60),
  capacity: z.coerce.number().int().min(1).max(20),
  basePriceMad: z.string().trim().regex(/^\d+([.,]\d{1,2})?$/),
});
export type RoomFormInput = z.infer<typeof roomFormSchema>;

export const roomStatusSchema = z.enum(ROOM_STATUSES);

export type RoomDto = {
  id: string;
  name: string;
  type: string;
  capacity: number;
  basePrice: number;
  status: RoomStatus;
  isActive: boolean;
  sortOrder: number;
  /** Only returned to users allowed to manage rooms. */
  qrToken?: string;
};
