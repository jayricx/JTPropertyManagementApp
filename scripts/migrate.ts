import fs from "node:fs";
import dotenv from "dotenv";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

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

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const drizzleClient = drizzle(pool);
  await migrate(drizzleClient, { migrationsFolder: "drizzle" });
  await pool.end();
  console.log("Migrations applied.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
