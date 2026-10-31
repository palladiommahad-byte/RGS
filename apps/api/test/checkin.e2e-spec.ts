import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { addDays, todayIso, type NotificationListDto, type StayDetailDto, type TodayDto } from '@riad/shared';
import sharp from 'sharp';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { PASSPORT_OCR } from '../src/ocr/passport-ocr.provider';
import { RealtimeGateway } from '../src/realtime/realtime.gateway';
import { RetentionService } from '../src/retention/retention.service';
import { StorageService } from '../src/storage/storage.service';
import { createApp, createRiad, FakeStorage, loginAs, resetDatabase, type RiadFixture } from './fixtures';

const API = '/api/v1';
const GERMAN_MRZ = 'P<D<<MUSTERMANN<<ERIKA<<<<<<<<<<<<<<<<<<<<<<\nC01X00T478D<<6408125F2702283<<<<<<<<<<<<<<<4';

describe('QR self check-in (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let storage: FakeStorage;
  let a: RiadFixture;
  let b: RiadFixture;
  let roomToken: string; // Room 2 of riad A
  let room3Token: string;
  let tokenB: string; // a room of riad B
  let receptionA: TestAgent;
  let housekeepingA: TestAgent;
  let emit: jest.SpyInstance;
  let photo: Buffer;
  let signature: string;
  const ocrText = { value: GERMAN_MRZ };

  const tomorrow = addDays(todayIso(), 1);
  const http = () => request(app.getHttpServer());

  const scan = (link: Record<string, string>, image = photo, type = 'image/jpeg') => {
    const req = http().post(`${API}/checkin/scan-passport`);
    for (const [k, v] of Object.entries(link)) void req.field(k, v);
    return req.attach('image', image, { filename: 'passport.jpg', contentType: type });
  };

  const body = (overrides: Record<string, unknown> = {}) => ({
    room: roomToken,
    locale: 'en',
    phone: '+4915112345678',
    email: 'erika@example.com',
    adults: 1,
    children: 0,
    checkOutDate: tomorrow,
    consent: true,
    signature,
    guests: [{ firstName: 'Erika', lastName: 'Mustermann', nationality: 'DEU', documentType: 'PASSPORT', documentNumber: 'C01X00T47' }],
    ...overrides,
  });

  beforeAll(async () => {
    prisma = new PrismaClient();
    await resetDatabase(prisma);
    a = await createRiad(prisma, 'Riad A');
    b = await createRiad(prisma, 'Riad B');
    await prisma.riad.update({ where: { id: a.riadId }, data: { wifiInfo: 'RiadGuest / bienvenue' } });
    const token = async (id: string) => (await prisma.room.findUniqueOrThrow({ where: { id } })).qrToken;
    roomToken = await token(a.rooms[1]!.id);
    room3Token = await token(a.rooms[2]!.id);
    tokenB = await token(b.rooms[0]!.id);

    storage = new FakeStorage();
    app = await createApp((builder) =>
      builder
        .overrideProvider(StorageService)
        .useValue(storage)
        .overrideProvider(PASSPORT_OCR)
        .useValue({ name: 'fake', recognize: async () => ocrText.value }),
    );
    emit = jest.spyOn(app.get(RealtimeGateway), 'emitToRiad');
    receptionA = await loginAs(app, a.emails.RECEPTION);
    housekeepingA = await loginAs(app, a.emails.HOUSEKEEPING);

    photo = await sharp({ create: { width: 640, height: 450, channels: 3, background: '#d9e4ff' } }).jpeg().toBuffer();
    const png = await sharp({ create: { width: 300, height: 120, channels: 4, background: '#ffffff00' } }).png().toBuffer();
    signature = `data:image/png;base64,${png.toString('base64')}`;
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  describe('context', () => {
    it('knows the room from its QR code', async () => {
      const room = await http().get(`${API}/checkin/context?room=${roomToken}`).expect(200);
      expect(room.body).toMatchObject({ riadName: 'Riad A', roomName: 'Room 2', retentionDays: 90 });
    });

    it('rejects unknown links', async () => {
      const res = await http().get(`${API}/checkin/context?room=nope`).expect(404);
      expect(res.body.code).toBe('INVALID_CHECKIN_LINK');
      // There is no riad-wide (entrance) code any more: a room is required.
      await http().get(`${API}/checkin/context`).expect(400);
      await http().get(`${API}/checkin/context?r=whatever`).expect(400);
    });
  });

  describe('scan-passport', () => {
    it('stores the photo as pending and returns the MRZ fields', async () => {
      const res = await scan({ room: roomToken }).expect(200);
      expect(res.body.photoRef).toMatch(/^[0-9a-f-]{36}\.[\w-]+$/);
      expect(res.body.mrz).toMatchObject({
        valid: true,
        fields: { lastName: 'Mustermann', firstName: 'Erika', nationality: 'DEU', birthDate: '1964-08-12' },
      });
      expect(storage.keys('passports', `pending/${a.riadId}/`)).toHaveLength(1);
    });

    it('answers mrz: null when nothing is readable (manual entry)', async () => {
      ocrText.value = 'just a blurry photo';
      const res = await scan({ room: roomToken }).expect(200);
      expect(res.body.mrz).toBeNull();
      ocrText.value = GERMAN_MRZ;
    });

    it('refuses non-images and unknown links', async () => {
      const res = await scan({ room: roomToken }, Buffer.from('hello'), 'text/plain').expect(400);
      expect(res.body.code).toBe('UNSUPPORTED_IMAGE');
      await scan({ room: 'nope' }).expect(404);
    });
  });

  describe('submit', () => {
    let stayId: string; // pending, for reception

    it('checks the guest straight into a free room, moves the photo and stores the signature', async () => {
      const scanned = await scan({ room: roomToken }).expect(200);
      emit.mockClear();
      const res = await http()
        .post(`${API}/checkin/submit`)
        .send(
          body({
            adults: 2,
            children: 1,
            checkOutDate: addDays(todayIso(), 2),
            guests: [
              { ...body().guests[0], photoRef: scanned.body.photoRef, mrzRaw: GERMAN_MRZ },
              { firstName: 'Max', lastName: 'Mustermann' },
            ],
          }),
        )
        .expect(201);
      expect(res.body).toEqual({ riadName: 'Riad A', wifiInfo: 'RiadGuest / bienvenue', checkedIn: true, roomName: 'Room 2' });

      // No "to confirm" toast: the stay is already checked in, at the room's base price.
      expect(emit).not.toHaveBeenCalledWith(a.riadId, 'checkin:new', expect.anything());
      const stay = await prisma.stay.findFirstOrThrow({ where: { riadId: a.riadId }, orderBy: { createdAt: 'desc' } });
      expect(stay).toMatchObject({ status: 'CHECKED_IN', roomId: a.rooms[1]!.id, source: 'DIRECT', pricePerNight: 90000, totalAccommodation: 180000, nights: 2 });
      expect(stay.confirmedAt).not.toBeNull();
      expect((await prisma.room.findUniqueOrThrow({ where: { id: a.rooms[1]!.id } })).status).toBe('OCCUPIED');

      // The team is told the guest is in (housekeeping too, without the name).
      const notes = (await receptionA.get(`${API}/notifications`).expect(200)).body as NotificationListDto;
      expect(notes.items[0]).toMatchObject({ type: 'CHECKIN', actor: null, data: { stayId: stay.id, roomName: 'Room 2', guestName: 'Erika Mustermann' } });
      const forHousekeeping = (await housekeepingA.get(`${API}/notifications`).expect(200)).body as NotificationListDto;
      expect(forHousekeeping.items[0]).toMatchObject({ type: 'CHECKIN', data: { roomName: 'Room 2', guestName: null } });

      const detail = (await receptionA.get(`${API}/stays/${stay.id}`).expect(200)).body as StayDetailDto;
      const main = detail.guests.find((g) => g.isMain)!;
      expect(detail).toMatchObject({ adults: 2, children: 1, guestCount: 2 });
      expect(main).toMatchObject({ phone: '+4915112345678', documentNumber: 'C01X00T47', hasPassportPhoto: true });
      expect(main.consentAt).not.toBeNull();

      const files = await receptionA.get(`${API}/stays/${stay.id}/guests/${main.id}/files`).expect(200);
      expect(files.body.passportPhotoUrl).toContain(`riads/${a.riadId}/stays/${stay.id}/`);
      expect(files.body.signatureUrl).toContain('signature.png');
      expect(storage.keys('passports', `riads/${a.riadId}/stays/${stay.id}/`)).toHaveLength(2);
      // The pending upload used by this check-in is gone.
      const ref = (scanned.body.photoRef as string).split('.')[0];
      expect(storage.has('passports', `pending/${a.riadId}/${ref}.jpg`)).toBe(false);
      const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: stay.id, action: 'stay.self_checkin' } });
      expect(log.diff).toMatchObject({ checkedIn: true, roomId: a.rooms[1]!.id });
    });

    it('leaves the check-in to reception when the room is not free', async () => {
      emit.mockClear();
      // Room 2 is now occupied by the guest above.
      const res = await http().post(`${API}/checkin/submit`).send(body()).expect(201);
      expect(res.body).toMatchObject({ checkedIn: false, roomName: 'Room 2' });
      expect(emit).toHaveBeenCalledWith(a.riadId, 'checkin:new', expect.objectContaining({ status: 'PENDING' }));
      stayId = (emit.mock.calls[0]![2] as { id: string }).id;

      const today = (await receptionA.get(`${API}/today`).expect(200)).body as TodayDto;
      expect(today.pending.find((s) => s.id === stayId)).toMatchObject({ requestedRoom: { name: 'Room 2' } });
      const notes = (await receptionA.get(`${API}/notifications`).expect(200)).body as NotificationListDto;
      expect(notes.items[0]).toMatchObject({ type: 'CHECKIN_REQUEST', actor: null, data: { stayId, roomName: 'Room 2', roomNotFree: true } });
    });

    it('also waits for reception when the room is booked for those nights', async () => {
      // Reception already holds Room 3 for a guest arriving today.
      await receptionA
        .post(`${API}/stays`)
        .send({ source: 'BOOKING', checkInDate: todayIso(), checkOutDate: addDays(todayIso(), 3), adults: 1, children: 0, pricePerNight: 50000, roomId: a.rooms[2]!.id, mainGuest: { firstName: 'Ana', lastName: 'Silva' } })
        .expect(201);
      const res = await http().post(`${API}/checkin/submit`).send(body({ room: room3Token })).expect(201);
      expect(res.body).toMatchObject({ checkedIn: false, roomName: 'Room 3' });
      expect((await prisma.room.findUniqueOrThrow({ where: { id: a.rooms[2]!.id } })).status).toBe('FREE');
    });

    it("refuses a photo uploaded through another riad's link", async () => {
      const scannedB = await scan({ room: tokenB }).expect(200);
      const res = await http()
        .post(`${API}/checkin/submit`)
        .send(body({ guests: [{ ...body().guests[0], photoRef: scannedB.body.photoRef }] }))
        .expect(400);
      expect(res.body.code).toBe('INVALID_PHOTO');
    });

    it('validates consent, dates and guest count', async () => {
      await http().post(`${API}/checkin/submit`).send(body({ consent: false })).expect(400);
      const dates = await http().post(`${API}/checkin/submit`).send(body({ checkOutDate: todayIso() })).expect(400);
      expect(dates.body.code).toBe('INVALID_DATES');
      const many = await http()
        .post(`${API}/checkin/submit`)
        .send(body({ guests: [body().guests[0], body().guests[0]] }))
        .expect(400);
      expect(many.body.code).toBe('TOO_MANY_GUESTS');
      await http().post(`${API}/checkin/submit`).send(body({ signature: 'data:image/png;base64,AAAA' })).expect(400);
    });

    it('silently drops honeypot submissions', async () => {
      const before = await prisma.stay.count();
      const res = await http().post(`${API}/checkin/submit`).send(body({ website: 'http://spam' })).expect(201);
      expect(res.body.wifiInfo).toBeNull();
      expect(await prisma.stay.count()).toBe(before);
    });

    it('lets only check-in staff reject, and deletes the files', async () => {
      await housekeepingA.post(`${API}/stays/${stayId}/reject`).expect(403);
      await receptionA.post(`${API}/stays/${stayId}/reject`).expect(204);
      await receptionA.get(`${API}/stays/${stayId}`).expect(404);
      expect(storage.keys('passports', `riads/${a.riadId}/stays/${stayId}/`)).toHaveLength(0);
      expect(await prisma.auditLog.count({ where: { entityId: stayId, action: 'stay.reject' } })).toBe(1);
    });

    it('cannot reject a checked-in stay', async () => {
      const stay = await receptionA
        .post(`${API}/stays`)
        .send({
          source: 'WALK_IN',
          checkInDate: todayIso(),
          checkOutDate: tomorrow,
          adults: 1,
          children: 0,
          pricePerNight: 1,
          roomId: a.rooms[0]!.id,
          checkInNow: true,
          mainGuest: { firstName: 'A', lastName: 'B' },
        })
        .expect(201);
      const res = await receptionA.post(`${API}/stays/${stay.body.id}/reject`).expect(409);
      expect(res.body.code).toBe('INVALID_TRANSITION');
    });
  });

  describe('retention', () => {
    it('deletes passport photos of stays that ended before the retention window', async () => {
      const old = await prisma.stay.create({
        data: {
          riadId: a.riadId,
          status: 'CHECKED_OUT',
          checkInDate: new Date('2025-01-01'),
          checkOutDate: new Date('2025-01-03'),
          nights: 2,
          guests: {
            create: { riadId: a.riadId, isMain: true, firstName: 'Old', lastName: 'Guest', passportPhotoKey: 'riads/x/old.jpg' },
          },
        },
        include: { guests: true },
      });
      await storage.put('passports', 'riads/x/old.jpg', Buffer.from('x'));
      const purged = await app.get(RetentionService).purgePassportPhotos(new Date('2026-10-28'));
      expect(purged).toBe(1);
      expect(storage.has('passports', 'riads/x/old.jpg')).toBe(false);
      const guest = await prisma.guest.findUniqueOrThrow({ where: { id: old.guests[0]!.id } });
      expect(guest.passportPhotoKey).toBeNull();
      expect(guest.lastName).toBe('Guest'); // the register keeps the text data
    });
  });

  it('rate-limits submissions to 10 per hour per IP', async () => {
    let status = 0;
    for (let i = 0; i < 12 && status !== 429; i++) {
      status = (await http().post(`${API}/checkin/submit`).send(body({ website: 'bot' }))).status;
    }
    expect(status).toBe(429);
  });
});
