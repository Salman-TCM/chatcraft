import type { DefaultSession, DefaultJWT } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      accessToken: string;
      trialEndsAt: string | null;
    } & DefaultSession["user"];
    error?: "RefreshTokenError";
  }

  interface User {
    id: string;
    role: string;
    accessToken: string;
    refreshToken: string;
    trialEndsAt: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    role: string;
    accessToken: string;
    accessTokenExpiry: number;
    refreshToken: string;
    trialEndsAt: string | null;
    error?: "RefreshTokenError";
  }
}
