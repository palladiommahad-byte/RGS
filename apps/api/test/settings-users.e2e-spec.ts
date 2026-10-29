import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { AuthUser, Paginated, RiadSettingsDto, RoleDto, UserDto } from '@riad/shared';
import sharp from 'sharp';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { StorageService } from '../src/storage/storage.service';
import { createApp, createRiad, FakeStorage, loginAs, PASSWORD, resetDatabase, resetRateLimits, type RiadFixture } from './fixtures';

const API = '/api/v1';

describe('Settings & users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let storage: FakeStorage;
  let a: RiadFixture;
  let b: RiadFixture;
  let owner: TestAgent;
  let manager: TestAgent;
  let reception: TestAgent;
  let ownerB: TestAgent;
  let roles: Record<string, string>;

  const userId = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  const login = (email: string, password: string) =>
    request(app.getHttpServer()).post(`${API}/auth/login`).send({ email, password });

  beforeAll(async () => {
    prisma = new PrismaClient();
    await resetDatabase(prisma);
    a = await createRiad(prisma, 'Riad A');
    b = await createRiad(prisma, 'Riad B');
    storage = new FakeStorage();
    app = await createApp((builder) => builder.overrideProvider(StorageService).useValue(storage));
    owner = await loginAs(app, a.emails.OWNER);
    manager = await loginAs(app, a.emails.MANAGER);
    reception = await loginAs(app, a.emails.RECEPTION);
    ownerB = await loginAs(app, b.emails.OWNER);
    const list = (await owner.get(`${API}/roles`).expect(200)).body as RoleDto[];
    roles = Object.fromEntries(list.map((r) => [r.key, r.id]));
  });

  // Many sign-ins here: start every test with fresh rate-limit counters.
  beforeEach(() => resetRateLimits(app));

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  describe('riad settings', () => {
    it('is reserved to the owner', async () => {
      await manager.get(`${API}/settings/riad`).expect(403);
      await manager.patch(`${API}/settings/riad`).send({ name: 'X' }).expect(403);
      await reception.get(`${API}/settings/riad`).expect(403);
    });

    it('updates the profile, normalises the prefix and previews the next invoice number', async () => {
      const year = new Date().getUTCFullYear();
      const res = await owner
        .patch(`${API}/settings/riad`)
        .send({ name: 'Riad Atlas', invoicePrefix: 'ra-', ice: '001234567000089', wifiInfo: 'Réseau : Atlas\nCode : 1234' })
        .expect(200);
      const s = res.body as RiadSettingsDto;
      expect(s).toMatchObject({ name: 'Riad Atlas', invoicePrefix: 'RA-', ice: '001234567000089' });
      expect([`RA--${year}-00001`, `RA--${year + 1}-00001`]).toContain(s.nextInvoiceNumber);

      await owner.patch(`${API}/settings/riad`).send({ ice: '12345' }).expect(400);
      await owner.patch(`${API}/settings/riad`).send({ invoicePrefix: 'FAC/26' }).expect(400);
      const cleared = (await owner.patch(`${API}/settings/riad`).send({ wifiInfo: '', ice: '' }).expect(200)).body as RiadSettingsDto;
      expect(cleared).toMatchObject({ wifiInfo: null, ice: null, name: 'Riad Atlas' });
      const log = await prisma.auditLog.findFirstOrThrow({ where: { riadId: a.riadId, action: 'riad.update' }, orderBy: { createdAt: 'asc' } });
      expect(log.diff).toMatchObject({ name: ['Riad A', 'Riad Atlas'] });
    });

    it('stores a re-encoded logo, serves it to staff only, and removes it', async () => {
      const png = await sharp({ create: { width: 900, height: 300, channels: 3, background: '#134e48' } }).jpeg().toBuffer();
      await owner.post(`${API}/settings/riad/logo`).attach('file', Buffer.from('<svg/>'), { filename: 'x.svg', contentType: 'image/svg+xml' }).expect(400);
      const up = (await owner.post(`${API}/settings/riad/logo`).attach('file', png, { filename: 'logo.jpg', contentType: 'image/jpeg' }).expect(201))
        .body as RiadSettingsDto;
      expect(up.logoVersion).toMatch(/^\d+$/);
      expect(storage.keys('documents', `riads/${a.riadId}/branding/`)).toHaveLength(1);

      const me = (await reception.get(`${API}/auth/me`).expect(200)).body as AuthUser;
      expect(me.riad.logoVersion).toBe(up.logoVersion);
      const img = await reception.get(`${API}/riad/logo`).responseType('blob').expect(200);
      expect(img.headers['content-type']).toBe('image/png');
      expect((await sharp(img.body as Buffer).metadata()).width).toBe(512);
      await ownerB.get(`${API}/riad/logo`).expect(404);
      await request(app.getHttpServer()).get(`${API}/riad/logo`).expect(401);

      const removed = (await owner.delete(`${API}/settings/riad/logo`).expect(200)).body as RiadSettingsDto;
      expect(removed.logoVersion).toBeNull();
      expect(storage.keys('documents', `riads/${a.riadId}/branding/`)).toHaveLength(0);
    });
  });

  describe('users', () => {
    it('is closed to reception', async () => {
      await reception.get(`${API}/users`).expect(403);
      await reception.get(`${API}/roles`).expect(403);
    });

    it('lists the riad users with what the current user may manage', async () => {
      const list = (await manager.get(`${API}/users`).expect(200)).body as Paginated<UserDto>;
      expect(list.total).toBe(4);
      const byRole = Object.fromEntries(list.items.map((u) => [u.role.key, u]));
      expect(byRole.OWNER!.manageable).toBe(false);
      expect(byRole.RECEPTION!.manageable).toBe(true);
      expect(byRole.MANAGER!.isSelf).toBe(true);
      const r = (await manager.get(`${API}/roles`).expect(200)).body as RoleDto[];
      expect(r.find((x) => x.key === 'OWNER')!.assignable).toBe(false);
      expect(r.find((x) => x.key === 'RECEPTION')).toMatchObject({ assignable: true, userCount: 1 });
    });

    it('creates an account that can sign in, with a unique email', async () => {
      const res = await manager
        .post(`${API}/users`)
        .send({ name: 'Nadia', email: ' Nadia@Test.Local ', roleId: roles.RECEPTION, password: 'Bienvenue1' })
        .expect(201);
      expect(res.body).toMatchObject({ email: 'nadia@test.local', role: { key: 'RECEPTION' }, isActive: true });
      await login('nadia@test.local', 'Bienvenue1').expect(200);
      expect((await manager.post(`${API}/users`).send({ name: 'X', email: b.emails.OWNER, roleId: roles.RECEPTION, password: 'whatever1' }).expect(409)).body.code).toBe(
        'EMAIL_TAKEN',
      );
      await manager.post(`${API}/users`).send({ name: 'X', email: 'short@test.local', roleId: roles.RECEPTION, password: 'short' }).expect(400);
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'user.create', entityId: res.body.id } });
      expect(JSON.stringify(audit.diff)).not.toContain('Bienvenue1');
    });

    it('never lets a manager create, edit or reset an owner', async () => {
      const create = await manager.post(`${API}/users`).send({ name: 'Boss', email: 'boss@test.local', roleId: roles.OWNER, password: 'password1' }).expect(403);
      expect(create.body.code).toBe('ROLE_NOT_ASSIGNABLE');
      const ownerId = await userId(a.emails.OWNER);
      expect((await manager.patch(`${API}/users/${ownerId}`).send({ isActive: false }).expect(403)).body.code).toBe('USER_NOT_MANAGEABLE');
      await manager.post(`${API}/users/${ownerId}/password`).send({ password: 'hijacked1' }).expect(403);
      // Nor promote someone to owner.
      const receptionId = await userId(a.emails.RECEPTION);
      await manager.patch(`${API}/users/${receptionId}`).send({ roleId: roles.OWNER }).expect(403);
    });

    it('prevents self-lockout', async () => {
      const ownerId = await userId(a.emails.OWNER);
      expect((await owner.patch(`${API}/users/${ownerId}`).send({ isActive: false }).expect(409)).body.code).toBe('CANNOT_CHANGE_SELF');
      await owner.patch(`${API}/users/${ownerId}`).send({ roleId: roles.MANAGER }).expect(409);
      await owner.post(`${API}/users/${ownerId}/password`).send({ password: 'whatever1' }).expect(409);
      // Renaming yourself is fine.
      await owner.patch(`${API}/users/${ownerId}`).send({ name: 'Propriétaire' }).expect(200);
    });

    it('applies a role change at once', async () => {
      const email = 'promoted@test.local';
      await owner.post(`${API}/users`).send({ name: 'Promu', email, roleId: roles.RECEPTION, password: 'password1' }).expect(201);
      const agent = await loginAs(app, email, 'password1');
      await agent.get(`${API}/finance/dashboard?from=2026-10-01&to=2026-10-31`).expect(403);
      await owner.patch(`${API}/users/${await userId(email)}`).send({ roleId: roles.MANAGER }).expect(200);
      // Sessions end with a role change: sign in again and the new rights apply.
      const again = await loginAs(app, email, 'password1');
      await again.get(`${API}/finance/dashboard?from=2026-10-01&to=2026-10-31`).expect(200);
    });

    it('cuts a deactivated user off immediately', async () => {
      const email = 'leaving@test.local';
      await manager.post(`${API}/users`).send({ name: 'Départ', email, roleId: roles.HOUSEKEEPING, password: 'password1' }).expect(201);
      const agent = await loginAs(app, email, 'password1');
      await agent.get(`${API}/auth/me`).expect(200);
      await manager.patch(`${API}/users/${await userId(email)}`).send({ isActive: false }).expect(200);
      await agent.get(`${API}/auth/me`).expect(401);
      await agent.post(`${API}/auth/refresh`).expect(401);
      await login(email, 'password1').expect(401);
    });

    it('resets a password and ends the sessions', async () => {
      const email = 'forgot@test.local';
      await manager.post(`${API}/users`).send({ name: 'Oubli', email, roleId: roles.RECEPTION, password: 'password1' }).expect(201);
      const agent = await loginAs(app, email, 'password1');
      await manager.post(`${API}/users/${await userId(email)}/password`).send({ password: 'nouveau-mdp' }).expect(204);
      await agent.post(`${API}/auth/refresh`).expect(401);
      await login(email, 'password1').expect(401);
      await login(email, 'nouveau-mdp').expect(200);
    });

    it('isolates riads', async () => {
      await ownerB.patch(`${API}/users/${await userId(a.emails.RECEPTION)}`).send({ name: 'Pirate' }).expect(404);
      await ownerB.post(`${API}/users`).send({ name: 'X', email: 'x@test.local', roleId: roles.RECEPTION, password: 'password1' }).expect(404);
    });
  });

  describe('change my password', () => {
    it('checks the current password, keeps this session and signs out the others', async () => {
      const email = a.emails.HOUSEKEEPING;
      const here = await loginAs(app, email);
      const elsewhere = await loginAs(app, email);
      expect((await here.post(`${API}/auth/change-password`).send({ current: 'wrong', next: 'tout-nouveau' }).expect(400)).body.code).toBe('WRONG_PASSWORD');
      await here.post(`${API}/auth/change-password`).send({ current: PASSWORD, next: 'tout-nouveau' }).expect(204);
      await here.get(`${API}/auth/me`).expect(200);
      await here.post(`${API}/auth/refresh`).expect(204);
      await elsewhere.post(`${API}/auth/refresh`).expect(401);
      await login(email, PASSWORD).expect(401);
      await login(email, 'tout-nouveau').expect(200);
    });
  });
});
