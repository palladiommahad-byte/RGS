'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  const t = useTranslations('common');
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={cn(
          // Bottom sheet on phones, centred card from sm up.
          'fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col gap-5 overflow-y-auto rounded-t-2xl border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-lg sm:inset-auto sm:pb-6 sm:start-1/2 sm:top-1/2 sm:w-full sm:max-w-lg sm:-translate-y-1/2 sm:rounded-2xl sm:p-6 ltr:sm:-translate-x-1/2 rtl:sm:translate-x-1/2',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute end-3 top-3 flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
          aria-label={t('close')}
        >
          <X className="size-5" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 pe-10', className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-lg font-semibold', className)} {...props} />;
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
