import { SignUp } from '@clerk/nextjs';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Crear cuenta · Tareas' };

export default function Page() {
  return (
    <main className="auth">
      <SignUp />
    </main>
  );
}
