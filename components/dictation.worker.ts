import { env, pipeline } from '@huggingface/transformers';

// Model files are cached by Transformers.js; recordings stay in memory only.
env.allowLocalModels = false;
env.backends.onnx.wasm!.numThreads = 1;

const transcriber = pipeline('automatic-speech-recognition', 'onnx-community/whisper-base', {
  device: 'wasm',
  dtype: 'q8',
});

transcriber.then(() => self.postMessage({ type: 'ready' })).catch(() => {
  self.postMessage({ type: 'error', message: 'No se ha podido descargar el dictado local. Comprueba la conexión y vuelve a intentarlo.' });
});

self.onmessage = async (event: MessageEvent<Float32Array>) => {
  try {
    const recognize = await transcriber;
    const result = await recognize(event.data, {
      language: 'spanish',
      task: 'transcribe',
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: false,
    });
    const text = Array.isArray(result) ? result.map(item => item.text).join(' ') : result.text;
    self.postMessage({ type: 'result', text: text.trim() });
  } catch {
    self.postMessage({ type: 'error', message: 'No se ha podido transcribir el audio. Vuelve a intentarlo.' });
  }
};
