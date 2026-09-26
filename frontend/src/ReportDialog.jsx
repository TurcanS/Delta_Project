import { useEffect, useRef, useState } from 'react';
import { Close, Arrow } from './Icons';

export default function ReportDialog({ sectors, initialSector, onClose }) {
  const dialog = useRef(null);
  const [sectorId, setSectorId] = useState(initialSector);
  const [status, setStatus] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const sector = sectors.find((item) => item.id === sectorId);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  async function copyReport(event) {
    event.preventDefault();
    if (!subject.trim() || !description.trim()) {
      setStatus('Completează subiectul și descrierea înainte de a copia textul.');
      return;
    }
    const text = `Către Pretura sectorului ${sector.label}\nSubiect: ${subject.trim()}\n\n${description.trim()}`;
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Textul a fost copiat. Îl poți lipi în formularul oficial al preturii.');
    } catch {
      setStatus('Copierea automată nu este disponibilă. Selectează și copiază textul din câmpurile de mai sus.');
    }
  }
  return (
    <dialog ref={dialog} className="report-dialog" aria-labelledby="report-title" onClose={() => { if (!dialog.current.open) onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) dialog.current.close(); }}>
      <div className="report-dialog__inner">
        <button className="dialog-close" type="button" aria-label="Închide formularul" onClick={() => dialog.current.close()}><Close /></button>
        <p className="eyebrow">O SESIZARE, UN PRIM PAS</p>
        <h2 id="report-title">Spune ce se întâmplă în cartier.</h2>
        <p className="dialog-intro">Pregătește textul aici, apoi trimite-l pe pagina oficială. Acest formular nu transmite automat sesizarea.</p>
        <form onSubmit={copyReport} onChange={() => setStatus('')}>
          <label>Sectorul<select value={sectorId} onChange={(event) => setSectorId(event.target.value)}>{sectors.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label>Subiect<input autoFocus required maxLength={140} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Ex.: iluminat stradal pe strada…" /></label>
          <label>Ce ai observat?<textarea required rows={4} maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descrie problema și indică strada sau un reper." /></label>
          <div className="dialog-actions"><button className="primary-action" type="submit">Copiază textul</button><a className="text-action" href={sector.petitions_url} target="_blank" rel="noreferrer">{sector.id === 'botanica' ? 'Contactează pretura' : 'Deschide pagina de petiții'}<Arrow /></a></div>
          <p className="dialog-status" role="status">{status}</p>
        </form>
      </div>
    </dialog>
  );
}
