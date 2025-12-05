import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const ENC_KEY = Deno.env.get("TOKEN_ENC_KEY")!;

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
    ["decrypt"]
  );
}

async function decrypt(cipher: string) {
  const { iv, ct } = JSON.parse(atob(cipher));
  const key = await importKey();
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    key,
    new Uint8Array(ct)
  );
  return new TextDecoder().decode(pt);
}

async function refreshAccessToken(refresh: string) {
  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: refresh,
    grant_type: "refresh_token",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body });
  if (!r.ok) throw new Error("Token refresh failed");
  return (await r.json()) as { access_token: string; expires_in: number };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get video ID and token from request body (read once!)
    const body = await req.json().catch(() => ({}));
    const { videoId, maxResults = 20, provider_token } = body;
    
    if (!videoId) {
      return new Response("videoId required", { status: 400, headers: corsHeaders });
    }

    // Get access token
    let access_token: string | undefined = provider_token;

    if (!access_token) {
      const tok = await supabase.from("oauth_tokens").select("*").eq("user_id", user.id).maybeSingle();
      if (!tok.data) return new Response("No access token", { status: 400, headers: corsHeaders });
      const refresh = await decrypt(tok.data.refresh_token_cipher as unknown as string);
      const refreshed = await refreshAccessToken(refresh);
      access_token = refreshed.access_token;
    }

    // Fetch comments from YouTube
    const url = new URL("https://www.googleapis.com/youtube/v3/commentThreads");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("videoId", videoId);
    url.searchParams.set("maxResults", String(maxResults));
    url.searchParams.set("order", "relevance");

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(errorText, { status: response.status, headers: corsHeaders });
    }

    const data = await response.json();
    
    // Transform comments to a simpler format
    const comments = (data.items || []).map((item: any) => ({
      id: item.id,
      author: item.snippet.topLevelComment.snippet.authorDisplayName,
      authorProfileImage: item.snippet.topLevelComment.snippet.authorProfileImageUrl,
      text: item.snippet.topLevelComment.snippet.textDisplay,
      likeCount: item.snippet.topLevelComment.snippet.likeCount,
      publishedAt: item.snippet.topLevelComment.snippet.publishedAt,
      replyCount: item.snippet.totalReplyCount || 0,
    }));

    return new Response(
      JSON.stringify({ 
        comments,
        totalResults: data.pageInfo?.totalResults || 0,
      }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (e: any) {
    return new Response(e?.message || "Internal error", { status: 500, headers: corsHeaders });
  }
});

