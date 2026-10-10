import { drizzle } from "drizzle-orm/neon-serverless";
import { Client } from "@neondatabase/serverless";
import * as schema from "./schema";

// The client is created lazily (no connection is opened until the first query),
// so pages that don't touch the database work without DATABASE_URL set.
const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(client, { schema });
