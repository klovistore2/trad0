"use client";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type { StringKey, Translate } from "@/lib/i18n/strings";
// The creator's first screen once the conversation exists, in their own language.
export function ShareSession({ id, t }: { id: string; t: Translate }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [message, setMessage] = useState<StringKey | "">("");
  const [url, setUrl] = useState("");
  useEffect(() => {
    const link = `${window.location.origin}/join/${id}`;
    // The URL is browser-derived so local previews and HTTPS deployments agree.
    const field = document.getElementById("join-link") as HTMLInputElement | null;
    if (field) field.value = link;
    if (canvas.current) void QRCode.toCanvas(canvas.current, link, { width: 224, margin: 2, color: { dark: "#243e38", light: "#ffffff" } }).catch(() => setMessage("qrFailed"));
  }, [id]);
  const link = () => `${window.location.origin}/join/${id}`;
  async function copy() {
    try { await navigator.clipboard.writeText(link()); setMessage("linkCopied"); }
    catch { setUrl(link()); setMessage("linkSelect"); }
  }
  return <section className="share-session">
    <h1>{t("inviteTitle")}<br /><em>{t("inviteTitleEm")}</em></h1>
    <p className="intro">{t("inviteScan")}</p>
    <canvas ref={canvas} aria-label={t("inviteQr")} role="img" />
    <div className="share-actions"><button className="demo-button" onClick={() => void copy()}>{t("copyLink")}</button><button className="demo-button" onClick={async () => {
      if (!navigator.share) { await copy(); return; }
      try { await navigator.share({ title: "Trad0", url: link() }); }
      catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) await copy(); }
    }}>{t("shareLink")}</button></div>
    <input id="join-link" className="join-link" aria-label={t("inviteLink")} readOnly defaultValue={url} onFocus={event => event.target.select()} />
    {message && <p role="status" className="quiet-note">{t(message)}</p>}
  </section>;
}
