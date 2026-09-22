"use client";
import { useRouter } from "next/navigation";
import { GoogleSignIn } from "@/components/account/google-sign-in";
import type { Language } from "@/types/session";
import type { Translate } from "@/lib/i18n/strings";
import { useRef, useState } from "react";
export function StartSharedSession({ signedIn, peerLanguage, language, languageAuto, peerLanguageAuto, t, returnTo }: { signedIn: boolean; peerLanguage: Language; language: Language; languageAuto: boolean; peerLanguageAuto: boolean; t: Translate; returnTo: string }) {
  const router = useRouter(); const busy = useRef(false);
  const [message, setMessage] = useState(""); const [loading, setLoading] = useState(false);
  // Creating a conversation keeps your voice, so it needs an account. Joining one never does.
  // Google is the only way in, so the button signs in on the spot instead of opening a page for it.
  if (!signedIn) return <GoogleSignIn returnTo={returnTo} label={t("homeSignIn")} />;
  return <div>
    <button className="primary-button" disabled={loading} onClick={async () => {
      if (busy.current) return; busy.current = true; setLoading(true); setMessage("");
      try {
        const response = await fetch("/api/sessions", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ peerLanguage, language, languageAuto, peerLanguageAuto }),
        }); const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        router.push(`/session/${data.id}`);
      } catch (error) { setMessage(error instanceof Error ? error.message : t("homeCreateError")); }
      finally { busy.current = false; setLoading(false); }
    }}>{loading ? t("homeCreating") : t("homeStart")}</button>
    {message && <p role="alert" className="error-message">{message}</p>}
  </div>;
}
