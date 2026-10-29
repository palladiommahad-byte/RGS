'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/** QR code rendered locally as SVG (nothing leaves the browser). */
export function QrSvg({ value, className }: { value: string; className?: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let cancelled = false;
    void QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then(
      (s) => !cancelled && setSvg(s),
    );
    return () => {
      cancelled = true;
    };
  }, [value]);
  // The SVG is generated locally by the qrcode library from our own value.
  return <div className={cn('size-48 [&>svg]:size-full', className)} aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />;
}
