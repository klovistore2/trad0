"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { accountReturnTo } from "@/lib/auth/return-to";

// Signing in is one button, wherever it appears: there is no page in between to read.
export function GoogleSignIn({ returnTo = "/", label = "Continue with Google", className = "primary-button" }:
  { returnTo?: string; label?: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  return <button className={className} type="button" disabled={busy}
    onClick={() => { setBusy(true); void signIn("google", { redirectTo: accountReturnTo(returnTo) }); }}>
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="currentColor" d="M17.6 9.2c0-.6-.1-1.2-.2-1.8H9v3.4h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5Z" />
      <path fill="currentColor" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.3c-.8.6-1.9.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18Z" />
      <path fill="currentColor" d="M3.9 10.6a5.4 5.4 0 0 1 0-3.4V4.9H.9a9 9 0 0 0 0 8.1l3-2.4Z" />
      <path fill="currentColor" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 .9 4.9l3 2.3C4.6 5.1 6.6 3.6 9 3.6Z" />
    </svg>
    {label}
  </button>;
}
