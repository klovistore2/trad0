"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
export function StartSharedSession({ signedIn }: { signedIn: boolean }) {
  const router = useRouter(); const busy = useRef(false);
  const [message, setMessage] = useState(""); const [loading, setLoading] = useState(false);
  // Creating a conversation keeps your voice, so it needs an account. Joining one never does.
  if (!signedIn) return <Link className="primary-button" href="/compte">Se connecter pour parler à deux</Link>;
  return <div>
    <button className="primary-button" disabled={loading} onClick={async () => {
      if (busy.current) return; busy.current = true; setLoading(true); setMessage("");
      try {
        const response = await fetch("/api/sessions", { method: "POST" }); const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        router.push(`/session/${data.id}`);
      } catch (error) { setMessage(error instanceof Error ? error.message : "Impossible de créer la conversation."); }
      finally { busy.current = false; setLoading(false); }
    }}>{loading ? "Création…" : "Parler à deux · inviter quelqu’un"}</button>
    {message && <p role="alert" className="error-message">{message}</p>}
  </div>;
}
