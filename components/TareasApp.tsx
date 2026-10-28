'use client';

import { UserButton, useAuth } from '@clerk/nextjs';
import { memo, useEffect } from 'react';
import { createApi } from '@/lib/api';
import InstallButton from './InstallButton';

const editor = () => import('./editor');

export default function TareasApp() {
  const { isLoaded, isSignedIn, getToken, signOut } = useAuth();

  useEffect(() => {
    editor();
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(process.env.NODE_ENV === 'production' ? '/sw.js' : '/sw-dev.js', { scope: '/', updateViaCache: 'none' });
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    editor().then(({ start, clearCache }) => {
      if (!isSignedIn) {
        clearCache();
        return location.replace('/sign-in');
      }
      start(
        createApi(
          () => getToken(),
          () => {
            clearCache();
            signOut({ redirectUrl: '/sign-in' });
          }
        )
      );
    });
  }, [isLoaded, isSignedIn, getToken, signOut]);

  return (
    <>
      <Shell />
      <div className="account">
        <UserButton />
      </div>
    </>
  );
}

const Shell = memo(function Shell() {
  return (
    <>
      <header className="titlebar">
        <h1 className="app-name">Tareas</h1>
        <InstallButton />
      </header>

      <nav className="tabs">
        <div id="tab-list" className="tab-list"></div>
        <button id="new-list" className="icon-btn add-list" title="Nueva lista">
          <svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" /></svg>
        </button>
      </nav>

      <div id="toolbar" className="toolbar">
        <button className="icon-btn tool" data-cmd="bold" title="Negrita (Ctrl+B)"><b>B</b></button>
        <button className="icon-btn tool" data-cmd="italic" title="Cursiva (Ctrl+I)"><i>I</i></button>
        <button className="icon-btn tool" data-cmd="strikeThrough" title="Tachado (Ctrl+Shift+X)"><s>S</s></button>
        <button className="icon-btn tool" data-cmd="code" title="Monoespaciado (Ctrl+E)">
          <svg viewBox="0 0 16 16"><path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5" /></svg>
        </button>
        <span className="sep"></span>
        <button className="icon-btn tool" data-block="todo" title="Lista de tareas (Ctrl+Shift+9 o «[] »)">
          <svg viewBox="0 0 16 16"><rect x="2.5" y="2.5" width="11" height="11" rx="3" /><path d="M5.3 8.2l1.9 1.9 3.6-3.8" /></svg>
        </button>
        <button className="icon-btn tool" data-block="bullet" title="Viñetas (Ctrl+Shift+8 o «- »)">
          <svg viewBox="0 0 16 16"><path d="M6.5 4.5h7M6.5 8h7M6.5 11.5h7" /><circle cx="3" cy="4.5" r="1" fill="currentColor" stroke="none" /><circle cx="3" cy="8" r="1" fill="currentColor" stroke="none" /><circle cx="3" cy="11.5" r="1" fill="currentColor" stroke="none" /></svg>
        </button>
        <button className="icon-btn tool" data-block="number" title="Lista numerada (Ctrl+Shift+7 o «1. »)">
          <svg viewBox="0 0 16 16"><path d="M7 4.5h6.5M7 8h6.5M7 11.5h6.5M2.6 3.4l1-.8v3.6M2.3 9.6c.3-.7 2-.7 2 .3 0 .8-2 1.5-2 2.6h2.1" /></svg>
        </button>
        <button className="icon-btn tool" data-block="quote" title="Cita («> »)">
          <svg viewBox="0 0 16 16"><path d="M3 4v8M6.5 5h7M6.5 8h7M6.5 11h4.5" /></svg>
        </button>
        <button id="copy" className="btn copy" title="Copiar todo con formato de WhatsApp (Ctrl+Shift+C)">
          <svg className="icon-copy" viewBox="0 0 16 16"><rect x="5.5" y="5.5" width="8" height="8" rx="2" /><path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" /></svg>
          <svg className="icon-done" viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-6.5" /></svg>
          <span className="copy-label">Copiar</span>
        </button>
      </div>

      <main id="content" className="content">
        <div id="page" className="page"></div>
      </main>
    </>
  );
});
