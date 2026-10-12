import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit configuration.
 *
 * The connection string comes from DATABASE_URL (loaded from `.env` by
 * drizzle-kit, or exported in the shell). It used to be hard-coded to a
 * localhost database, which silently made `drizzle-kit push` target the wrong
 * server and left the real (e.g. Neon) database without any tables.
 *
 * Recommended way to create/upgrade the schema: `npm run db:setup`
 * (idempotent, additive, never drops data). `npm run db:push` also works.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
