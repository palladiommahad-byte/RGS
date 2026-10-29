'use client';

import { supplierFormSchema, type ExpenseCategoryDto, type Paginated, type SupplierDto } from '@riad/shared';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';
import { FormError, FormField } from '@/components/form-field';
import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { fieldErrors, type FieldErrors } from '@/lib/forms';
import { useAction, useApiQuery } from '@/lib/use-api';
import { CategoryIcon, categoryName } from './category-icon';

const LIMIT = 30;

export function SuppliersTab({ categories }: { categories: ExpenseCategoryDto[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<SupplierDto | null | undefined>(undefined);
  const action = useAction();

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(id);
  }, [search]);

  const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (debounced) params.set('search', debounced);
  const query = useApiQuery<Paginated<SupplierDto>>(`/suppliers?${params.toString()}`);
  const byId = new Map(categories.map((c) => [c.id, c]));

  async function remove(s: SupplierDto) {
    if (!window.confirm(t('suppliers.deleteConfirm', { name: s.name }))) return;
    if (await action.run(() => api(`/suppliers/${s.id}`, { method: 'DELETE' }))) query.reload();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" className="ps-12" placeholder={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button onClick={() => setEditing(null)}>
          <Plus aria-hidden />
          {t('suppliers.new')}
        </Button>
      </div>
      <FormError message={action.error} />
      <Card className="py-0">
        {query.data?.items.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">{t('suppliers.empty')}</p>
        ) : (
          <ul className="divide-y">
            {query.data?.items.map((s) => {
              const c = s.defaultCategoryId ? byId.get(s.defaultCategoryId) : undefined;
              return (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border text-teal-900">
                    <CategoryIcon icon={c?.icon ?? 'package'} className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c ? categoryName(c, locale) : t('suppliers.noCategory')}
                      {s.phone && (
                        <>
                          {' · '}
                          <span dir="ltr">{s.phone}</span>
                        </>
                      )}
                      {' · '}
                      {t('suppliers.expenseCount', { count: s.expenseCount })}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setEditing(s)} aria-label={t('common.edit')}>
                    <Pencil className="size-4" />
                  </Button>
                  {s.expenseCount === 0 && (
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => void remove(s)} aria-label={t('common.delete')}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {query.data && <Pagination page={page} limit={LIMIT} total={query.data.total} onPage={setPage} />}
      <SupplierDialog
        open={editing !== undefined}
        supplier={editing ?? undefined}
        categories={categories}
        onOpenChange={(o) => !o && setEditing(undefined)}
        onDone={query.reload}
      />
    </div>
  );
}

function SupplierDialog({
  open,
  supplier,
  categories,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  supplier?: SupplierDto;
  categories: ExpenseCategoryDto[];
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const { run, pending, error, setError } = useAction();

  useEffect(() => {
    if (!open) return;
    setName(supplier?.name ?? '');
    setCategoryId(supplier?.defaultCategoryId ?? '');
    setPhone(supplier?.phone ?? '');
    setErrors({});
    setError(null);
  }, [open, supplier, setError]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = supplierFormSchema.safeParse({ name, defaultCategoryId: categoryId, phone });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    const ok = await run(() =>
      supplier
        ? api(`/suppliers/${supplier.id}`, { method: 'PATCH', body: parsed.data })
        : api('/suppliers', { method: 'POST', body: parsed.data }),
    );
    if (ok !== undefined) {
      onOpenChange(false);
      onDone();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{supplier ? t('suppliers.edit') : t('suppliers.new')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <FormField id="s-name" label={t('rooms.name')} error={errors.name}>
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField id="s-cat" label={t('suppliers.defaultCategory')} hint={t('suppliers.defaultCategoryHint')}>
            <Select id="s-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryName(c, locale)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="s-phone" label={t('guest.phone')} error={errors.phone}>
            <Input id="s-phone" type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </FormField>
          <FormError message={error} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('common.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
