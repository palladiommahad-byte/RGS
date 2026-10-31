import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { addDays, atRiadTime, todayIso, type NotificationListDto, type RiadSettingsDto, type RoomBookedDetails } from '@riad/shared';
import type TestAgent from 'supertest/lib/agent';
import { StayCycleService } from '../src/billing/stay-cycle.service';
import { createApp, createRiad, loginAs, resetDatabase, type RiadFixture } from './fixtures';

const API = '/api/v1';
const MINUTE = 60_000;

describe('Automatic stay cycle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let a: RiadFixture;
  let owner: TestAgent;
  let reception: TestAgent;
  let cycle: StayCycleService;
  const today = todayIso();

  const room = (i: number) => prisma.room.findUniqueOrThrow({ where: { id: a.rooms[i]!.id } });
  const stay = (id: string) => prisma.stay.findUniqueOrThrow({ where: { id } });
  const checkIn = async (roomIndex: number, checkOutDate: string, name = 'Lena') =>
    (
      await reception
        .post(`${API}/stays`)
        .send({
          source: 'DIRECT',
          checkInDate: today,
          checkOutDate,
          adults: 1,
          children: 0,
          pricePerNight: 50000,
          roomId: a.rooms[roomIndex]!.id,
          checkInNow: true,
          mainGuest: { firstName: name, lastName: 'Vogel' },
        })
        .expect(201)
    ).body.id as string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await resetDatabase(prisma);
    a = await createRiad(prisma, 'Riad A');
    app = await createApp();
    cycle = app.get(StayCycleService);
    owner = await loginAs(app, a.emails.OWNER);
    reception = await loginAs(app, a.emails.RECEPTION);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  describe('settings', () => {
    it('defaults to check-out 12:00 and rooms ready 15:00, editable by the owner', async () => {
      const s = (await owner.get(`${API}/settings/riad`).expect(200)).body as RiadSettingsDto;
      expect(s).toMatchObject({ checkoutTime: '12:00', roomReadyTime: '15:00' });
      await owner.patch(`${API}/settings/riad`).send({ checkoutTime: '25:00' }).expect(400);
      await owner.patch(`${API}/settings/riad`).send({ checkoutTime: '9:00' }).expect(400);
      const changed = (await owner.patch(`${API}/settings/riad`).send({ checkoutTime: '11:00' }).expect(200)).body as RiadSettingsDto;
      expect(changed.checkoutTime).toBe('11:00');
    });
  });

  describe('automatic check-out', () => {
    let stayId: string;

    it('checks guests out at the riad check-out time of their departure day', async () => {
      const tomorrow = addDays(today, 1);
      stayId = await checkIn(0, tomorrow);
      const at = atRiadTime(tomorrow, '11:00').getTime();

      expect(await cycle.checkOutEndedStays(new Date(at - MINUTE))).toBe(0);
      expect((await stay(stayId)).status).toBe('CHECKED_IN');

      expect(await cycle.checkOutEndedStays(new Date(at + MINUTE))).toBe(1);
      const s = await stay(stayId);
      expect(s.status).toBe('CHECKED_OUT');
      expect((await room(0)).status).toBe('CLEANING');
      // Unpaid: the invoice is issued with the balance flagged, by « the system ».
      expect(await prisma.invoice.count({ where: { stayId } })).toBe(1);
      const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: stayId, action: 'stay.checkout_balance_due' } });
      expect(log.userId).toBeNull();
      const notes = (await reception.get(`${API}/notifications`).expect(200)).body as NotificationListDto;
      expect(notes.items[0]).toMatchObject({ type: 'CHECKOUT', actor: null, data: { stayId, automatic: true, balance: 50000 } });

      // Nothing left to do on the next runs.
      expect(await cycle.checkOutEndedStays(new Date(at + 10 * MINUTE))).toBe(0);
    });

    it('catches up on departures it missed (server was off)', async () => {
      const id = await checkIn(1, addDays(today, 1), 'Max');
      expect(await cycle.checkOutEndedStays(new Date(atRiadTime(addDays(today, 3), '09:00')))).toBe(1);
      expect((await stay(id)).status).toBe('CHECKED_OUT');
    });

    it('frees rooms « to clean » at the room-ready time, never out-of-service ones', async () => {
      await prisma.room.update({ where: { id: a.rooms[2]!.id }, data: { status: 'OUT_OF_SERVICE' } });
      const readyAt = atRiadTime(addDays(today, 1), '15:00').getTime();
      expect(await cycle.freeCleanedRooms(new Date(readyAt - MINUTE))).toBe(0);
      expect((await room(0)).status).toBe('CLEANING');

      expect(await cycle.freeCleanedRooms(new Date(readyAt + MINUTE))).toBe(2);
      expect((await room(0)).status).toBe('FREE');
      expect((await room(1)).status).toBe('FREE');
      expect((await room(2)).status).toBe('OUT_OF_SERVICE');
      const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: a.rooms[0]!.id, action: 'room.status' }, orderBy: { createdAt: 'desc' } });
      expect(log).toMatchObject({ userId: null, diff: { status: ['CLEANING', 'FREE'], automatic: true } });
      await prisma.room.update({ where: { id: a.rooms[2]!.id }, data: { status: 'FREE' } });
    });
  });

  describe('extra nights', () => {
    let stayId: string;

    it('follows the new departure date', async () => {
      stayId = await checkIn(0, addDays(today, 1));
      await reception.patch(`${API}/stays/${stayId}`).send({ checkOutDate: addDays(today, 2) }).expect(200);
      expect(await cycle.checkOutEndedStays(new Date(atRiadTime(addDays(today, 1), '11:00').getTime() + MINUTE))).toBe(0);
      expect((await stay(stayId)).status).toBe('CHECKED_IN');
    });

    it('refuses nights that another stay holds in this room, and lists the free rooms', async () => {
      // Someone is booked in Room 1 from the day after tomorrow.
      await reception
        .post(`${API}/stays`)
        .send({ source: 'BOOKING', checkInDate: addDays(today, 2), checkOutDate: addDays(today, 4), adults: 1, children: 0, pricePerNight: 50000, roomId: a.rooms[0]!.id, mainGuest: { firstName: 'Ana', lastName: 'Silva' } })
        .expect(201);
      const res = await reception.patch(`${API}/stays/${stayId}`).send({ checkOutDate: addDays(today, 3) }).expect(409);
      expect(res.body.code).toBe('ROOM_BOOKED');
      const details = res.body.details as RoomBookedDetails;
      expect(details.conflict).toMatchObject({ guestName: 'Ana Silva', checkInDate: addDays(today, 2) });
      expect(details.freeRooms.map((r) => r.name)).toEqual(['Room 2', 'Room 3']);
      expect((await stay(stayId)).checkOutDate.toISOString().slice(0, 10)).toBe(addDays(today, 2));
    });

    it('lets staff move the guest to a free room for the longer stay', async () => {
      await reception.patch(`${API}/stays/${stayId}`).send({ checkOutDate: addDays(today, 3), roomId: a.rooms[1]!.id }).expect(200);
      const s = await stay(stayId);
      expect(s).toMatchObject({ roomId: a.rooms[1]!.id, nights: 3 });
      expect((await room(1)).status).toBe('OCCUPIED');
      expect((await room(0)).status).toBe('CLEANING');
    });

    it('refuses a move into a room someone holds', async () => {
      const other = await checkIn(2, addDays(today, 1), 'Zoe');
      const res = await reception.patch(`${API}/stays/${stayId}`).send({ roomId: a.rooms[2]!.id }).expect(409);
      expect(res.body.code).toBe('ROOM_BOOKED');
      expect((await stay(other)).roomId).toBe(a.rooms[2]!.id);
    });
  });
});
