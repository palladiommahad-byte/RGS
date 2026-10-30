/**
 * Foundation seed: one riad, roles + permissions, rooms, expense categories and TVA.
 * Idempotent — safe to run repeatedly.
 * - development: plus one demo user per role (SEED_DEFAULT_PASSWORD), suppliers, recurring
 *   expenses and a petty-cash wallet (pnpm db:seed-demo adds 3 months of activity).
 * - production (NODE_ENV=production): only the owner account, from SEED_OWNER_EMAIL and
 *   SEED_OWNER_PASSWORD (12+ characters); no demo data, no demo accounts.
 */
import { PrismaClient, TaxCode, TaxMode } from '@prisma/client';
import {
  ALL_PERMISSIONS,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_KEYS,
  ROLE_NAMES,
  type RoleKey,
} from '@riad/shared';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

const RIAD_NAME = process.env.SEED_RIAD_NAME ?? 'Riad Demo';
const ROOM_COUNT = Number(process.env.SEED_ROOM_COUNT ?? 8);
const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? 'Demo1234!';
const PRODUCTION = process.env.NODE_ENV === 'production';

const USERS: { key: RoleKey; name: string; email: string }[] = [
  { key: 'OWNER', name: 'Propriétaire Demo', email: 'owner@riad.local' },
  { key: 'MANAGER', name: 'Gérant Demo', email: 'manager@riad.local' },
  { key: 'RECEPTION', name: 'Réception Demo', email: 'reception@riad.local' },
  { key: 'HOUSEKEEPING', name: 'Ménage Demo', email: 'housekeeping@riad.local' },
];

// Riads typically name rooms after spices/flowers/cities; generic placeholders here.
const ROOM_TEMPLATES = [
  { type: 'Double', capacity: 2, basePrice: 90000 },
  { type: 'Twin', capacity: 2, basePrice: 90000 },
  { type: 'Suite', capacity: 3, basePrice: 150000 },
  { type: 'Familiale', capacity: 4, basePrice: 180000 },
];

const token = () => randomBytes(16).toString('base64url');

async function main(): Promise<void> {
  // Checked before writing anything, so a misconfigured production run changes nothing.
  const owner = PRODUCTION ? productionOwner() : null;
  const existing = await prisma.riad.findFirst({ where: { name: RIAD_NAME } });
  const riad =
    existing ??
    (await prisma.riad.create({
      data: PRODUCTION
        ? { name: RIAD_NAME, invoicePrefix: 'RIAD' }
        : {
            name: RIAD_NAME,
            address: 'Derb Example, Médina',
            city: 'Marrakech',
            phone: '+212 5 24 00 00 00',
            email: 'contact@riad.local',
            invoicePrefix: 'RIAD',
            wifiInfo: 'Réseau: RiadGuest — Mot de passe: (à définir)',
          },
    }));

  // Permissions catalogue (global)
  for (const code of ALL_PERMISSIONS) {
    await prisma.permission.upsert({ where: { code }, update: {}, create: { code } });
  }
  const permissions = await prisma.permission.findMany();
  const permIdByCode = new Map(permissions.map((p) => [p.code, p.id]));

  // Roles for this riad, with the default matrix
  const roleIdByKey = new Map<RoleKey, string>();
  for (const key of ROLE_KEYS) {
    const role = await prisma.role.upsert({
      where: { riadId_key: { riadId: riad.id, key } },
      update: {},
      create: { riadId: riad.id, key, nameFr: ROLE_NAMES[key].fr, nameAr: ROLE_NAMES[key].ar },
    });
    roleIdByKey.set(key, role.id);
    await prisma.rolePermission.createMany({
      data: DEFAULT_ROLE_PERMISSIONS[key].map((code) => ({
        roleId: role.id,
        permissionId: permIdByCode.get(code)!,
      })),
      skipDuplicates: true,
    });
  }

  // Accounts: the owner only in production, one demo user per role otherwise.
  const accounts = owner ? [owner] : USERS.map((u) => ({ ...u, password: DEFAULT_PASSWORD }));
  for (const u of accounts) {
    const passwordHash = await argon2.hash(u.password);
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        riadId: riad.id,
        name: u.name,
        email: u.email,
        passwordHash,
        roleId: roleIdByKey.get(u.key)!,
      },
    });
  }

  // Rooms
  for (let i = 0; i < ROOM_COUNT; i++) {
    const t = ROOM_TEMPLATES[i % ROOM_TEMPLATES.length]!;
    const name = `Chambre ${i + 1}`;
    await prisma.room.upsert({
      where: { riadId_name: { riadId: riad.id, name } },
      update: {},
      create: { riadId: riad.id, name, ...t, qrToken: token(), sortOrder: i },
    });
  }

  // Expense categories
  for (const [i, c] of DEFAULT_EXPENSE_CATEGORIES.entries()) {
    await prisma.expenseCategory.upsert({
      where: { riadId_key: { riadId: riad.id, key: c.key } },
      update: {},
      create: {
        riadId: riad.id,
        key: c.key,
        nameFr: c.nameFr,
        nameAr: c.nameAr,
        icon: c.icon,
        sortOrder: i,
      },
    });
  }

  // Tax settings: only TVA on accommodation is seeded (10%). The manager fills in the
  // others with their accountant — rates are never hard-coded.
  const hasTva = await prisma.taxSetting.findFirst({
    where: { riadId: riad.id, code: TaxCode.TVA_ACCOMMODATION },
  });
  if (!hasTva) {
    await prisma.taxSetting.create({
      data: {
        riadId: riad.id,
        code: TaxCode.TVA_ACCOMMODATION,
        mode: TaxMode.PERCENT,
        value: 1000, // basis points = 10%
        validFrom: new Date('2020-01-01'),
      },
    });
  }

  if (!PRODUCTION) await seedExpenseDemo(riad.id);

  console.log(`Seeded riad "${riad.name}" (${riad.id})`);
  if (PRODUCTION) console.log(`Owner account: ${accounts[0]!.email}`);
  else {
    console.log(`Users (password: ${DEFAULT_PASSWORD}):`);
    for (const u of USERS) console.log(`  ${u.key.padEnd(12)} ${u.email}`);
  }
}

function productionOwner(): { key: RoleKey; name: string; email: string; password: string } {
  const email = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_OWNER_PASSWORD ?? '';
  if (!email || !email.includes('@')) throw new Error('Set SEED_OWNER_EMAIL for the production seed.');
  if (password.length < 12 || password === DEFAULT_PASSWORD) {
    throw new Error('Set SEED_OWNER_PASSWORD (12+ characters, not the demo password) for the production seed.');
  }
  return { key: 'OWNER', name: process.env.SEED_OWNER_NAME?.trim() || 'Propriétaire', email, password };
}

/** Development only: suppliers with a default category, two recurring expenses and a petty-cash wallet for reception. */
async function seedExpenseDemo(riadId: string): Promise<void> {
  const categoryId = async (key: string) =>
    (await prisma.expenseCategory.findUniqueOrThrow({ where: { riadId_key: { riadId: riadId, key } } })).id;
  const suppliers: [string, string][] = [
    ['Épicerie du Derb', 'FOOD'],
    ['Boucherie Mouassine', 'FOOD'],
    ['Blanchisserie Médina', 'CLEANING'],
    ['Droguerie Atlas', 'SUPPLIES'],
    ['Plombier Hassan', 'MAINTENANCE'],
  ];
  for (const [name, key] of suppliers) {
    await prisma.supplier.upsert({
      where: { riadId_name: { riadId: riadId, name } },
      update: {},
      create: { riadId: riadId, name, defaultCategoryId: await categoryId(key) },
    });
  }
  if ((await prisma.recurringExpense.count({ where: { riadId: riadId } })) === 0) {
    await prisma.recurringExpense.createMany({
      data: [
        { riadId: riadId, label: 'Internet fibre', categoryId: await categoryId('UTILITIES'), amount: 49900, dayOfMonth: 5 },
        { riadId: riadId, label: 'Loyer du riad', categoryId: await categoryId('OTHER'), amount: 1500000, dayOfMonth: 1 },
      ],
    });
  }
  const reception = await prisma.user.findUniqueOrThrow({ where: { email: 'reception@riad.local' } });
  if (!(await prisma.cashWallet.findFirst({ where: { riadId: riadId, holderId: reception.id } }))) {
    await prisma.cashWallet.create({
      data: {
        riadId: riadId,
        holderId: reception.id,
        name: 'Caisse réception',
        balance: 150000,
        movements: { create: { riadId: riadId, type: 'TOP_UP', amount: 150000, note: 'Fonds de caisse initial' } },
      },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
