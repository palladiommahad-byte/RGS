import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { addDays, todayIso, type StayDetailDto, type TodayDto } from '@riad/shared';
import type TestAgent from 'supertest/lib/agent';
import { createApp, createRiad, loginAs, resetDatabase, type RiadFixture } from './fixtures';

const API = '/api/v1';

describe('Rooms & stays (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let a: RiadFixture;
  let b: RiadFixture;
  let ownerA: TestAgent;
  let receptionA: TestAgent;
  let housekeepingA: TestAgent;
  let ownerB: TestAgent;

  const today = todayIso();
  const stayBody = (overrides: Record<string, unknown> = {}) => ({
    source: 'WALK_IN',
    checkInDate: today,
    checkOutDate: addDays(today, 3),
    adults: 2,
    children: 0,
    pricePerNight: 95050,
    mainGuest: {
      firstName: 'Amina',
      lastName: 'Benali',
      nationality: 'mar',
      documentType: 'PASSPORT',
      documentNumber: 'AB1234567',
    },
    ...overrides,
  });

  beforeAll(async () => {
    prisma = new PrismaClient();
    await resetDatabase(prisma);
    a = await createRiad(prisma, 'Riad A');
    b = await createRiad(prisma, 'Riad B');
    app = await createApp();
    ownerA = await loginAs(app, a.emails.OWNER);
    receptionA = await loginAs(app, a.emails.RECEPTION);
    housekeepingA = await loginAs(app, a.emails.HOUSEKEEPING);
    ownerB = await loginAs(app, b.emails.OWNER);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  describe('tenant isolation', () => {
    it('lists only the caller riad rooms', async () => {
      const res = await ownerB.get(`${API}/rooms`).expect(200);
      expect(res.body.total).toBe(3);
      const ids = res.body.items.map((r: { id: string }) => r.id);
      expect(ids).not.toContain(a.rooms[0]!.id);
    });

    it("returns 404 for another riad's room and stay", async () => {
      await ownerB.get(`${API}/rooms/${a.rooms[0]!.id}`).expect(404);
      await ownerB.patch(`${API}/rooms/${a.rooms[0]!.id}`).send({ type: 'Hacked' }).expect(404);
      const stay = await receptionA.post(`${API}/stays`).send(stayBody()).expect(201);
      await ownerB.get(`${API}/stays/${stay.body.id}`).expect(404);
      await ownerB.post(`${API}/stays/${stay.body.id}/cancel`).expect(404);
    });

    it("cannot check a guest into another riad's room", async () => {
      const stay = await ownerB.post(`${API}/stays`).send(stayBody()).expect(201);
      await ownerB
        .post(`${API}/stays/${stay.body.id}/confirm`)
        .send({ roomId: a.rooms[0]!.id, source: 'DIRECT', pricePerNight: 1 })
        .expect(404);
    });

    it('ignores riadId smuggled in the body', async () => {
      const res = await ownerB
        .post(`${API}/rooms`)
        .send({ name: 'X', type: 'Double', capacity: 2, basePrice: 1, riadId: a.riadId })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('permissions', () => {
    it('lets only owner/manager manage rooms', async () => {
      const body = { name: 'Suite Majorelle', type: 'Suite', capacity: 3, basePrice: 150000 };
      await receptionA.post(`${API}/rooms`).send(body).expect(403);
      await housekeepingA.post(`${API}/rooms`).send(body).expect(403);
      const res = await ownerA.post(`${API}/rooms`).send(body).expect(201);
      expect(res.body.qrToken).toBeDefined();
      await ownerA.post(`${API}/rooms`).send(body).expect(409); // duplicate name
    });

    it('hides QR tokens from users who cannot manage rooms', async () => {
      const res = await housekeepingA.get(`${API}/rooms`).expect(200);
      expect(res.body.items[0].qrToken).toBeUndefined();
    });

    it('keeps housekeeping away from stays and the Today view', async () => {
      await housekeepingA.get(`${API}/stays`).expect(403);
      await housekeepingA.get(`${API}/today`).expect(403);
      await housekeepingA.post(`${API}/stays`).send(stayBody()).expect(403);
    });

    it('lets housekeeping change a room status', async () => {
      const room = a.rooms[2]!;
      const res = await housekeepingA.patch(`${API}/rooms/${room.id}/status`).send({ status: 'CLEANING' }).expect(200);
      expect(res.body.status).toBe('CLEANING');
      await housekeepingA.patch(`${API}/rooms/${room.id}/status`).send({ status: 'FREE' }).expect(200);
      const bad = await housekeepingA.patch(`${API}/rooms/${room.id}/status`).send({ status: 'OCCUPIED' }).expect(409);
      expect(bad.body.code).toBe('INVALID_ROOM_STATUS');
    });
  });

  describe('stay lifecycle', () => {
    let stayId: string;
    const room = () => a.rooms[0]!;

    it('creates a pending stay and encrypts the document number at rest', async () => {
      const res = await receptionA.post(`${API}/stays`).send(stayBody({ roomId: room().id })).expect(201);
      const stay = res.body as StayDetailDto;
      stayId = stay.id;
      expect(stay.status).toBe('PENDING');
      expect(stay.nights).toBe(3);
      expect(stay.totalAccommodation).toBe(285150);
      expect(stay.requestedRoom?.id).toBe(room().id);
      expect(stay.room).toBeNull();
      expect(stay.guests[0]).toMatchObject({ isMain: true, nationality: 'MAR', documentNumber: 'AB1234567' });

      const row = await prisma.guest.findFirstOrThrow({ where: { stayId } });
      expect(row.documentNumber).not.toContain('AB1234567');
      expect(row.documentNumberHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('rejects check-out before check-in', async () => {
      const res = await receptionA
        .post(`${API}/stays`)
        .send(stayBody({ checkOutDate: today }))
        .expect(400);
      expect(res.body.code).toBe('INVALID_DATES');
    });

    it('shows the stay as pending on the Today view', async () => {
      const res = await receptionA.get(`${API}/today`).expect(200);
      const t = res.body as TodayDto;
      expect(t.date).toBe(today);
      expect(t.pending.map((s) => s.id)).toContain(stayId);
    });

    it('confirms: stay CHECKED_IN, room OCCUPIED, price recomputed, audited', async () => {
      const res = await receptionA
        .post(`${API}/stays/${stayId}/confirm`)
        .send({ roomId: room().id, source: 'BOOKING', externalRef: 'BK-998877', pricePerNight: 100000, otaCommission: 45000 })
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'CHECKED_IN',
        room: { id: room().id },
        totalAccommodation: 300000,
        otaCommission: 45000,
        source: 'BOOKING',
      });
      expect(res.body.confirmedBy.name).toContain('RECEPTION');
      const r = await prisma.room.findUniqueOrThrow({ where: { id: room().id } });
      expect(r.status).toBe('OCCUPIED');
      const log = await prisma.auditLog.findFirst({ where: { entityId: stayId, action: 'stay.confirm' } });
      expect(log).not.toBeNull();
    });

    it('refuses a second check-in into the occupied room', async () => {
      const other = await receptionA.post(`${API}/stays`).send(stayBody()).expect(201);
      const res = await receptionA
        .post(`${API}/stays/${other.body.id}/confirm`)
        .send({ roomId: room().id, source: 'DIRECT', pricePerNight: 90000 })
        .expect(409);
      expect(res.body.code).toBe('ROOM_NOT_AVAILABLE');
      const stillPending = await receptionA.get(`${API}/stays/${other.body.id}`).expect(200);
      expect(stillPending.body.status).toBe('PENDING');
    });

    it('does not let housekeeping free an occupied room by hand', async () => {
      await housekeepingA.patch(`${API}/rooms/${room().id}/status`).send({ status: 'FREE' }).expect(409);
    });

    it('moves a checked-in guest to another room', async () => {
      const target = a.rooms[1]!;
      const res = await receptionA.patch(`${API}/stays/${stayId}`).send({ roomId: target.id }).expect(200);
      expect(res.body.room.id).toBe(target.id);
      const [oldRoom, newRoom] = await Promise.all([
        prisma.room.findUniqueOrThrow({ where: { id: room().id } }),
        prisma.room.findUniqueOrThrow({ where: { id: target.id } }),
      ]);
      expect(oldRoom.status).toBe('CLEANING');
      expect(newRoom.status).toBe('OCCUPIED');
    });

    it('adds, edits and removes companions but never the main guest', async () => {
      const added = await receptionA
        .post(`${API}/stays/${stayId}/guests`)
        .send({ firstName: 'Youssef', lastName: 'Benali' })
        .expect(201);
      const updated = await receptionA
        .patch(`${API}/stays/${stayId}/guests/${added.body.id}`)
        .send({ documentNumber: 'ZX99', email: null })
        .expect(200);
      expect(updated.body.documentNumber).toBe('ZX99');
      await receptionA.delete(`${API}/stays/${stayId}/guests/${added.body.id}`).expect(204);
      const detail = await receptionA.get(`${API}/stays/${stayId}`).expect(200);
      const main = (detail.body as StayDetailDto).guests.find((g) => g.isMain)!;
      const res = await receptionA.delete(`${API}/stays/${stayId}/guests/${main.id}`).expect(409);
      expect(res.body.code).toBe('MAIN_GUEST');
    });

    it('checks out: stay CHECKED_OUT, room CLEANING, then locked', async () => {
      // Billing rules are covered in billing.e2e-spec; here the guest settles later.
      await receptionA.post(`${API}/stays/${stayId}/checkout`).send({ acceptBalanceDue: true }).expect(200);
      const res = await receptionA.get(`${API}/stays/${stayId}`).expect(200);
      expect(res.body.status).toBe('CHECKED_OUT');
      expect(res.body.checkedOutAt).not.toBeNull();
      expect(res.body.invoices).toHaveLength(1);
      const r = await prisma.room.findUniqueOrThrow({ where: { id: a.rooms[1]!.id } });
      expect(r.status).toBe('CLEANING');

      await receptionA.post(`${API}/stays/${stayId}/checkout`).expect(409);
      await receptionA.post(`${API}/stays/${stayId}/cancel`).expect(409);
      const edit = await receptionA.patch(`${API}/stays/${stayId}`).send({ adults: 1 }).expect(409);
      expect(edit.body.code).toBe('STAY_LOCKED');
    });

    it('searches stays by guest name and external reference', async () => {
      const byName = await receptionA.get(`${API}/stays?search=benal&limit=50`).expect(200);
      expect(byName.body.total).toBeGreaterThanOrEqual(2);
      const byRef = await receptionA.get(`${API}/stays?search=bk-998877`).expect(200);
      expect(byRef.body.items.map((s: { id: string }) => s.id)).toEqual([stayId]);
      const bad = await receptionA.get(`${API}/stays?limit=1000`).expect(400);
      expect(bad.body.code).toBe('VALIDATION_ERROR');
    });

    it('lets reception check a walk-in straight in', async () => {
      const res = await receptionA
        .post(`${API}/stays`)
        .send(stayBody({ roomId: a.rooms[2]!.id, checkInNow: true }))
        .expect(201);
      expect(res.body.status).toBe('CHECKED_IN');
      const t = (await receptionA.get(`${API}/today`).expect(200)).body as TodayDto;
      expect(t.arrivals.map((s) => s.id)).toContain(res.body.id);
      expect(t.rooms.occupied).toBe(1);
    });

    it("lists a room's stays, including QR check-ins that asked for it", async () => {
      const room = a.rooms[1]!;
      // A guest's QR check-in: no room assigned yet, only the one they asked for.
      const requested = await prisma.stay.create({
        data: {
          riadId: a.riadId,
          requestedRoomId: room.id,
          checkInDate: new Date('2030-01-10T00:00:00Z'),
          checkOutDate: new Date('2030-01-12T00:00:00Z'),
          nights: 2,
          pricePerNight: 0,
          totalAccommodation: 0,
          status: 'PENDING',
        },
      });
      const list = await receptionA.get(`${API}/stays?roomId=${room.id}&from=2030-01-01&to=2030-02-01`).expect(200);
      expect(list.body.items.map((s: { id: string }) => s.id)).toEqual([requested.id]);
      const other = await receptionA.get(`${API}/stays?roomId=${a.rooms[2]!.id}&from=2030-01-01&to=2030-02-01`).expect(200);
      expect(other.body.total).toBe(0);
      await receptionA.get(`${API}/stays?roomId=not-a-uuid`).expect(400);
    });
  });
});
