import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, googleEnabled } from "@/auth";
import { GoogleSignIn } from "@/components/account/google-sign-in";
import { ThemeToggle } from "@/components/conversation/theme-toggle";

export default async function AccountPage() {
  if (await auth()) redirect("/");
  return <main className="conversation">
    <header className="topbar">
      <Link className="wordmark" href="/" aria-label="À deux, accueil">à deux<span className="brand-dot">.</span></Link>
      <div className="topbar-actions"><span className="edition">COMPTE</span><ThemeToggle /></div>
    </header>
    <section className="conversation-body">
      <div className="account">
        <h1>Garder votre voix.</h1>
        <p className="intro">Un compte sert à une seule chose : conserver votre voix d’une conversation à l’autre, au lieu de la recréer à chaque fois. La personne que vous invitez n’a jamais besoin d’en créer un.</p>
        <div className="account-methods">
          {googleEnabled
            ? <GoogleSignIn />
            : <p className="error-message" role="alert">La connexion Google n’est pas configurée sur ce déploiement. Renseignez AUTH_GOOGLE_ID et AUTH_GOOGLE_SECRET, puis redéployez.</p>}
        </div>
      </div>
    </section>
    <footer><span className="footer-mark" aria-hidden="true">↔</span><p>Juste vous deux.<br /><span>Votre invité reste anonyme.</span></p></footer>
  </main>;
}
