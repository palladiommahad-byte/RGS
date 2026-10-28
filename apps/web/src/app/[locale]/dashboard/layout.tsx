import { AuthProvider } from '@/components/auth-provider';
import { DashboardShell } from '@/components/dashboard/shell';
import { RealtimeProvider } from '@/components/realtime-provider';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <RealtimeProvider>
        <DashboardShell>{children}</DashboardShell>
      </RealtimeProvider>
    </AuthProvider>
  );
}
