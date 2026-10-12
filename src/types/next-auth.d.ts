import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "landlord" | "tenant";
    } & DefaultSession["user"];
  }

  interface User {
    /** Set by the credentials provider; absent on adapter-created users. */
    role?: "landlord" | "tenant";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "landlord" | "tenant";
  }
}
