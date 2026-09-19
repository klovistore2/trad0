"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
export function StartSharedSession() {
  const router = useRouter(); const busy = useRef(false);
  const [message, setMessage] = useState(""); const [loading, setLoading] = useState(false);
  return <div>
    <button className="demo-button" disabled={loading} onClick={async () => {
      if (busy.current) return; busy.current = true; setLoading(true); setMessage("");
      try {
        const response = await fetch("/api/sessions", { method: "POST" }); const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        router.push(`/session/${data.id}`);
      } catch (error) { setMessage(error instanceof Error ? error.message : "Impossible de créer la conversation."); }
      finally { busy.current = false; setLoading(false); }
    }}>{loading ? "Création…" : "Parler à deux · inviter quelqu’un ↗"}</button>
    {message && <p role="alert" className="error-message">{message}</p>}
  </div>;
}
