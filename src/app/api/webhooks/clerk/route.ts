import { NextResponse } from "next/server";
import crypto from "crypto";
import { sql } from "@/lib/db";
import { logger } from "@/lib/logger";

// POST /api/webhooks/clerk
// Real-time sync from Clerk → our records. When an invited employee finishes
// signing up, Clerk fires `user.created`; we link their new Clerk user id back
// to the employee/user rows and flip the invite to "accepted". This replaces
// polling Clerk's paginated invitation list (which loses older accepted invites
// once it spans more than one page).
//
// The endpoint is public (see middleware) but authenticated by Svix's signature
// over the raw body — verified here with Node crypto so we need no extra deps.

export const runtime = "nodejs";

// Verify a Svix-signed webhook. Returns true only if one of the provided
// signatures matches, the secret is configured, and the timestamp is recent.
function verifySvix(secret: string, headers: Headers, body: string): boolean {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatureHeader = headers.get("svix-signature");
  if (!id || !timestamp || !signatureHeader) return false;

  // Reject stale deliveries (replay protection): 5 minute tolerance.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 60 * 5) return false;

  // Secret is `whsec_<base64>`; the HMAC key is the decoded base64.
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${body}`;
  const expected = crypto.createHmac("sha256", key).update(signedContent).digest("base64");
  const expectedBuf = Buffer.from(expected);

  // Header is space-separated `v1,<sig>` entries; any match passes.
  for (const part of signatureHeader.split(" ")) {
    const sig = part.split(",")[1];
    if (!sig) continue;
    const sigBuf = Buffer.from(sig);
    if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return true;
    }
  }
  return false;
}

function primaryEmail(data: any): string | null {
  const list: any[] = data?.email_addresses ?? [];
  const primaryId = data?.primary_email_address_id;
  const primary = list.find((e) => e.id === primaryId) ?? list[0];
  return primary?.email_address ?? null;
}

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("webhook.clerk", "CLERK_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // Signature is computed over the exact raw bytes — read as text, don't parse first.
  const body = await req.text();
  if (!verifySvix(secret, req.headers, body)) {
    logger.warn("webhook.clerk", "rejected: bad signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let evt: any;
  try {
    evt = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    if (evt.type === "user.created") {
      const clerkUserId: string = evt.data?.id;
      const email = primaryEmail(evt.data);
      if (clerkUserId && email) {
        // Link the new Clerk identity to the invited employee and mark accepted.
        await sql`
          update public.employees
          set clerk_user_id = ${clerkUserId}, invite_status = 'accepted'
          where lower(invite_email) = lower(${email})
            and (clerk_user_id is null or invite_status is distinct from 'accepted')
        `;
        // Claim the pre-provisioned user row so sign-in and invite are one record.
        await sql`
          update public.users
          set clerk_user_id = ${clerkUserId}
          where lower(email) = lower(${email}) and clerk_user_id is null
        `;
        logger.info("webhook.clerk", "linked accepted invite", { email });
      }
    }
  } catch (e) {
    logger.error("webhook.clerk", "handler failed", { type: evt?.type, err: e });
    // 500 tells Clerk to retry — the event is signed and valid, we just failed.
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
