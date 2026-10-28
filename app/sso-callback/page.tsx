'use client';

import { HandleSSOCallback } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';

export default function Page() {
  const router = useRouter();

  return (
    <main className="auth">
      <div className="spinner" />
      <HandleSSOCallback
        navigateToApp={({ session, decorateUrl }) => {
          if (session?.currentTask) return router.replace('/sign-in');
          const url = decorateUrl('/');
          if (url.startsWith('http')) window.location.href = url;
          else router.replace(url);
        }}
        navigateToSignIn={() => router.replace('/sign-in')}
        navigateToSignUp={() => router.replace('/sign-in')}
      />
    </main>
  );
}
