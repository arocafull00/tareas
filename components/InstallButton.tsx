'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

declare global {
  interface Window {
    __installPrompt?: InstallPromptEvent;
  }
}

function waitForPrompt() {
  return new Promise<InstallPromptEvent | undefined>(resolve => {
    const done = () => {
      clearTimeout(timer);
      removeEventListener('beforeinstallprompt', done);
      setTimeout(() => resolve(window.__installPrompt));
    };
    const timer = setTimeout(done, 1500);
    addEventListener('beforeinstallprompt', done);
  });
}

export default function InstallButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone;
    if (standalone) return;
    const related = (navigator as { getInstalledRelatedApps?: () => Promise<unknown[]> }).getInstalledRelatedApps;
    if (related) related.call(navigator).then(apps => setVisible(!apps.length), () => setVisible(true));
    else setVisible(true);
    const onInstalled = () => {
      window.__installPrompt = undefined;
      setVisible(false);
    };
    addEventListener('appinstalled', onInstalled);
    return () => removeEventListener('appinstalled', onInstalled);
  }, []);

  if (!visible) return null;

  const install = async () => {
    const prompt = window.__installPrompt ?? (await waitForPrompt());
    if (!prompt) {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      return toast('Instalar Tareas', {
        description: ios
          ? 'Pulsa Compartir y luego «Añadir a pantalla de inicio».'
          : 'Abre el menú del navegador y elige «Instalar Tareas» o «Añadir a pantalla de inicio».',
      });
    }
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    window.__installPrompt = undefined;
    if (outcome === 'accepted') setVisible(false);
  };

  return (
    <button className="btn install" onClick={install} title="Instalar la app">
      <svg viewBox="0 0 16 16"><path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" /></svg>
      Instalar
    </button>
  );
}
