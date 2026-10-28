'use client';

import { useAuth, useSignIn } from '@clerk/nextjs';
import { useEffect, useRef, useState } from 'react';

export default function Login() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signIn } = useSignIn();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isSignedIn) location.replace('/');
  }, [isSignedIn]);

  const continueWithGoogle = async () => {
    setLoading(true);
    setError('');
    try {
      const { error } = await signIn.sso({ strategy: 'oauth_google', redirectUrl: '/', redirectCallbackUrl: '/sso-callback' });
      if (error) throw error;
    } catch {
      setError('No se pudo iniciar sesión. Inténtalo de nuevo.');
      setLoading(false);
    }
  };

  return (
    <main className="auth login">
      <Beams />
      <div className="login-content">
        <img src="/icon-192.png" alt="" className="login-logo" />
        <h1>Tareas</h1>
        <p className="login-sub">Tus listas de tareas y notas, en el móvil y en el ordenador.</p>
        <div className="login-card">
          <button className="btn google-btn" onClick={continueWithGoogle} disabled={!isLoaded || loading}>
            {loading ? <span className="spinner small" /> : <GoogleIcon />}
            {loading ? 'Redirigiendo…' : 'Continuar con Google'}
          </button>
          {error && <p className="login-error">{error}</p>}
        </div>
      </div>
    </main>
  );
}

type Beam = { x: number; y: number; width: number; length: number; speed: number; opacity: number; hue: number; pulse: number };

function Beams() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const dark = matchMedia('(prefers-color-scheme: dark)');
    let beams: Beam[] = [];
    let frame = 0;

    const createBeam = (w: number, h: number): Beam => ({
      x: Math.random() * w * 1.5 - w * 0.25,
      y: Math.random() * h * 1.5 - h * 0.25,
      width: 30 + Math.random() * 60,
      length: h * 2.5,
      speed: 0.6 + Math.random() * 1.2,
      opacity: 0.12 + Math.random() * 0.16,
      hue: 225 + Math.random() * 45,
      pulse: Math.random() * Math.PI * 2,
    });

    const resize = () => {
      const dpr = devicePixelRatio || 1;
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      beams = Array.from({ length: 30 }, () => createBeam(innerWidth, innerHeight));
    };

    const draw = (b: Beam) => {
      const [s, l] = dark.matches ? ['85%', '65%'] : ['75%', '55%'];
      const a = b.opacity * (0.8 + Math.sin(b.pulse) * 0.2);
      const g = ctx.createLinearGradient(0, 0, 0, b.length);
      g.addColorStop(0, `hsla(${b.hue},${s},${l},0)`);
      g.addColorStop(0.1, `hsla(${b.hue},${s},${l},${a * 0.5})`);
      g.addColorStop(0.4, `hsla(${b.hue},${s},${l},${a})`);
      g.addColorStop(0.6, `hsla(${b.hue},${s},${l},${a})`);
      g.addColorStop(0.9, `hsla(${b.hue},${s},${l},${a * 0.5})`);
      g.addColorStop(1, `hsla(${b.hue},${s},${l},0)`);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate((-35 * Math.PI) / 180);
      ctx.fillStyle = g;
      ctx.fillRect(-b.width / 2, 0, b.width, b.length);
      ctx.restore();
    };

    const animate = () => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      ctx.filter = 'blur(35px)';
      beams.forEach((b, i) => {
        b.y -= b.speed;
        b.pulse += 0.03;
        if (b.y + b.length < -100) {
          const col = innerWidth / 3;
          b.y = innerHeight + 100;
          b.x = (i % 3) * col + col / 2 + (Math.random() - 0.5) * col * 0.5;
          b.width = 100 + Math.random() * 100;
          b.speed = 0.5 + Math.random() * 0.4;
          b.opacity = 0.2 + Math.random() * 0.1;
        }
        draw(b);
      });
      frame = requestAnimationFrame(animate);
    };

    resize();
    animate();
    addEventListener('resize', resize);
    return () => {
      removeEventListener('resize', resize);
      cancelAnimationFrame(frame);
    };
  }, []);

  return <canvas ref={ref} className="login-beams" />;
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 256 262" aria-hidden="true">
      <path d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622 38.755 30.023 2.685.268c24.659-22.774 38.875-56.282 38.875-96.027" fill="#4285F4" />
      <path d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055-34.523 0-63.824-22.773-74.269-54.25l-1.531.13-40.298 31.187-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1" fill="#34A853" />
      <path d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82 0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602l42.356-32.782" fill="#FBBC05" />
      <path d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0 79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251" fill="#EB4335" />
    </svg>
  );
}
