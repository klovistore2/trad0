"use client";
import { signOut } from "next-auth/react";

export function AccountStatus({ email }: { email: string }) {
  return <p className="account-status">
    {email}
    <button className="demo-button" onClick={() => void signOut({ redirectTo: "/" })}>Sign out</button>
  </p>;
}
