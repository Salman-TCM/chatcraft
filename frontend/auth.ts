import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

// BACKEND_URL is the internal Docker service URL used by server-side code (NextAuth).
// NEXT_PUBLIC_API_URL is the browser-facing URL used by client components.
const API_URL = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const ACCESS_TOKEN_LIFETIME_MS = 14 * 60 * 1000; // 14 min (1 min buffer before 15 min expiry)

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        try {
          const res = await fetch(`${API_URL}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });
          if (!res.ok) return null;
          const { data } = await res.json();
          return {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name ?? null,
            image: data.user.avatar_url ?? null,
            role: data.user.role,
            accessToken: data.access_token,
            refreshToken: data.refresh_token ?? "",
            trialEndsAt: data.user.trial_ends_at ?? null,
          };
        } catch {
          return null;
        }
      },
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        try {
          const res = await fetch(`${API_URL}/api/auth/google/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              google_id: account.providerAccountId,
              email: user.email,
              name: user.name ?? null,
              avatar_url: user.image ?? null,
            }),
          });
          if (!res.ok) return false;
          const { data } = await res.json();
          // Attach backend tokens so jwt callback can store them
          user.id = data.user.id;
          user.role = data.user.role;
          user.accessToken = data.access_token;
          user.refreshToken = data.refresh_token ?? "";
          user.trialEndsAt = data.user.trial_ends_at ?? null;
        } catch {
          return false;
        }
      }
      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.accessToken = user.accessToken;
        token.refreshToken = user.refreshToken;
        token.accessTokenExpiry = Date.now() + ACCESS_TOKEN_LIFETIME_MS;
        token.trialEndsAt = user.trialEndsAt ?? null;
      }
      // Proactively refresh the backend access token when it nears expiry
      if (Date.now() < token.accessTokenExpiry) return token;

      // No refresh token stored — can't refresh
      if (!token.refreshToken) {
        token.error = "RefreshTokenError";
        return token;
      }

      try {
        // Send the refresh token as a header — server-side Node.js fetch cannot
        // access the browser's httpOnly cookies, so we pass it explicitly.
        const res = await fetch(`${API_URL}/api/auth/refresh`, {
          method: "POST",
          headers: { "X-Refresh-Token": token.refreshToken },
        });
        if (!res.ok) throw new Error("refresh failed");
        const { data } = await res.json();
        token.accessToken = data.access_token;
        token.refreshToken = data.refresh_token ?? token.refreshToken;
        token.accessTokenExpiry = Date.now() + ACCESS_TOKEN_LIFETIME_MS;
        if (data.user?.role) token.role = data.user.role;
        delete token.error;
      } catch {
        token.error = "RefreshTokenError";
      }
      return token;
    },

    async session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.accessToken = token.accessToken;
      session.user.trialEndsAt = token.trialEndsAt ?? null;
      if (token.error) session.error = token.error;
      return session;
    },
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60,
  },
});
