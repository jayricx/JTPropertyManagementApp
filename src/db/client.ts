import { drizzle } from "drizzle-orm/neon-http";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import * as schema from "./schema";

// The Neon HTTP (SQL-over-HTTP) driver is used instead of the
// WebSocket driver because the WebSocket connection hangs in this
// environment (TCP + TLS connect fine, but the postgres wire
// protocol over the socket never completes). The HTTP API works
// reliably and is the recommended driver for serverless environments.
const sql: NeonQueryFunction<false, false> = process.env.DATABASE_URL
  ? neon(process.env.DATABASE_URL)
  : // Only invoked by code that queries the database; every such
    // path in this app checks DATABASE_URL first and returns early.
    (() => {
      throw new Error("DATABASE_URL is not set in .env.local");
    }) as unknown as NeonQueryFunction<false, false>;

export const db = drizzle(sql, { schema });
