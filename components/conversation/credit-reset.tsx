"use client";
import { useState } from "react";

// DEV only: puts the conversation creator's credits back to the welcome amount, for testing
// the zero-credit stop again. The server accepts it only in a conversation created by an admin.
export function CreditReset({ id, onReset }: { id: string; onReset: () => void }) {
  const [status, setStatus] = useState("");
  return <div className="credit-reset">
    <button type="button" className="demo-button" onClick={async () => {
      setStatus("…");
      try {
        const response = await fetch(`/api/sessions/${id}/credits`, { method: "POST" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setStatus(`Balance reset to ${data.balance}`); onReset();
      } catch (error) { setStatus(error instanceof Error ? error.message : "Reset failed"); }
    }}>{"Reset credits"}</button>
    {status && <span role="status">{status}</span>}
  </div>;
}
