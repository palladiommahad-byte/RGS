import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_KEYS,
  ROLE_NAMES,
  type RoleKey,
} from '@riad/shared';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

export const PASSWORD = 'Test1234!';

/** In-memory stand-in for S3 so e2e tests do not need MinIO. */
export class FakeStorage {
  readonly objects = new Map<string, Buffer>();
  async put(bucket: string, key: string, body: Buffer): Promise<void> {
    this.objects.set(`${bucket}/${key}`, body);
  }
  async copy(bucket: string, from: string, to: string): Promise<void> {
    const body = this.objects.get(`${bucket}/${from}`);
    if (!body) throw new Error('NoSuchKey');
    this.objects.set(`${bucket}/${to}`, body);
  }
  async delete(bucket: string, keys: (string | null | undefined)[]): Promise<void> {
    for (const k of keys) if (k) this.objects.delete(`${bucket}/${k}`);
  }
  async signedUrl(bucket: string, key: string): Promise<string> {
    return `https://signed.test/${bucket}/${key}?expires=300`;
  }
  async listOlderThan(bucket: string, prefix: string): Promise<string[]> {
    return [...this.objects.keys()]
      .filter((k) => k.startsWith(`${bucket}/${prefix}`))
      .map((k) => k.slice(bucket.length + 1));
  }
  has(bucket: string, key: string): boolean {
    return this.objects.has(`${bucket}/${key}`);
  }
  keys(bucket: string, prefix = ''): string[] {
    return [...this.objects.keys()].filter((k) => k.startsWith(`${bucket}/${prefix}`));
  }
}

export async function createApp(
  configure: (builder: TestingModuleBuilder) => TestingModuleBuilder = (b) => b,
): Promise<INestApplication> {
  const moduleRef = await configure(Test.createTestingModule({ imports: [AppModule] })).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return app;
}

export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE riads, permissions RESTART IDENTITY CASCADE');
}

export type RiadFixture = {
  riadId: string;
  emails: Record<RoleKey, string>;
  rooms: { id: string; name: string }[];
};

/** A riad with the default roles, one user per role and three free rooms. */
export async function createRiad(prisma: PrismaClient, name: string): Promise<RiadFixture> {
  for (const code of ALL_PERMISSIONS) {
    await prisma.permission.upsert({ where: { code }, update: {}, create: { code } });
  }
  const perms = new Map((await prisma.permission.findMany()).map((p) => [p.code, p.id]));
  const riad = await prisma.riad.create({ data: { name } });
  const hash = await argon2.hash(PASSWORD);
  const suffix = randomBytes(4).toString('hex');
  const emails = {} as Record<RoleKey, string>;

  for (const key of ROLE_KEYS) {
    const role = await prisma.role.create({
      data: {
        riadId: riad.id,
        key,
        nameFr: ROLE_NAMES[key].fr,
        nameAr: ROLE_NAMES[key].ar,
        permissions: {
          create: DEFAULT_ROLE_PERMISSIONS[key].map((code) => ({ permissionId: perms.get(code)! })),
        },
      },
    });
    emails[key] = `${key.toLowerCase()}-${suffix}@test.local`;
    await prisma.user.create({
      data: { riadId: riad.id, roleId: role.id, name: `${key} ${name}`, email: emails[key], passwordHash: hash },
    });
  }

  const rooms = [];
  for (let i = 1; i <= 3; i++) {
    rooms.push(
      await prisma.room.create({
        data: {
          riadId: riad.id,
          name: `Room ${i}`,
          type: 'Double',
          capacity: 2,
          basePrice: 90000,
          qrToken: randomBytes(12).toString('base64url'),
        },
        select: { id: true, name: true },
      }),
    );
  }
  return { riadId: riad.id, emails, rooms };
}

export async function loginAs(app: INestApplication, email: string): Promise<TestAgent> {
  const agent = request.agent(app.getHttpServer());
  await agent.post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(200);
  return agent;
}
