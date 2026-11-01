'use client';

import {
  DEFAULT_ROLE_PERMISSIONS,
  IMPLIED_PERMISSIONS,
  PERMISSION_GROUPS,
  roleLabel,
  withImplied,
  type Permission,
  type RoleDto,
  type RoleKey,
} from '@riad/shared';
import { Lock, RotateCcw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { FormError } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useAction } from '@/lib/use-api';
import { cn } from '@/lib/utils';

/** Permission codes contain dots, which next-intl reads as nesting. */
const permKey = (code: string) => `permission.${code.replace(/\./g, '_')}`;
/** Rights that need `code` (turning it off turns them off too). */
const dependents = (code: string) =>
  (Object.entries(IMPLIED_PERMISSIONS) as [Permission, Permission[]][]).filter(([, deps]) => deps.includes(code as Permission)).map(([p]) => p);

/**
 * What each role may do. Owners switch rights on and off (the owner role itself always has
 * everything); others see it read-only. Saved rights apply at once to everyone in the role.
 */
export function RolesEditor({ roles, onSaved }: { roles: RoleDto[]; onSaved: () => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const role = roles.find((r) => r.id === selectedId) ?? roles.find((r) => r.key === 'RECEPTION') ?? roles[0];
  const [draft, setDraft] = useState<string[]>([]);
  const save = useAction();

  useEffect(() => {
    if (role) setDraft(role.permissions);
    save.setError(null);
    // Reset the draft when another role is shown or after a save.
  }, [role?.id, role?.permissions.join()]);

  if (!role) return null;
  const locked = role.key === 'OWNER';
  const editable = role.editable;
  const dirty = [...draft].sort().join() !== [...role.permissions].sort().join();
  const defaults = DEFAULT_ROLE_PERMISSIONS[role.key as RoleKey] as string[] | undefined;
  const isDefault = !!defaults && [...defaults].sort().join() === [...draft].sort().join();

  const toggle = (code: string) =>
    setDraft((d) => (d.includes(code) ? d.filter((c) => c !== code && !dependents(code).includes(c as Permission)) : withImplied([...d, code])));

  async function submit(permissions: string[]) {
    if (await save.run(() => api(`/roles/${role!.id}`, { method: 'PATCH', body: { permissions } }))) onSaved();
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>{t('users.roles')}</CardTitle>
        <p className="text-sm text-muted-foreground">{editable || locked ? t('roles.hintOwner') : t('roles.hintReadOnly')}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist">
          {roles.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={r.id === role.id}
              onClick={() => setSelectedId(r.id)}
              className={cn(
                'flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors',
                r.id === role.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
              )}
            >
              {r.key === 'OWNER' && <Lock className="size-3.5" aria-hidden />}
              {roleLabel(r, locale)}
              <span className={cn('rounded-full px-1.5 text-xs tabular-nums', r.id === role.id ? 'bg-white/20' : 'bg-muted')}>{r.userCount}</span>
            </button>
          ))}
        </div>

        {locked && (
          <p className="flex items-center gap-2 rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
            <Lock className="size-4 shrink-0" aria-hidden />
            {t('roles.ownerLocked')}
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {PERMISSION_GROUPS.map((g) => (
            <fieldset key={g.key} className="flex flex-col rounded-xl border">
              <legend className="sr-only">{t(`roles.group.${g.key}`)}</legend>
              <div className="border-b bg-muted/40 px-4 py-2.5 text-sm font-semibold" aria-hidden>
                {t(`roles.group.${g.key}`)}
              </div>
              <ul className="divide-y">
                {g.permissions.map((code) => {
                  const on = draft.includes(code);
                  return (
                    <li key={code}>
                      <label className={cn('flex min-h-12 items-center justify-between gap-3 px-4 py-2 text-sm', editable && 'cursor-pointer hover:bg-accent/40')}>
                        <span className={cn(!on && 'text-muted-foreground')}>{t(permKey(code))}</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          aria-label={t(permKey(code))}
                          disabled={!editable || save.pending}
                          onClick={() => toggle(code)}
                          className={cn(
                            'relative h-6 w-11 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed',
                            on ? 'bg-primary' : 'bg-muted-foreground/25',
                            !editable && 'opacity-60',
                          )}
                        >
                          <span
                            className={cn(
                              'absolute top-0.5 size-5 rounded-full bg-white shadow transition-[inset-inline-start]',
                              on ? 'start-[22px]' : 'start-0.5',
                            )}
                          />
                        </button>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ))}
        </div>

        {editable && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => void submit(draft)} disabled={!dirty || save.pending}>
              {save.pending ? t('common.saving') : t('roles.save')}
            </Button>
            {dirty && (
              <Button type="button" variant="ghost" onClick={() => setDraft(role.permissions)} disabled={save.pending}>
                {t('common.cancel')}
              </Button>
            )}
            {defaults && !isDefault && (
              <Button type="button" variant="outline" onClick={() => setDraft(defaults)} disabled={save.pending}>
                <RotateCcw aria-hidden />
                {t('roles.reset')}
              </Button>
            )}
            {dirty && <span className="text-sm text-muted-foreground">{t('roles.appliesTo', { count: role.userCount })}</span>}
            <FormError message={save.error} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
