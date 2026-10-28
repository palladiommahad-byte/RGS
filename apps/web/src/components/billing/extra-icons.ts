import type { ExtraCategory } from '@riad/shared';
import { Bus, Mountain, Package, ShowerHead, UtensilsCrossed, type LucideIcon } from 'lucide-react';

export const EXTRA_ICONS: Record<ExtraCategory, LucideIcon> = {
  FOOD: UtensilsCrossed,
  HAMMAM: ShowerHead,
  TRANSFER: Bus,
  EXCURSION: Mountain,
  OTHER: Package,
};
