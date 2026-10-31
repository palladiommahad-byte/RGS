import type { IsoDate } from './dates';

export const NOTIFICATION_TYPES = ['CHECKIN_REQUEST', 'CHECKIN', 'CHECKOUT', 'CHECKOUT_SOON', 'CASH'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** The "check-out tomorrow" reminder goes out this long before the riad's check-out time. */
export const CHECKOUT_REMINDER_HOURS = 24;

/** A stay event. `guestName` is only sent to people who may read stays. */
export type StayNotificationData = {
  stayId: string;
  roomName: string | null;
  guestName: string | null;
  checkOutDate: IsoDate;
  nights: number;
  /** Check-out with money still owed (centimes). */
  balance?: number;
  /** QR check-in left for reception: the room was occupied, out of service or booked. */
  roomNotFree?: boolean;
  /** Done by the system (automatic check-out), not by a person. */
  automatic?: boolean;
};

export const CASH_MOVEMENT_KINDS = ['TOP_UP', 'ADJUSTMENT', 'EXPENSE', 'EXPENSE_EDIT', 'EXPENSE_DELETE', 'GUEST_PAYMENT', 'GUEST_PAYMENT_DELETE'] as const;
export type CashMovementKind = (typeof CASH_MOVEMENT_KINDS)[number];

export type CashNotificationData = {
  walletId: string;
  walletName: string;
  kind: CashMovementKind;
  /** Signed centimes: positive in, negative out. */
  amount: number;
  /** Balance after the movement (centimes). */
  balance: number;
  note: string | null;
};

type Base = { id: string; createdAt: string; read: boolean; actor: string | null };
export type NotificationDto =
  | (Base & { type: Exclude<NotificationType, 'CASH'>; data: StayNotificationData })
  | (Base & { type: 'CASH'; data: CashNotificationData });

export type NotificationListDto = { items: NotificationDto[]; total: number; unread: number; page: number; limit: number };
