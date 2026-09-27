"use client";
import { signOut } from "next-auth/react";

export function AccountStatus({ email, signOutLabel }: { email: string; signOutLabel: string }) {
  return <p className="account-status">
    {email}
    <button className="demo-button" onClick={() => void signOut({ redirectTo: "/" })}>{signOutLabel}</button>
  </p>;
}
