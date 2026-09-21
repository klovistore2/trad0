"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Language } from "@/types/session";
import { useRef, useState } from "react";
export function StartSharedSession({ signedIn, peerLanguage }: { signedIn: boolean; peerLanguage: Language }) {
  const router = useRouter(); const busy = useRef(false);
  const [message, setMessage] = useState(""); const [loading, setLoading] = useState(false);
  // Creating a conversation keeps your voice, so it needs an account. Joining one never does.
  if (!signedIn) return <Link className="primary-button" href="/compte">Sign in to start a conversation</Link>;
  return <div>
    <button className="primary-button" disabled={loading} onClick={async () => {
      if (busy.current) return; busy.current = true; setLoading(true); setMessage("");
      try {
        const response = await fetch("/api/sessions", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ peerLanguage }),
        }); const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        router.push(`/session/${data.id}`);
      } catch (error) { setMessage(error instanceof Error ? error.message : "The conversation could not be created."); }
      finally { busy.current = false; setLoading(false); }
    }}>{loading ? "Creating…" : "Talk to someone · invite them"}</button>
    {message && <p role="alert" className="error-message">{message}</p>}
  </div>;
}
