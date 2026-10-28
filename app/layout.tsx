import { ClerkProvider } from '@clerk/nextjs';
import { esES } from '@clerk/localizations';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tareas',
  description: 'Tus listas de tareas y notas, en el móvil y en el ordenador.',
  applicationName: 'Tareas',
  appleWebApp: { capable: true, title: 'Tareas', statusBarStyle: 'default' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f5f3' },
    { media: '(prefers-color-scheme: dark)', color: '#1b1b1f' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: "addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__installPrompt=e})",
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <ClerkProvider localization={esES} appearance={{ variables: { colorPrimary: '#5b5bf0' } }}>
          {children}
        </ClerkProvider>
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
