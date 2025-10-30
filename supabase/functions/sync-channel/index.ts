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

function parseISODuration(iso: string) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const [h, mi, s] = [m?.[1] ?? "0", m?.[2] ?? "0", m?.[3] ?? "0"].map(Number);
  return h * 3600 + mi * 60 + s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
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

    // Accept provider_token and maxVideos from request body (sent by client)
    let access_token: string | undefined;
    let maxVideos = 500;
    try {
      const body = await req.json().catch(() => ({}));
      access_token = body?.provider_token;
      if (body?.maxVideos && Number.isFinite(body.maxVideos)) {
        maxVideos = Math.max(1, Math.min(5000, Number(body.maxVideos)));
      }
    } catch (_) {
      // ignore
    }

    // Fallback: try session provider_token
    if (!access_token) {
      const sess = await supabase.auth.getSession();
      access_token = (sess.data.session as any)?.provider_token;
    }

    // Fallback: use stored refresh token
    if (!access_token) {
      const tok = await supabase.from("oauth_tokens").select("*").eq("user_id", user.id).maybeSingle();
      if (!tok.data) return new Response("No access or refresh token", { status: 400, headers: corsHeaders });
      const refresh = await decrypt(tok.data.refresh_token_cipher as unknown as string);
      const refreshed = await refreshAccessToken(refresh);
      access_token = refreshed.access_token;
    }

    const authz = { Authorization: `Bearer ${access_token}` } as const;

    // Fetch channel
    const chRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&mine=true",
      { headers: authz }
    );
    const chJson = await chRes.json();
    const ch = chJson.items?.[0];
    if (!ch) return new Response("No channel", { status: 400, headers: corsHeaders });

    // If channel exists and belongs to another user, block
    const existing = await supabase
      .from("channels")
      .select("id,user_id")
      .eq("yt_channel_id", ch.id)
      .maybeSingle();
    if (existing.data && existing.data.user_id && existing.data.user_id !== user.id) {
      return new Response("Channel already connected to another account", { status: 409, headers: corsHeaders });
    }

    const toWrite = {
      user_id: user.id,
      yt_channel_id: ch.id,
      title: ch.snippet.title,
      country: ch.snippet.country ?? null,
      uploads_playlist_id: ch.contentDetails.relatedPlaylists.uploads,
      subs: Number(ch.statistics.subscriberCount ?? 0),
      views: Number(ch.statistics.viewCount ?? 0),
      last_sync: new Date().toISOString(),
    };

    let upsertCh = await supabase
      .from("channels")
      .upsert(toWrite, { onConflict: "yt_channel_id" })
      .select()
      .single();

    if (upsertCh.error && (upsertCh.error as any).code === "23505") {
      // Duplicate key encountered due to race; perform explicit update
      const upd = await supabase
        .from("channels")
        .update(toWrite)
        .eq("yt_channel_id", ch.id)
        .select()
        .single();
      if (!upd.error) upsertCh = upd;
    }

    if (upsertCh.error) {
      return new Response(upsertCh.error.message, { status: 400, headers: corsHeaders });
    }

    const channelId = upsertCh.data.id;

    // Collect video IDs via uploads playlist
    const uploads = ch.contentDetails.relatedPlaylists.uploads;
    let nextPageToken: string | undefined = undefined;
    const videoIds: string[] = [];
    do {
      const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
      url.searchParams.set("part", "contentDetails");
      url.searchParams.set("playlistId", uploads);
      url.searchParams.set("maxResults", "50");
      if (nextPageToken) url.searchParams.set("pageToken", nextPageToken);
      const r = await fetch(url, { headers: authz });
      const j = await r.json();
      for (const it of j.items ?? []) videoIds.push(it.contentDetails.videoId);
      nextPageToken = j.nextPageToken;
    } while (nextPageToken && videoIds.length < maxVideos);

    // Fetch details in batches
    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50);
      const url = new URL("https://www.googleapis.com/youtube/v3/videos");
      url.searchParams.set("part", "snippet,contentDetails,statistics");
      url.searchParams.set("id", batch.join(","));
      const r = await fetch(url, { headers: authz });
      const j = await r.json();

      const rows = (j.items ?? []).map((v: any) => ({
        channel_id: channelId,
        yt_video_id: v.id,
        title: v.snippet.title,
        published_at: v.snippet.publishedAt,
        duration_seconds: parseISODuration(v.contentDetails.duration),
        views: Number(v.statistics.viewCount ?? 0),
        likes: Number(v.statistics.likeCount ?? 0),
        comments: Number(v.statistics.commentCount ?? 0),
        tags: v.snippet.tags ? JSON.stringify(v.snippet.tags) : null,
      }));

      if (rows.length) {
        await supabase.from("videos").upsert(rows, { onConflict: "yt_video_id" });
      }
    }

    return new Response(JSON.stringify({ ok: true, videos: videoIds.length }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e: any) {
    return new Response(e?.message || "Internal error", { status: 500, headers: corsHeaders });
  }
});


