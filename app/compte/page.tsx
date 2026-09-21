import { accountReturnTo } from "@/lib/auth/return-to";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, googleEnabled } from "@/auth";
import { GoogleSignIn } from "@/components/account/google-sign-in";
import { ThemeToggle } from "@/components/conversation/theme-toggle";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const returnTo = accountReturnTo((await searchParams).returnTo);
  if (await auth()) redirect(returnTo);
  return <main className="conversation">
    <header className="topbar">
      <Link className="wordmark" href="/" aria-label="Trad0, home">Trad0<span className="brand-dot">.</span></Link>
      <div className="topbar-actions"><span className="edition">ACCOUNT</span><ThemeToggle /></div>
    </header>
    <section className="conversation-body">
      <div className="account">
        <h1>Keep your voice.</h1>
        <p className="intro">An account does one thing: it keeps your voice from one conversation to the next, instead of rebuilding it every time. Joining and translating stay available without an account. Creating a personal voice requires one.</p>
        <div className="account-methods">
          {googleEnabled
            ? <GoogleSignIn returnTo={returnTo} />
            : <p className="error-message" role="alert">Google sign-in is not configured on this deployment. Set AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET, then redeploy.</p>}
        </div>
      </div>
    </section>
    <footer><span className="footer-mark" aria-hidden="true">↔</span><p>Just the two of you.<br /><span>An account is optional for your guest.</span></p></footer>
  </main>;
}
