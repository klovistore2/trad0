"use client";
import { useState } from "react";

// The one entry point for buying credits: Stripe Checkout will be wired here, and nowhere else.
export function AddCredits({ label, soon }: { label: string; soon: string }) {
  const [asked, setAsked] = useState(false);
  return <div className="add-credits">
    <button type="button" className="primary-button" onClick={() => setAsked(true)}>{label}</button>
    {asked && <p className="quiet-note" role="status">{soon}</p>}
  </div>;
}
