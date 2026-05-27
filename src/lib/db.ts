import { neon } from "@neondatabase/serverless";

// Single source of truth for database access in the Neon world.
// Usage:
//   const rows = await sql`select * from jobs where company_id = ${companyId}`;
// The neon() tagged-template client parameterizes inputs safely (no SQL injection).
//
// IMPORTANT: this must only ever run on the server. DATABASE_URL is secret and
// is never exposed to the browser. All client components call API routes /
// server actions, which in turn use this helper.

if (!process.env.DATABASE_URL) {
  // Don't throw at import time during build; throw lazily when actually used.
  // (Next.js may import this file during build where env may be absent.)
}

export const sql = neon(process.env.DATABASE_URL || "postgres://invalid:invalid@localhost/invalid");

// Convenience for a single row (or null).
export async function one<T = any>(rows: T[]): Promise<T | null> {
  return rows.length ? rows[0] : null;
}
