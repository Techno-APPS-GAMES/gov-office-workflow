'use client';

import { Shell } from './Shell';
import { ToastProvider } from './Toast';

export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <Shell>{children}</Shell>
    </ToastProvider>
  );
}
