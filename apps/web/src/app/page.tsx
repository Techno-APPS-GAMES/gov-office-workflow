'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/components/AuthProvider';

function Home() {
  const { user } = useAuth();
  const router = useRouter();
  useEffect(() => {
    router.replace(user ? '/overview' : '/login');
  }, [user, router]);
  return null;
}

export default function Page() {
  return (
    <AuthProvider>
      <Home />
    </AuthProvider>
  );
}
