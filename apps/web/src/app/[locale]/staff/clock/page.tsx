'use client';

import type { ClockResultDto } from '@riad/shared';
import jsQR from 'jsqr';
import { ArrowLeft, CameraOff, LogIn, LogOut, Maximize, RefreshCw, TriangleAlert } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { BrandMark } from '@/components/brand-mark';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { formatMinutes, formatTime } from '@/lib/format';
import { useApiErrorMessage } from '@/lib/use-api';
import { cn } from '@/lib/utils';

type Feedback = { kind: 'ok'; result: ClockResultDto } | { kind: 'error'; message: string };
type Camera = 'starting' | 'on' | 'blocked' | 'unsupported';

const SCAN_EVERY_MS = 250;
const SHOW_RESULT_MS = 4000;
/** The same badge is not re-sent while it is still in front of the camera. */
const SAME_BADGE_PAUSE_MS = 5000;

/**
 * Reception-tablet badge clock: employees show their staff QR to the camera (or a USB/
 * Bluetooth scanner types it into the field). One scan = arrival, the next = departure.
 */
export default function StaffClockPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { user } = useAuth();
  const errorMessage = useApiErrorMessage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const last = useRef<{ token: string; at: number } | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [camera, setCamera] = useState<Camera>('starting');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [manual, setManual] = useState('');
  const [now, setNow] = useState(() => new Date().toISOString());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date().toISOString()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const id = setTimeout(() => setFeedback(null), SHOW_RESULT_MS);
    return () => clearTimeout(id);
  }, [feedback]);

  const submit = useCallback(
    async (raw: string) => {
      const token = raw.trim();
      if (!token || busy.current) return;
      const prev = last.current;
      if (prev && prev.token === token && Date.now() - prev.at < SAME_BADGE_PAUSE_MS) return;
      busy.current = true;
      last.current = { token, at: Date.now() };
      try {
        const result = await api<ClockResultDto>('/staff/clock', { method: 'POST', body: { token } });
        setFeedback({ kind: 'ok', result });
        beep(result.action === 'DUPLICATE' ? 440 : 880);
      } catch (e) {
        setFeedback({ kind: 'error', message: errorMessage(e) });
        beep(220);
      } finally {
        busy.current = false;
      }
    },
    [errorMessage],
  );

  // Camera + decoding loop.
  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera('unsupported');
      return;
    }
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    setCamera('starting');
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 } }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = s;
        const video = videoRef.current!;
        video.srcObject = s;
        void video.play();
        setCamera('on');
        timer = setInterval(() => {
          const canvas = canvasRef.current;
          if (!canvas || video.readyState < 2 || busy.current) return;
          const scale = Math.min(1, 640 / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
          if (code?.data) void submit(code.data);
        }, SCAN_EVERY_MS);
      })
      .catch(() => !cancelled && setCamera('blocked'));
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [facing, submit]);

  function onManual(e: FormEvent) {
    e.preventDefault();
    void submit(manual);
    setManual('');
  }

  const r = feedback?.kind === 'ok' ? feedback.result : null;

  return (
    <div ref={rootRef} className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between gap-3 border-b bg-card px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className={buttonVariants({ variant: 'ghost', size: 'icon' })} aria-label={t('clock.back')}>
            <ArrowLeft className="size-5 rtl:rotate-180" />
          </Link>
          <BrandMark name={user.riad.name} logoVersion={user.riad.logoVersion} />
        </div>
        <div className="text-end">
          <div className="text-2xl font-semibold tabular-nums" dir="ltr">
            {formatTime(now, locale)}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('clock.fullscreen')}
          onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : rootRef.current?.requestFullscreen())}
        >
          <Maximize className="size-5" />
        </Button>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-6 px-4 py-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold sm:text-3xl">{t('clock.title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('clock.instructions')}</p>
        </div>

        <div className="relative aspect-[4/3] w-full max-w-xl overflow-hidden rounded-2xl border-4 border-teal-900 bg-teal-900">
          <video ref={videoRef} className={cn('size-full object-cover', facing === 'user' && '-scale-x-100')} muted playsInline />
          <canvas ref={canvasRef} className="hidden" />
          {camera === 'on' && !feedback && (
            <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" aria-hidden />
          )}
          {camera !== 'on' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
              <CameraOff className="size-10" aria-hidden />
              <p className="font-medium">{t(`clock.camera.${camera}`)}</p>
            </div>
          )}
          {feedback && (
            <div
              role="status"
              aria-live="assertive"
              className={cn(
                'absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white',
                feedback.kind === 'error' ? 'bg-red-700/95' : r?.action === 'DUPLICATE' ? 'bg-amber-600/95' : 'bg-emerald-700/95',
              )}
            >
              {feedback.kind === 'error' ? (
                <>
                  <TriangleAlert className="size-14" aria-hidden />
                  <p className="text-2xl font-semibold">{feedback.message}</p>
                </>
              ) : r?.action === 'IN' ? (
                <>
                  <LogIn className="size-14" aria-hidden />
                  <p className="text-3xl font-semibold">{t('clock.hello', { name: r.firstName })}</p>
                  <p className="text-xl">{t('clock.arrival', { time: formatTime(r.at, locale) })}</p>
                </>
              ) : r?.action === 'OUT' ? (
                <>
                  <LogOut className="size-14" aria-hidden />
                  <p className="text-3xl font-semibold">{t('clock.bye', { name: r.firstName })}</p>
                  <p className="text-xl">
                    {t('clock.departure', { time: formatTime(r.at, locale), duration: formatMinutes(r.minutes ?? 0) })}
                  </p>
                </>
              ) : (
                r && (
                  <>
                    <RefreshCw className="size-14" aria-hidden />
                    <p className="text-2xl font-semibold">{t('clock.duplicate', { name: r.firstName, time: formatTime(r.at, locale) })}</p>
                  </>
                )
              )}
            </div>
          )}
        </div>

        <div className="flex w-full max-w-xl flex-wrap items-center justify-between gap-3">
          <Button variant="outline" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} disabled={camera === 'unsupported'}>
            <RefreshCw aria-hidden />
            {t('clock.switchCamera')}
          </Button>
          <form onSubmit={onManual} className="flex min-w-60 flex-1 gap-2">
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder={t('clock.manual')}
              aria-label={t('clock.manual')}
              autoComplete="off"
              autoFocus
              dir="ltr"
            />
            <Button type="submit" variant="outline" disabled={!manual.trim()}>
              {t('clock.validate')}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}

/** Short confirmation tone (silent if the browser blocks audio). */
function beep(frequency: number): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = frequency;
    gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
    osc.onended = () => void ctx.close();
  } catch {
    // no audio
  }
}
