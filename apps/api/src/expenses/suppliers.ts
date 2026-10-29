import type { Prisma } from '@prisma/client';

/**
 * Finds a supplier by name (case-insensitive) or creates it. A new or category-less
 * supplier remembers the category, so typing its name next time pre-selects it.
 */
export async function resolveSupplier(
  tx: Prisma.TransactionClient,
  riadId: string,
  name: string,
  categoryId: string,
  userId: string | null,
): Promise<string> {
  // Same supplier whatever the case or accents ("epicerie" = "Épicerie").
  const [match] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM suppliers
    WHERE riad_id = ${riadId}::uuid AND lower(unaccent(name)) = lower(unaccent(${name}))
    LIMIT 1`;
  const existing = match ? await tx.supplier.findUnique({ where: { id: match.id } }) : null;
  if (existing) {
    if (!existing.defaultCategoryId) {
      await tx.supplier.update({ where: { id: existing.id }, data: { defaultCategoryId: categoryId } });
    }
    return existing.id;
  }
  const created = await tx.supplier.create({
    data: { riadId, name, defaultCategoryId: categoryId, createdBy: userId },
  });
  return created.id;
}

/** Ids of the riad's suppliers whose name contains `search`, ignoring case and accents. */
export async function searchSupplierIds(
  db: Pick<Prisma.TransactionClient, '$queryRaw'>,
  riadId: string,
  search: string,
): Promise<string[]> {
  const like = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM suppliers
    WHERE riad_id = ${riadId}::uuid AND unaccent(name) ILIKE unaccent(${like})`;
  return rows.map((r) => r.id);
}
