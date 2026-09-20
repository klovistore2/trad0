import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { upsertOAuthUser } from "@/lib/auth/users";

export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

// Accounts are optional by design: only the person creating a conversation signs in, so their
// voice clone survives between sessions. The invited person always joins anonymously.
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [Google],
  callbacks: {
    async jwt({ token, account }) {
      // The Google identity is mapped onto our own users table: the saved voice hangs off that id.
      if (account?.provider === "google") {
        const id = await upsertOAuthUser(token.email, "google");
        if (id) token.sub = id;
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
