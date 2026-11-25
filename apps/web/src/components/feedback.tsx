'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AlertTriangle, CheckCircle2, Info, Trash2, X, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Toasts: short messages after an action, gone on their own after a few seconds.
// ---------------------------------------------------------------------------

/** Messages shown after an action (messages: feedback.<key>). */
export type FeedbackKey =
  | 'saved'
  | 'added'
  | 'deleted'
  | 'qrRenewed'
  | 'roomStatus'
  | 'roomReactivated'
  | 'logoUpdated'
  | 'stayCreated'
  | 'stayCancelled'
  | 'checkinRejected'
  | 'checkedIn'
  | 'userActivated'
  | 'userDeactivated'
  | 'backupStarted'
  | 'extraAdded'
  | 'paymentAdded'
  | 'walletCreated'
  | 'leaveUpdated'
  | 'payrollGenerated'
  | 'paymentCancelled'
  | 'paid';

type ToastTone = 'success' | 'error' | 'info';
type Toast = { id: number; tone: ToastTone; message: string };
type ToastApi = { success: (message: string) => void; error: (message: string) => void; info: (message: string) => void };

// ---------------------------------------------------------------------------
// Confirm: "Are you sure?" before deleting or undoing something.
// ---------------------------------------------------------------------------

export type ConfirmOptions = {
  /** What will happen, in a sentence ("Delete Chambre 3?"). */
  message: string;
  /** Short heading; defaults to "Are you sure?" or "Delete for good?" for deletions. */
  title?: string;
  /** Label of the button that goes ahead; defaults to "Delete". */
  confirmLabel?: string;
  /** danger: red, for deletions and things that cannot be undone. warning: amber, for changes. */
  tone?: 'danger' | 'warning';
  /** Show the bin icon (deletions). */
  deletion?: boolean;
};

type Feedback = { toast: ToastApi; confirm: (options: ConfirmOptions) => Promise<boolean> };

const noop = () => {};
const FeedbackContext = createContext<Feedback>({
  toast: { success: noop, error: noop, info: noop },
  // Outside the staff app (guest pages): the browser's own box is the fallback.
  confirm: async (o) => window.confirm(o.message),
});

export const useToast = () => useContext(FeedbackContext).toast;
export const useConfirm = () => useContext(FeedbackContext).confirm;

const TOAST_MS = 4000;

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const [ask, setAsk] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((x) => x.id !== id)), []);
  const push = useCallback((tone: ToastTone, message: string) => {
    const id = nextId.current++;
    // At most three on screen: the oldest makes room.
    setToasts((all) => [...all.slice(-2), { id, tone, message }]);
  }, []);
  const toast = useMemo<ToastApi>(
    () => ({ success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m) }),
    [push],
  );

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setAsk({ ...options, resolve })),
    [],
  );
  const answer = (ok: boolean) => {
    ask?.resolve(ok);
    setAsk(null);
  };

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
      <ConfirmDialog options={ask} onAnswer={answer} />
    </FeedbackContext.Provider>
  );
}

function Toaster({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-end sm:p-6 print:hidden"
      aria-live="polite"
      role="status"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

const TOAST_STYLE: Record<ToastTone, { icon: typeof CheckCircle2; tile: string; bar: string }> = {
  success: { icon: CheckCircle2, tile: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500' },
  error: { icon: XCircle, tile: 'bg-red-100 text-red-700', bar: 'bg-red-500' },
  info: { icon: Info, tile: 'bg-teal-100 text-teal-900', bar: 'bg-primary' },
};

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const t = useTranslations('common');
  const [paused, setPaused] = useState(false);
  const left = useRef(TOAST_MS);
  const started = useRef(Date.now());

  // Counts down while visible; hovering (or touching) pauses it so it can be read.
  useEffect(() => {
    if (paused) return;
    started.current = Date.now();
    const id = setTimeout(onDismiss, left.current);
    return () => {
      clearTimeout(id);
      left.current -= Date.now() - started.current;
    };
  }, [paused, onDismiss]);

  const { icon: Icon, tile, bar } = TOAST_STYLE[toast.tone];
  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
      className="pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-2xl border bg-card shadow-lg animate-in fade-in-0 slide-in-from-bottom-4"
    >
      <div className="flex items-center gap-3 p-3.5 pe-2">
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', tile)} aria-hidden>
          <Icon className="size-5" />
        </span>
        <p className="min-w-0 flex-1 text-sm font-medium">{toast.message}</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('close')}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
        >
          <X className="size-4" />
        </button>
      </div>
      {/* Time left before it goes away. */}
      <span
        className={cn('absolute bottom-0 start-0 h-1 origin-left rtl:origin-right', bar)}
        style={{ width: '100%', animation: `toast-timer ${TOAST_MS}ms linear forwards`, animationPlayState: paused ? 'paused' : 'running' }}
        aria-hidden
      />
    </div>
  );
}

function ConfirmDialog({
  options,
  onAnswer,
}: {
  options: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
  onAnswer: (ok: boolean) => void;
}) {
  const t = useTranslations();
  // Keep the last content while the dialog fades out.
  const [shown, setShown] = useState(options);
  useEffect(() => {
    if (options) setShown(options);
  }, [options]);
  const o = options ?? shown;
  const tone = o?.tone ?? 'danger';
  const deletion = o?.deletion ?? (!o?.confirmLabel && tone === 'danger');
  const Icon = deletion ? Trash2 : AlertTriangle;

  return (
    <DialogPrimitive.Root open={!!options} onOpenChange={(open) => !open && onAnswer(false)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          role="alertdialog"
          // Deletions: the safe answer has the focus, so Enter never deletes by accident.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).querySelector<HTMLButtonElement>('[data-cancel]')?.focus();
          }}
          className="fixed inset-x-0 bottom-0 z-[70] flex flex-col gap-5 rounded-t-2xl border bg-card p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4 sm:inset-auto sm:start-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-y-1/2 sm:rounded-2xl sm:data-[state=open]:zoom-in-95 ltr:sm:-translate-x-1/2 rtl:sm:translate-x-1/2"
        >
          <div className="flex items-start gap-4">
            <span
              className={cn(
                'flex size-12 shrink-0 items-center justify-center rounded-full',
                tone === 'danger' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700',
              )}
              aria-hidden
            >
              <Icon className="size-6" />
            </span>
            <div className="min-w-0 pt-1">
              <DialogPrimitive.Title className="text-lg font-semibold">
                {o?.title ?? (deletion ? t('feedback.deleteTitle') : t('feedback.confirmTitle'))}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1.5 text-sm text-muted-foreground">
                {o?.message}
                {deletion && <span className="mt-1 block font-medium text-red-700">{t('feedback.cannotUndo')}</span>}
              </DialogPrimitive.Description>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" data-cancel onClick={() => onAnswer(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant={tone === 'danger' ? 'destructive' : 'default'}
              className={tone === 'warning' ? 'bg-amber-600 text-white hover:bg-amber-700' : undefined}
              onClick={() => onAnswer(true)}
            >
              {deletion && <Trash2 aria-hidden />}
              {o?.confirmLabel ?? t('common.delete')}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
