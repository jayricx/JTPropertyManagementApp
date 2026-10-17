import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/db/client";
import { googleClientId, googleClientSecret } from "@/lib/auth-providers";
import {
  accounts,
  authenticators,
  sessions,
  users,
  verificationTokens,
} from "@/db/schema";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Registered only when both halves of the OAuth client are present, so a
// deployment without Google never advertises a provider it can't finish.
const googleId = googleClientId();
const googleSecret = googleClientSecret();
const googleProvider =
  googleId && googleSecret
    ? Google({
        clientId: googleId,
        clientSecret: googleSecret,
        // Google verifies the address before returning it, and every account
        // here is only ever created after its email was proven (a 6-digit OTP
        // at signup, an emailed invite for tenants). Linking a Google identity
        // onto a matching verified email is what lets an invited tenant — or
        // an owner who also rents — sign in either way and still reach the
        // same profile, instead of dead-ending on `OAuthAccountNotLinked`.
        allowDangerousEmailAccountLinking: true,
        // `users.image` is varchar(255). Google's avatar URLs normally fit
        // well inside that; truncating keeps an unusually long one from
        // failing the insert and blocking the signup outright.
        profile(profile) {
          return {
            id: profile.sub,
            name: profile.name,
            email: profile.email,
            image: profile.picture?.slice(0, 255) ?? null,
          };
        },
      })
    : null;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
    authenticatorsTable: authenticators,
  }),
  session: {
    strategy: "jwt",
    // Explicit so a reset can meaningfully sign other devices out, and so
    // a stolen cookie has a bounded life.
    maxAge: 7 * 24 * 60 * 60,
  },
  // The app runs behind Vercel's proxy, so derive the origin from the
  // forwarded host instead of hardcoding AUTH_URL — without this, Auth.js
  // throws a configuration error in production builds.
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    ...(googleProvider ? [googleProvider] : []),
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const result = await db
          .select()
          .from(users)
          .where(eq(users.email, email.toLowerCase()))
          .limit(1);
        const user = result[0];

        if (!user?.passwordHash) return null;

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      // Google verifies the address on its side, but only the `email_verified`
      // claim proves it. Since a matching email is *linked* to an existing
      // account (see the provider above), refuse anything Google hasn't
      // confirmed rather than trusting the address on faith. Every other
      // provider — credentials included — is unaffected.
      if (account?.provider === "google") {
        return Boolean(profile?.email_verified);
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        // Fresh sign-in: stamp the password-change time so a later reset
        // can invalidate this session.
        token.id = user.id;
        token.role = user.role;
        const [row] = await db
          .select({ changedAt: users.passwordChangedAt })
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);
        token.pw = row?.changedAt?.getTime() ?? null;
        return token;
      }

      // Existing token — has the password changed since it was minted?
      // Returning null is how Auth.js invalidates a session, and it is the
      // only hook that works server-side: `auth()` re-attaches the token as
      // `session.user`, so a session callback cannot remove it.
      const id = token.id as string | undefined;
      if (id) {
        const [row] = await db
          .select({ changedAt: users.passwordChangedAt })
          .from(users)
          .where(eq(users.id, id))
          .limit(1);
        if ((token.pw ?? null) !== (row?.changedAt?.getTime() ?? null)) {
          return null;
        }
      }

      // Tokens issued before roles existed default to landlord.
      if (!token.role) token.role = "landlord";
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      if (session.user) {
        session.user.role =
          (token.role as "landlord" | "tenant" | undefined) ?? "landlord";
      }
      return session;
    },
  },
});
