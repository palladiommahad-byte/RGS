'use client';

import {
  newUserFormSchema,
  resetPasswordSchema,
  roleLabel,
  userFormSchema,
  type Paginated,
  type RoleDto,
  type UserDto,
} from '@riad/shared';
import { KeyRound, Pencil, Plus, Power, Search, Wand2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { FormError, FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { Badge } from '@/components/ui/badge';
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
import { timeAgo } from '@/lib/format';
import { fieldErrors, type FieldErrors } from '@/lib/forms';
import { useAction, useApiQuery } from '@/lib/use-api';
import { RolesEditor } from '@/components/users/roles-editor';
import { cn } from '@/lib/utils';

const LIMIT = 20;
const roleName = (r: { key: string; nameFr: string; nameAr: string }, locale: string) => roleLabel(r, locale);

/** Readable temporary password (no look-alike characters), handed to the user in person. */
function generatePassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export default function UsersPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { can } = useAuth();
  const allowed = can('users.manage');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<UserDto | null | undefined>(undefined);
  const [resetting, setResetting] = useState<UserDto | undefined>(undefined);
  const action = useAction();

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (debounced) params.set('search', debounced);
  if (includeInactive) params.set('includeInactive', 'true');
  const users = useApiQuery<Paginated<UserDto>>(allowed ? `/users?${params}` : null);
  const roles = useApiQuery<RoleDto[]>(allowed ? '/roles' : null);

  if (!allowed) return <p className="text-muted-foreground">{t('dashboard.forbidden')}</p>;

  const refresh = () => {
    users.reload();
    roles.reload();
  };

  async function toggle(u: UserDto) {
    if (u.isActive && !window.confirm(t('users.deactivateConfirm', { name: u.name }))) return;
    if (await action.run(() => api(`/users/${u.id}`, { method: 'PATCH', body: { isActive: !u.isActive } }))) refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('nav.users')}
        subtitle={t('users.subtitle')}
        actions={
          <Button onClick={() => setEditing(null)}>
            <Plus aria-hidden />
            {t('users.new')}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('users.search')} aria-label={t('users.search')} className="ps-9" />
        </div>
        <label className="flex h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--primary)]"
            checked={includeInactive}
            onChange={(e) => {
              setIncludeInactive(e.target.checked);
              setPage(1);
            }}
          />
          {t('users.includeInactive')}
        </label>
      </div>
      <FormError message={action.error} />

      <Card className="py-0">
        {users.data?.items.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">{t('users.empty')}</p>
        ) : (
          <ul className="divide-y">
            {users.data?.items.map((u) => (
              <li key={u.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3', !u.isActive && 'opacity-60')}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-900" aria-hidden>
                  {u.name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((w) => w[0]?.toUpperCase())
                    .join('')}
                </span>
                <div className="min-w-0 flex-1 basis-[calc(100%-3.25rem)] sm:basis-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{u.name}</span>
                    <Badge tone="teal">{roleName(u.role, locale)}</Badge>
                    {u.isSelf && <Badge tone="gray">{t('users.you')}</Badge>}
                    {!u.isActive && <Badge tone="gray">{t('users.inactive')}</Badge>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground" dir="ltr">
                    {u.email}
                  </div>
                </div>
                <span className="me-auto ps-[3.25rem] text-xs text-muted-foreground sm:me-0 sm:ps-0">
                  {u.lastLoginAt ? t('users.lastLogin', { when: timeAgo(u.lastLoginAt, locale) }) : t('users.neverLoggedIn')}
                </span>
                {u.manageable && (
                  <div className="flex">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(u)} aria-label={t('common.edit')} title={t('common.edit')}>
                      <Pencil className="size-4" />
                    </Button>
                    {!u.isSelf && (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => setResetting(u)} aria-label={t('users.resetPassword')} title={t('users.resetPassword')}>
                          <KeyRound className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={u.isActive ? 'text-destructive' : 'text-emerald-700'}
                          onClick={() => void toggle(u)}
                          aria-label={u.isActive ? t('users.deactivate') : t('users.reactivate')}
                          title={u.isActive ? t('users.deactivate') : t('users.reactivate')}
                        >
                          <Power className="size-4" />
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {users.data && <Pagination page={page} limit={LIMIT} total={users.data.total} onPage={setPage} />}

      {roles.data && <RolesEditor roles={roles.data} onSaved={refresh} />}

      <UserDialog
        open={editing !== undefined}
        user={editing ?? undefined}
        roles={roles.data ?? []}
        onOpenChange={(o) => !o && setEditing(undefined)}
        onDone={refresh}
      />
      <ResetPasswordDialog user={resetting} onOpenChange={(o) => !o && setResetting(undefined)} />
    </div>
  );
}

function UserDialog({
  open,
  user,
  roles,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  user?: UserDto;
  roles: RoleDto[];
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const { run, pending, error, setError } = useAction();
  // Only roles the current user may give (the API enforces it too).
  const assignable = roles.filter((r) => r.assignable || r.id === user?.role.id);

  useEffect(() => {
    if (!open) return;
    setName(user?.name ?? '');
    setEmail(user?.email ?? '');
    setRoleId(user?.role.id ?? '');
    setPassword(user ? '' : generatePassword());
    setErrors({});
    setError(null);
  }, [open, user, setError]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = user ? userFormSchema.safeParse({ name, email, roleId }) : newUserFormSchema.safeParse({ name, email, roleId, password });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    const ok = await run(() =>
      user
        ? api(`/users/${user.id}`, { method: 'PATCH', body: { name, email, ...(user.isSelf ? {} : { roleId }) } })
        : api('/users', { method: 'POST', body: parsed.data }),
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
          <DialogTitle>{user ? t('users.edit') : t('users.new')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <FormField id="u-name" label={t('users.name')} error={errors.name}>
            <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </FormField>
          <FormField id="u-email" label={t('users.email')} error={errors.email}>
            <Input id="u-email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </FormField>
          <FormField id="u-role" label={t('users.role')} error={errors.roleId} hint={user?.isSelf ? t('users.ownRole') : undefined}>
            <Select id="u-role" value={roleId} disabled={user?.isSelf} onChange={(e) => setRoleId(e.target.value)}>
              <option value="">—</option>
              {assignable.map((r) => (
                <option key={r.id} value={r.id}>
                  {roleName(r, locale)}
                </option>
              ))}
            </Select>
          </FormField>
          {!user && (
            <FormField id="u-password" label={t('users.tempPassword')} error={errors.password} hint={t('users.tempPasswordHint')}>
              <div className="flex gap-2">
                <Input id="u-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className="font-mono" />
                <Button type="button" variant="outline" size="icon" onClick={() => setPassword(generatePassword())} aria-label={t('users.generate')} title={t('users.generate')}>
                  <Wand2 className="size-4" />
                </Button>
              </div>
            </FormField>
          )}
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

function ResetPasswordDialog({ user, onOpenChange }: { user?: UserDto; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations();
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [done, setDone] = useState(false);
  const { run, pending, error, setError } = useAction();

  useEffect(() => {
    if (!user) return;
    setPassword(generatePassword());
    setErrors({});
    setError(null);
    setDone(false);
  }, [user, setError]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    const parsed = resetPasswordSchema.safeParse({ password });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    if (await run(() => api(`/users/${user.id}/password`, { method: 'POST', body: { password } }))) setDone(true);
  }

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('users.resetFor', { name: user?.name ?? '' })}</DialogTitle>
        </DialogHeader>
        {done ? (
          <>
            <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{t('users.resetDone')}</p>
            <p className="rounded-lg border bg-muted p-3 text-center font-mono text-lg" dir="ltr">
              {password}
            </p>
            <DialogFooter>
              <DialogClose asChild>
                <Button>{t('common.close')}</Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <FormField id="rp-password" label={t('users.tempPassword')} error={errors.password} hint={t('users.resetHint')}>
              <div className="flex gap-2">
                <Input id="rp-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
                <Button type="button" variant="outline" size="icon" onClick={() => setPassword(generatePassword())} aria-label={t('users.generate')}>
                  <Wand2 className="size-4" />
                </Button>
              </div>
            </FormField>
            <FormError message={error} />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {t('common.cancel')}
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pending}>
                {t('users.resetPassword')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
