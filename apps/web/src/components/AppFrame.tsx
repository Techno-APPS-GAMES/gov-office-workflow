'use client';

import { AuthProvider } from './AuthProvider';
import { Shell } from './Shell';
import { ToastProvider } from './Toast';

export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <Shell>{children}</Shell>
      </ToastProvider>
    </AuthProvider>
  );
}
