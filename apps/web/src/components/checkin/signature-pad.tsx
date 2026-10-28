'use client';

import { Eraser } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Finger/stylus signature; reports a PNG data URL (null when cleared). */
export function SignaturePad({
  onChange,
  clearLabel,
  placeholder,
  invalid,
}: {
  onChange: (dataUrl: string | null) => void;
  clearLabel: string;
  placeholder: string;
  invalid?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#14211f';
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = e.currentTarget.getContext('2d')!;
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext('2d')!;
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasInk.current = true;
  }

  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    if (hasInk.current) onChange(canvasRef.current!.toDataURL('image/png'));
  }

  function clear() {
    const canvas = canvasRef.current!;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
    onChange(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <canvas
          ref={canvasRef}
          className={cn(
            'h-44 w-full touch-none rounded-xl border-2 border-dashed bg-card',
            invalid ? 'border-destructive' : 'border-input',
          )}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          aria-label={placeholder}
          role="img"
        />
        <span className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-muted-foreground/30" aria-hidden />
        <span className="pointer-events-none absolute start-6 bottom-2 text-xs text-muted-foreground" aria-hidden>
          {placeholder}
        </span>
      </div>
      <Button type="button" variant="ghost" size="sm" className="self-end" onClick={clear}>
        <Eraser aria-hidden />
        {clearLabel}
      </Button>
    </div>
  );
}
