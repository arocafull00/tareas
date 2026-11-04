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
  const canRecord = !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined' && typeof Worker !== 'undefined' && typeof AudioContext !== 'undefined';
  if (!SpeechRecognition && !canRecord) return () => {};

  const button = document.getElementById('dictate') as HTMLButtonElement;
  const dialog = document.getElementById('dictation') as HTMLDialogElement;
  const bubble = document.getElementById('dictation-bubble')!;
  const title = document.getElementById('dictation-title')!;
  const help = document.getElementById('dictation-help')!;
  const stop = document.getElementById('dictation-stop') as HTMLButtonElement;
  let active: Recognition | null = null;
  let finish: ((text: string) => void) | null = null;
  let voiceTimeout: ReturnType<typeof setTimeout> | undefined;
  let stopTimeout: ReturnType<typeof setTimeout> | undefined;
  let startTimeout: ReturnType<typeof setTimeout> | undefined;
  let local: { stop: () => void; cancel: () => void } | null = null;
  let preferLocal = !SpeechRecognition;
  let run = 0;

  function showVoice(speaking: boolean) {
    clearTimeout(voiceTimeout);
    bubble.style.setProperty('--voice', speaking ? '1' : '0');
  }

  function releaseRecognition() {
    const recognition = active;
    active = null;
    if (recognition) {
      recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = null;
      recognition.onspeechstart = recognition.onspeechend = null;
      try { recognition.abort(); } catch { /* Already stopped. */ }
    }
    clearTimeout(startTimeout);
  }

  function close(text = '') {
    run++;
    releaseRecognition();
    local?.cancel();
    local = null;
    clearTimeout(stopTimeout);
    showVoice(false);
    dialog.close();
    const commit = finish;
    finish = null;
    commit?.(text);
  }

  async function useLocal() {
    releaseRecognition();
    clearTimeout(stopTimeout);
    if (!canRecord) {
      toast.error('El servicio de voz no está disponible. Prueba el dictado en Chrome.');
      return close();
    }
    preferLocal = true;
    const currentRun = run;
    stop.disabled = true;
    showVoice(false);
    title.textContent = 'Preparando dictado local...';
    help.textContent = 'La primera vez se descarga el modelo. Espera a que aparezca «Te escucho» antes de hablar.';
    try {
      const { startLocalDictation } = await import('./local-dictation');
      if (currentRun !== run) return;
      local = startLocalDictation({
        onReady: () => {
          title.textContent = 'Te escucho...';
          help.textContent = 'Dictado local. Al terminar, el texto se añadirá donde estaba el cursor.';
          stop.disabled = false;
          showVoice(true);
        },
        onStatus: message => {
          title.textContent = message;
          stop.disabled = true;
          showVoice(false);
        },
        onResult: text => {
          if (!text) toast.info('No se ha detectado voz. Vuelve a intentarlo.');
          close(text);
        },
        onError: message => {
          toast.error(message);
          close();
        },
      });
      stop.onclick = () => local?.stop();
    } catch {
      if (currentRun !== run) return;
      toast.error('No se ha podido cargar el dictado local. Comprueba la conexión y vuelve a intentarlo.');
      close();
    }
  }

  button.hidden = false;
  button.onmousedown = event => event.preventDefault();
  button.onclick = () => {
    if (finish) return;
    finish = prepare();
    if (!finish) return;
    run++;
    try { dialog.showModal(); } catch { return close(); }
    if (preferLocal || !SpeechRecognition) return void useLocal();
    let recognition: Recognition;
    try { recognition = new SpeechRecognition(); } catch { return void useLocal(); }
    let transcript = '';
    recognition.lang = 'es-ES';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => {
      clearTimeout(startTimeout);
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
      if (event.error === 'network' || event.error === 'service-not-allowed' || event.error === 'language-not-supported') {
        preferLocal = canRecord;
        if (canRecord && !transcript) return void useLocal();
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
    help.textContent = 'Espera a «Te escucho» antes de hablar. Al terminar, el dictado se añadirá al texto.';
    try {
      startTimeout = setTimeout(() => void useLocal(), 10_000);
      recognition.start();
    } catch {
      return void useLocal();
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
    if (document.hidden && finish) close();
  });
  return () => close();
}
