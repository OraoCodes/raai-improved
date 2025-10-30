import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ENC_KEY = Deno.env.get("TOKEN_ENC_KEY")!; // base64 32-byte key

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function importKey() {
  return crypto.subtle.importKey(
    "raw",
    Uint8Array.from(atob(ENC_KEY), (c) => c.charCodeAt(0)),
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
}

async function encrypt(text: string) {
  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return btoa(
    JSON.stringify({ iv: Array.from(iv), ct: Array.from(new Uint8Array(ct)) })
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth client to verify user
  const authClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
  );

  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

  // Service role client for DB writes (bypasses RLS)
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Try body first
  let fromBody = false;
  let bodyRefresh: string | undefined;
  try {
    const body = await req.json().catch(() => undefined);
    if (body?.provider_refresh_token) {
      fromBody = true;
      bodyRefresh = body.provider_refresh_token as string;
    }
  } catch {}

  // Session values
  const sessionRes = await supabase.auth.getSession();
  const session = sessionRes.data.session as any;
  const sessRefresh: string | undefined = session?.provider_refresh_token;
  const output: Record<string, unknown> = {
    had_session: !!session,
    had_sess_refresh: !!sessRefresh,
    had_body_refresh: !!bodyRefresh,
  };

  const refresh_token = bodyRefresh || sessRefresh;
  if (!refresh_token) {
    return new Response(JSON.stringify({ ok: true, note: "no refresh token provided", ...output }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  let encOk = true;
  let refresh_token_cipher = "";
  try {
    refresh_token_cipher = await encrypt(refresh_token);
  } catch (e) {
    encOk = false;
    output["encrypt_error"] = (e as Error)?.message;
  }

  if (!encOk) {
    return new Response(JSON.stringify({ ok: false, error: "encryption_failed", ...output }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const up = await supabase.from("oauth_tokens").upsert({
    user_id: user.id,
    refresh_token_cipher,
    access_token_expires_at: session?.provider_token_expires_in
      ? new Date(Date.now() + Number(session.provider_token_expires_in) * 1000).toISOString()
      : null,
  });

  return new Response(JSON.stringify({ ok: !up.error, upsert_error: up.error?.message, ...output }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
});


