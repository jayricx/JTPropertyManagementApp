import fs from "node:fs";
import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

// Load .env.local first, then .env (existing values are not overridden).
for (const file of [".env.local", ".env"]) {
  if (fs.existsSync(file)) {
    dotenv.config({ path: file, override: false });
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local (copy the connection string from the Neon dashboard).",
    );
  }

  // HTTP (SQL-over-HTTP) driver — the WebSocket driver hangs in this
  // environment, see src/db/client.ts.
  const drizzleClient = drizzle(neon(process.env.DATABASE_URL));
  await migrate(drizzleClient, { migrationsFolder: "drizzle" });
  console.log("Migrations applied.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
