import { SignIn } from '@clerk/nextjs';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Entrar · Tareas' };

export default function Page() {
  return (
    <main className="auth">
      <SignIn />
    </main>
  );
}
