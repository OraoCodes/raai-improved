## YouTube Intelligence Platform — Phase 1 (MVP)

This repo contains a Next.js app (App Router, Tailwind) integrating Supabase Auth/DB and Supabase Edge Functions to:

- Connect a YouTube channel via Google OAuth with `youtube.readonly` scope
- Sync channel + recent videos into Postgres
- Generate an AI summary insight using OpenAI
- Render a simple dashboard with recent videos and insights

### 1) Environment

Create `.env.local` from the example below:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Edge functions
OPENAI_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
TOKEN_ENC_KEY=  # 32-byte base64 (e.g. `openssl rand -base64 32`)
```

### 2) Supabase setup

1. Create a Supabase project and enable Google provider in Auth.
2. In Google Cloud Console, configure OAuth Consent Screen and add the scope `https://www.googleapis.com/auth/youtube.readonly`.
3. Set Authorized redirect URI to your Supabase Auth callback (from Supabase dashboard).
4. In Supabase SQL editor, run `supabase/sql/schema.sql`.
5. Deploy Edge Functions (requires Supabase CLI installed):

```bash
supabase functions deploy store-tokens --no-verify-jwt=false
supabase functions deploy sync-channel --no-verify-jwt=false
supabase functions deploy generate-insights --no-verify-jwt=false
```

Set the following function secrets (project-level):

```bash
supabase secrets set SUPABASE_URL=... SUPABASE_ANON_KEY=... OPENAI_API_KEY=... TOKEN_ENC_KEY=... GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=...
```

### 3) Development

```bash
npm install
npm run dev
# open http://localhost:3000
```

Flow:
1. Landing → "Connect my Channel" (Google OAuth)
2. Redirect to `/connect` → stores refresh token + syncs videos
3. `/dashboard` → shows recent videos + AI insight

### Notes

- RLS policies allow users to read only their own data.
- The MVP uses YouTube Data API v3 only (no Analytics API yet).
- If refresh tokens are not returned, ensure you pass `access_type=offline` and `prompt=consent`, and your Google app is in testing or production with valid scopes.

