import { Mic, Square, X } from 'lucide-react';

export default function Dictation() {
  return (
    <>
      <button id="dictate" type="button" className="icon-btn dictation-trigger" title="Dictar por voz" aria-label="Dictar por voz" aria-haspopup="dialog" hidden>
        <Mic aria-hidden="true" />
      </button>
      <dialog id="dictation" className="dictation" aria-labelledby="dictation-title" aria-describedby="dictation-help">
        <div className="dictation-body">
          <div id="dictation-bubble" className="dictation-bubble" aria-hidden="true">
            <span className="dictation-halo" />
            <span className="dictation-orb"><Mic /></span>
          </div>
          <p id="dictation-title" className="dictation-title" role="status">Te escucho...</p>
          <p id="dictation-help" className="dictation-help">Al terminar, el dictado se añadirá al texto.</p>
          <div className="dictation-actions">
            <button id="dictation-cancel" type="button" className="dictation-cancel"><X aria-hidden="true" />Cancelar</button>
            <button id="dictation-stop" type="button" className="dictation-stop" autoFocus><Square aria-hidden="true" />Terminar dictado</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
