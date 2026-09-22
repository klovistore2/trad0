"use client";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
export function ShareSession({ id }: { id: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("");
  useEffect(() => {
    const link = `${window.location.origin}/join/${id}`;
    // The URL is browser-derived so local previews and HTTPS deployments agree.
    const field = document.getElementById("join-link") as HTMLInputElement | null;
    if (field) field.value = link;
    if (canvas.current) void QRCode.toCanvas(canvas.current, link, { width: 224, margin: 2, color: { dark: "#243e38", light: "#ffffff" } }).catch(() => setMessage("Copiez le lien pour inviter l’autre personne."));
  }, [id]);
  const link = () => `${window.location.origin}/join/${id}`;
  async function copy() {
    try { await navigator.clipboard.writeText(link()); setMessage("Lien copié."); }
    catch { setUrl(link()); setMessage("Sélectionnez et copiez ce lien."); }
  }
  return <section className="share-session">
    <h1>Invitez l’autre<br /><em>personne.</em></h1>
    <p className="intro">Scannez ce code avec le deuxième téléphone.<br />Scan this code with the other phone.</p>
    <canvas ref={canvas} aria-label="QR code du lien d’invitation" role="img" />
    <div className="share-actions"><button className="demo-button" onClick={() => void copy()}>Copier le lien</button><button className="demo-button" onClick={async () => {
      if (!navigator.share) { await copy(); return; }
      try { await navigator.share({ title: "À deux", url: link() }); }
      catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) await copy(); }
    }}>Partager</button></div>
    <input id="join-link" className="join-link" aria-label="Lien d’invitation" readOnly defaultValue={url} onFocus={event => event.target.select()} />
    {message && <p role="status" className="quiet-note">{message}</p>}
  </section>;
}
