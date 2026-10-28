'use client';

import { guestFormSchema, type MrzFieldsDto, type PassportScanDto } from '@riad/shared';
import { Camera, CheckCircle2, ImageUp, Loader2, PencilLine, RotateCcw, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { FormError } from '@/components/form-field';
import { EMPTY_GUEST, GuestFields, guestValuesForSchema, type GuestValues } from '@/components/stays/stay-form';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { checkinApi, type CheckinLink } from '@/lib/checkin-api';
import { fieldErrors, type FieldErrors } from '@/lib/forms';
import { compressImage } from '@/lib/image';
import { cn } from '@/lib/utils';

export type GuestDraft = {
  values: GuestValues;
  photoRef?: string;
  mrzRaw?: string;
  preview?: string;
  read?: 'ok' | 'partial' | 'failed';
  manual?: boolean;
};

export const emptyDraft = (): GuestDraft => ({ values: { ...EMPTY_GUEST } });

function mergeMrz(values: GuestValues, f: MrzFieldsDto): GuestValues {
  return {
    ...values,
    firstName: f.firstName ?? values.firstName,
    lastName: f.lastName ?? values.lastName,
    sex: f.sex ?? values.sex,
    nationality: f.nationality ?? values.nationality,
    birthDate: f.birthDate ?? values.birthDate,
    documentType: f.documentType ?? values.documentType,
    documentNumber: f.documentNumber ?? values.documentNumber,
    documentExpiry: f.documentExpiry ?? values.documentExpiry,
  };
}

/** The register needs these for every adult (police fiche). */
const REQUIRED_FOR_REGISTER = ['nationality', 'birthDate', 'documentNumber'] as const;

export function PassportStep({
  link,
  title,
  draft,
  onChange,
  onNext,
  onBack,
}: {
  link: CheckinLink;
  title: string;
  draft: GuestDraft;
  onChange: (draft: GuestDraft) => void;
  onNext: () => void;
  onBack?: () => void;
}) {
  const t = useTranslations('checkin');
  const tc = useTranslations('common');
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const reviewing = Boolean(draft.preview || draft.manual);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const image = await compressImage(file);
      const preview = URL.createObjectURL(image);
      const scan = await checkinApi.scan<PassportScanDto>(link, image);
      const values = scan.mrz ? mergeMrz(draft.values, scan.mrz.fields) : draft.values;
      onChange({
        values,
        preview,
        photoRef: scan.photoRef,
        mrzRaw: scan.mrz?.raw,
        read: !scan.mrz ? 'failed' : scan.mrz.valid ? 'ok' : 'partial',
      });
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'UNSUPPORTED_IMAGE'
          ? t('passport.unsupported')
          : e instanceof ApiError && e.status === 429
            ? t('errors.TOO_MANY_REQUESTS')
            : t('passport.uploadError'),
      );
    } finally {
      setBusy(false);
      if (cameraRef.current) cameraRef.current.value = '';
      if (galleryRef.current) galleryRef.current.value = '';
    }
  }

  function next() {
    const parsed = guestFormSchema.safeParse(guestValuesForSchema(draft.values));
    const errs: FieldErrors = parsed.success ? {} : fieldErrors(parsed.error);
    for (const k of REQUIRED_FOR_REGISTER) if (!draft.values[k]) errs[k] ??= 'required';
    setErrors(errs);
    if (Object.keys(errs).length === 0) onNext();
  }

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-xl font-semibold">{title}</h2>

      {/* Hidden inputs: one opens the rear camera directly, one the gallery. */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />

      {!reviewing && (
        <>
          <p className="text-muted-foreground">{t('passport.hint')}</p>
          <div className="flex aspect-[3/2] items-center justify-center rounded-2xl border-2 border-dashed border-teal-300 bg-teal-100/40">
            {busy ? (
              <span className="flex flex-col items-center gap-3 text-teal-900">
                <Loader2 className="size-10 animate-spin" aria-hidden />
                {t('passport.reading')}
              </span>
            ) : (
              <PassportIllustration />
            )}
          </div>
          <Button size="lg" disabled={busy} onClick={() => cameraRef.current?.click()}>
            <Camera aria-hidden />
            {t('passport.takePhoto')}
          </Button>
          <Button size="lg" variant="outline" disabled={busy} onClick={() => galleryRef.current?.click()}>
            <ImageUp aria-hidden />
            {t('passport.choose')}
          </Button>
          <button
            type="button"
            className="min-h-11 text-sm font-medium text-teal-900 underline-offset-4 hover:underline"
            onClick={() => onChange({ ...draft, manual: true, read: undefined })}
          >
            {t('passport.manual')}
          </button>
          <FormError message={error} />
        </>
      )}

      {reviewing && (
        <>
          {draft.preview && (
            <div className="relative overflow-hidden rounded-2xl border bg-muted">
              <img src={draft.preview} alt="" className="max-h-56 w-full object-contain" />
            </div>
          )}
          {draft.read && <ReadStatus status={draft.read} />}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => (draft.preview ? cameraRef.current?.click() : onChange({ ...draft, manual: false }))}
            >
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />}
              {draft.preview ? t('passport.retake') : t('passport.usePhoto')}
            </Button>
          </div>
          <FormError message={error} />
          <GuestFields
            idPrefix={`g-${title}`}
            values={draft.values}
            errors={errors}
            onChange={(values) => onChange({ ...draft, values })}
            hideContact
          />
          <div className="flex gap-3">
            {onBack && (
              <Button variant="outline" size="lg" className="flex-1" onClick={onBack}>
                {tc('back')}
              </Button>
            )}
            <Button size="lg" className="flex-[2]" onClick={next}>
              {tc('next')}
            </Button>
          </div>
        </>
      )}

      {!reviewing && onBack && (
        <Button variant="ghost" onClick={onBack}>
          {tc('back')}
        </Button>
      )}
    </div>
  );
}

function ReadStatus({ status }: { status: 'ok' | 'partial' | 'failed' }) {
  const t = useTranslations('checkin.passport');
  const Icon = status === 'ok' ? CheckCircle2 : status === 'partial' ? TriangleAlert : PencilLine;
  return (
    <p
      className={cn(
        'flex items-start gap-2 rounded-lg p-3 text-sm',
        status === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900',
      )}
      role="status"
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      {t(status === 'ok' ? 'readOk' : status === 'partial' ? 'readPartial' : 'readFailed')}
    </p>
  );
}

/** Simple passport sketch with the two MRZ lines highlighted. */
function PassportIllustration() {
  return (
    <svg viewBox="0 0 240 160" className="w-3/5 max-w-60 text-teal-900" aria-hidden>
      <rect x="4" y="4" width="232" height="152" rx="12" fill="white" stroke="currentColor" strokeOpacity=".25" strokeWidth="2" />
      <rect x="18" y="22" width="56" height="70" rx="6" fill="currentColor" fillOpacity=".12" />
      <circle cx="46" cy="48" r="13" fill="currentColor" fillOpacity=".25" />
      <rect x="30" y="66" width="32" height="18" rx="9" fill="currentColor" fillOpacity=".25" />
      {[26, 42, 58, 74].map((y) => (
        <rect key={y} x="88" y={y} width={y === 74 ? 80 : 130} height="7" rx="3.5" fill="currentColor" fillOpacity=".15" />
      ))}
      <rect x="12" y="108" width="216" height="40" rx="6" fill="currentColor" fillOpacity=".08" stroke="currentColor" strokeDasharray="4 3" strokeOpacity=".6" />
      <text x="20" y="124" fontFamily="monospace" fontSize="10" fill="currentColor">P&lt;MAR&lt;&lt;DUPONT&lt;&lt;MARIE&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</text>
      <text x="20" y="140" fontFamily="monospace" fontSize="10" fill="currentColor">AB1234567MAR8501011F3001014&lt;&lt;&lt;</text>
    </svg>
  );
}
