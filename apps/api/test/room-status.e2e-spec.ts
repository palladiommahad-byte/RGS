import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { addDays, todayIso, type RoomDto } from '@riad/shared';
import type TestAgent from 'supertest/lib/agent';
import { RealtimeGateway } from '../src/realtime/realtime.gateway';
import { createApp, createRiad, loginAs, resetDatabase, type RiadFixture } from './fixtures';

const API = '/api/v1';

/** Records what open dashboards would be told. */
class FakeRealtime {
  events: string[] = [];
  emitToRiad(_riadId: string, event: string): void {
    this.events.push(event);
  }
  roomsChanged(): void {
    this.events.push('rooms:changed');
  }
  staysChanged(): void {
    this.events.push('stays:changed');
  }
}

describe('Room status follows the guest (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let a: RiadFixture;
  let reception: TestAgent;
  let housekeeping: TestAgent;
  const realtime = new FakeRealtime();

  beforeAll(async () => {
    prisma = new PrismaClient();
    await resetDatabase(prisma);
    a = await createRiad(prisma, 'Riad A');
    app = await createApp((builder) => builder.overrideProvider(RealtimeGateway).useValue(realtime));
    reception = await loginAs(app, a.emails.RECEPTION);
    housekeeping = await loginAs(app, a.emails.HOUSEKEEPING);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  const status = async (roomId: string) => ((await housekeeping.get(`${API}/rooms/${roomId}`).expect(200)).body as RoomDto).status;

  it('check-in -> occupied, check-out -> to clean, cleaned -> free, each change announced', async () => {
    const room = a.rooms[0]!.id;
    const today = todayIso();
    const stay = await reception
      .post(`${API}/stays`)
      .send({
        source: 'WALK_IN',
        checkInDate: today,
        checkOutDate: addDays(today, 1),
        adults: 1,
        children: 0,
        pricePerNight: 0,
        roomId: room,
        checkInNow: true,
        mainGuest: { firstName: 'Sara', lastName: 'Idrissi', nationality: 'MAR', documentType: 'PASSPORT', documentNumber: 'X1' },
      })
      .expect(201);
    expect(await status(room)).toBe('OCCUPIED');
    expect(realtime.events).toEqual(expect.arrayContaining(['rooms:changed', 'stays:changed']));

    realtime.events = [];
    await reception.post(`${API}/stays/${stay.body.id}/checkout`).send({ acceptBalanceDue: true }).expect(200);
    expect(await status(room)).toBe('CLEANING');
    expect(realtime.events).toEqual(expect.arrayContaining(['rooms:changed', 'stays:changed']));

    realtime.events = [];
    await housekeeping.patch(`${API}/rooms/${room}/status`).send({ status: 'FREE' }).expect(200);
    expect(await status(room)).toBe('FREE');
    expect(realtime.events).toEqual(['rooms:changed']);
  });
});
