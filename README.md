# BuildLedger — Setup & Deployment (Neon + Clerk + Cloudflare R2)

Construction management app: jobs, crew & live time tracking (with photo punches), inventory, billing, and emailed invoices. Built with Next.js 15 + TypeScript, Neon Postgres, Clerk (auth), Cloudflare R2 (file storage), shadcn/ui, and Resend (invoice email).

This is the migrated stack. The app previously ran on Supabase; see MIGRATION_PLAN.md for the full history and rationale.

## What you need (all have free tiers)

1. Node.js 18.18+ (20 or 22 recommended)
2. Neon account — https://neon.tech (Postgres, 10 GB free)
3. Clerk account — https://clerk.com (auth; email OTP free, TOTP 2FA needs a paid plan in production)
4. Cloudflare R2 — https://dash.cloudflare.com (file storage, 10 GB free)
5. Resend account — https://resend.com (invoice email)

## Step 1 — Install & configure

    npm install
    cp .env.example .env.local      (Windows: copy .env.example .env.local)

Fill every value in .env.local (see that file's comments for where each comes from).

## Step 2 — Database (Neon)

1. Create a Neon project; copy its pooled DATABASE_URL into .env.local.
2. In the Neon SQL editor, run the two files in supabase/migrations_neon/ in order:
   - 0001_init.sql — all tables (no Supabase RLS; users.clerk_user_id links to Clerk; punch note/photo columns included)
   - 0002_seed.sql — company, built-in Administrator role, sample data

## Step 3 — Auth (Clerk)

1. Create a Clerk application. Under User & Authentication -> Email, Phone, Username, enable Email address with Email verification code.
2. (Optional, paid in production) Multi-factor -> Authenticator application (TOTP) to add 2FA. Free on Clerk dev instances; requires a paid plan on production. See MIGRATION_PLAN.md "2FA DEFERRED" note.
3. Copy the publishable + secret keys into .env.local.
4. In Clerk -> Paths, set sign-in URL to /login.

## Step 4 — File storage (Cloudflare R2)

1. Create an R2 bucket named buildledger-photos.
2. Enable public access on the bucket -> gives you the pub-xxxx.r2.dev URL -> R2_PUBLIC_URL.
3. Create an R2 API token (Object Read & Write) -> R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY. Account ID is in the dashboard -> R2_ACCOUNT_ID.

## Step 5 — Email (Resend)

Verify your domain in Resend (DNS records), create an API key -> RESEND_API_KEY, and set INVOICE_FROM_EMAIL to an address on the verified domain.

## Step 6 — Run

    npm run build
    npm run start       (or: npm run dev  for local development)

First sign-in with the email you set as SUPPORT_ADMIN_EMAIL automatically makes that account the superadmin. Everyone else signs in and waits for an admin to assign them a role + mark them active under Admin -> Users.

## Deploy on your VM (current production: workstock.mobrauntech.com)

This app runs behind nginx + PM2 on the Ubuntu VM. To update:

    cd ~/BuildledgerProduction
    git pull
    npm install
    npm run build
    pm2 restart buildledger

Make sure the VM's .env.local has all the new keys above. In Clerk, add your production domain (workstock.mobrauntech.com) to the allowed origins, and when ready switch Clerk from a Development to a Production instance (new pk_live_/sk_live_ keys).

## Architecture notes

- All database access is server-side. Client components call server actions (the actions.ts file in each feature folder) or API routes — never the database directly. The Neon connection string is secret and never reaches the browser. Company scoping is enforced in every query (where company_id = ...).
- Auth flow: Clerk authenticates the user; src/lib/auth.ts then loads (or bootstraps) that user's profile + role permissions from Neon. The permission catalog in src/lib/permissions.ts is unchanged from the original design.
- Photos: punch photos upload via POST /api/upload -> Cloudflare R2 -> public URL stored on the punch row.
- Invoices: generated as a row with a line-item snapshot, downloadable as PDF (client-side jsPDF), and emailed via Resend through POST /api/invoices/send.

## Troubleshooting

- Build fails referencing supabase -> a file wasn't migrated; grep -rl supabase src/ should return nothing.
- "Account pending" after login -> expected for non-admins until an admin activates them. For the superadmin, confirm SUPPORT_ADMIN_EMAIL matches your login email exactly.
- Photo upload fails -> check R2 keys and that the bucket has public access enabled.
- Invoice email fails -> check Resend domain verification and INVOICE_FROM_EMAIL.
