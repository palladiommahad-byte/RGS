import type { ExpenseCategoryDto } from '@riad/shared';
import {
  CircleEllipsis,
  Landmark,
  Megaphone,
  Package,
  Percent,
  Plug,
  Sparkles,
  Users,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

/** Category icons are stored by name in the database (editable later). */
const ICONS: Record<string, LucideIcon> = {
  utensils: UtensilsCrossed,
  sparkles: Sparkles,
  plug: Plug,
  users: Users,
  wrench: Wrench,
  percent: Percent,
  megaphone: Megaphone,
  landmark: Landmark,
  package: Package,
  'circle-ellipsis': CircleEllipsis,
};

export function CategoryIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = ICONS[icon] ?? Package;
  return <Icon className={className} aria-hidden />;
}

export function categoryName(c: Pick<ExpenseCategoryDto, 'nameFr' | 'nameAr'>, locale: string): string {
  return locale === 'ar' ? c.nameAr : c.nameFr;
}
