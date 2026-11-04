type Callbacks = {
  onReady: () => void;
  onStatus: (message: string) => void;
  onResult: (text: string) => void;
  onError: (message: string) => void;
};

export function startLocalDictation(callbacks: Callbacks) {
  const worker = new Worker(new URL('./dictation.worker.ts', import.meta.url), { type: 'module' });
  let stream: MediaStream | undefined;
  let recorder: MediaRecorder | undefined;
  let context: AudioContext | undefined;
  let closed = false;
  let timer: ReturnType<typeof setTimeout>;
  const chunks: Blob[] = [];

  function cancel() {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    worker.terminate();
    if (recorder?.state === 'recording') recorder.stop();
    stream?.getTracks().forEach(track => track.stop());
    if (context && context.state !== 'closed') void context.close().catch(() => {});
    chunks.length = 0;
  }

  function fail(message: string) {
    if (closed) return;
    cancel();
    callbacks.onError(message);
  }

  function deadline() {
    clearTimeout(timer);
    timer = setTimeout(() => fail('El dictado local está tardando demasiado. Comprueba la conexión y vuelve a intentarlo.'), 180_000);
  }

  function stop() {
    if (closed || recorder?.state !== 'recording') return;
    clearTimeout(timer);
    callbacks.onStatus('Transcribiendo en tu dispositivo...');
    recorder.stop();
    stream?.getTracks().forEach(track => track.stop());
    deadline();
  }

  deadline();
  const ready = new Promise<void>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<{ type: string; text?: string; message?: string }>) => {
      if (closed) return;
      if (event.data.type === 'ready') resolve();
      if (event.data.type === 'error') {
        reject(new Error(event.data.message));
        fail(event.data.message!);
      }
      if (event.data.type === 'result') {
        cancel();
        callbacks.onResult(event.data.text || '');
      }
    };
    worker.onerror = event => {
      event.preventDefault();
      reject(new Error('No se ha podido cargar el dictado local. Comprueba la conexión y vuelve a intentarlo.'));
      fail('No se ha podido cargar el dictado local. Comprueba la conexión y vuelve a intentarlo.');
    };
  });

  callbacks.onStatus('Preparando dictado local. La primera vez puede tardar...');
  // Ask for the microphone and load the model independently.
  const microphone = navigator.mediaDevices.getUserMedia({ audio: true }).then(value => {
    if (closed) value.getTracks().forEach(track => track.stop());
    else stream = value;
    return value;
  });
  void Promise.all([ready, microphone]).then(() => {
    if (closed) return;
    clearTimeout(timer);
    recorder = new MediaRecorder(stream!);
    recorder.ondataavailable = event => {
      if (!closed && event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => fail('No se ha podido grabar el micrófono. Vuelve a intentarlo.');
    recorder.onstop = async () => {
      if (closed) return;
      try {
        const blob = new Blob(chunks, { type: recorder!.mimeType });
        chunks.length = 0;
        context = new AudioContext({ sampleRate: 16_000 });
        const audio = await context.decodeAudioData(await blob.arrayBuffer());
        if (closed) return;
        const samples = audio.getChannelData(0).slice();
        await context.close();
        if (closed) return;
        // Avoid Whisper inventing a transcript for an empty/silent recording.
        const energy = samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length;
        if (!samples.length || energy < 0.000016) {
          cancel();
          callbacks.onResult('');
          return;
        }
        worker.postMessage(samples, [samples.buffer]);
      } catch {
        fail('No se ha podido procesar la grabación. Vuelve a intentarlo.');
      }
    };
    recorder.start();
    callbacks.onReady();
    // Bound memory usage for an accidentally unattended recording.
    timer = setTimeout(stop, 120_000);
  }).catch((error: unknown) => {
    const name = error instanceof Error ? error.name : '';
    fail(name === 'NotAllowedError' || name === 'SecurityError'
      ? 'Permite el acceso al micrófono para dictar'
      : name === 'NotFoundError'
        ? 'No se ha encontrado un micrófono conectado'
        : error instanceof Error ? error.message : 'No se ha podido iniciar el dictado local');
  });

  return { stop, cancel };
}
