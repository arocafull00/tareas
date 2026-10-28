import { toast } from 'sonner';

type Recognition = EventTarget & {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onresult: ((event: Event & { results: SpeechRecognitionResultList }) => void) | null;
  onerror: ((event: Event & { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type RecognitionConstructor = new () => Recognition;

export function initDictation(prepare: () => ((text: string) => void) | null) {
  const speechWindow = window as typeof window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  const SpeechRecognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  if (!SpeechRecognition) return () => {};

  const button = document.getElementById('dictate') as HTMLButtonElement;
  const dialog = document.getElementById('dictation') as HTMLDialogElement;
  const bubble = document.getElementById('dictation-bubble')!;
  const title = document.getElementById('dictation-title')!;
  const stop = document.getElementById('dictation-stop') as HTMLButtonElement;
  let active: Recognition | null = null;
  let finish: ((text: string) => void) | null = null;
  let voiceTimeout: ReturnType<typeof setTimeout> | undefined;
  let stopTimeout: ReturnType<typeof setTimeout> | undefined;

  function showVoice(speaking: boolean) {
    clearTimeout(voiceTimeout);
    bubble.style.setProperty('--voice', speaking ? '1' : '0');
  }

  function close(text = '') {
    const recognition = active;
    active = null;
    if (recognition) {
      recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = null;
      recognition.onspeechstart = recognition.onspeechend = null;
      recognition.abort();
    }
    clearTimeout(stopTimeout);
    showVoice(false);
    dialog.close();
    const commit = finish;
    finish = null;
    commit?.(text);
  }

  button.hidden = false;
  button.onmousedown = event => event.preventDefault();
  button.onclick = () => {
    if (active) return;
    finish = prepare();
    if (!finish) return;
    const recognition = new SpeechRecognition();
    let transcript = '';
    recognition.lang = 'es-ES';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => {
      title.textContent = 'Te escucho...';
    };
    recognition.onspeechstart = () => showVoice(true);
    recognition.onspeechend = () => showVoice(false);
    recognition.onresult = event => {
      showVoice(true);
      voiceTimeout = setTimeout(() => showVoice(false), 600);
      const segments: string[] = [];
      for (const result of Array.from(event.results)) {
        const text = result[0].transcript.trim();
        if (!text) continue;
        const previous = segments.at(-1)?.toLocaleLowerCase('es');
        const current = text.toLocaleLowerCase('es');
        if (previous?.startsWith(current)) continue;
        if (previous && current.startsWith(previous)) segments.pop();
        segments.push(text);
      }
      transcript = segments.join(' ');
    };
    recognition.onerror = event => {
      if (event.error === 'aborted') return close();
      if (event.error === 'no-speech') {
        if (!transcript) toast.info('No se ha detectado voz. Vuelve a intentarlo.');
        return close(transcript);
      }
      const message = event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? 'Permite el acceso al micrófono para dictar'
        : event.error === 'network'
          ? 'El servicio de dictado del navegador no responde. Vuelve a intentarlo.'
          : 'No se ha podido usar el dictado por voz';
      toast.error(message);
      close(transcript);
    };
    recognition.onend = () => close(transcript);
    active = recognition;
    stop.disabled = false;
    title.textContent = 'Activando micrófono...';
    try {
      dialog.showModal();
      recognition.start();
    } catch {
      toast.error('No se ha podido iniciar el dictado por voz');
      return close();
    }
    stop.onclick = () => {
      stop.disabled = true;
      title.textContent = 'Terminando dictado...';
      showVoice(false);
      stopTimeout = setTimeout(() => close(transcript), 4000);
      try { recognition.stop(); } catch { close(transcript); }
    };
  };
  document.getElementById('dictation-cancel')!.onclick = () => close();
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    close();
  });
  window.addEventListener('pagehide', () => close());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && active) close();
  });
  return () => close();
}
