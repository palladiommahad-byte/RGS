import { AuthProvider } from '@/components/auth-provider';

/** Kiosk pages for the reception tablet: signed-in staff, no dashboard chrome. */
export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
