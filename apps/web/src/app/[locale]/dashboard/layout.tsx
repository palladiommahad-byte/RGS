import { AuthProvider } from '@/components/auth-provider';
import { DashboardShell } from '@/components/dashboard/shell';
import { FeedbackProvider } from '@/components/feedback';
import { RealtimeProvider } from '@/components/realtime-provider';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <RealtimeProvider>
        <FeedbackProvider>
          <DashboardShell>{children}</DashboardShell>
        </FeedbackProvider>
      </RealtimeProvider>
    </AuthProvider>
  );
}
