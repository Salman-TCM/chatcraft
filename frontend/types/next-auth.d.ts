import type { DefaultSession, DefaultJWT } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      accessToken: string;
    } & DefaultSession["user"];
    error?: "RefreshTokenError";
  }

  interface User {
    id: string;
    role: string;
    accessToken: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    role: string;
    accessToken: string;
    accessTokenExpiry: number;
    error?: "RefreshTokenError";
  }
}
