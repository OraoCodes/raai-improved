"use client";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export default function ConnectManualPage() {
  const [status, setStatus] = useState<string>("Fetching your channel...");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setStatus("No session. Please sign in first.");
        return;
      }

      // Debug: log what we have
      console.log("Full URL:", window.location.href);
      console.log("Hash:", window.location.hash);
      console.log("Session:", session);
      
      // Extract Google access token from URL hash
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const googleToken = hashParams.get("access_token") || 
                         hashParams.get("provider_token") ||
                         (session as any)?.provider_token ||
                         (session as any)?.access_token;

      console.log("Extracted Google token:", googleToken ? "Found" : "Not found");
      console.log("Hash params:", Object.fromEntries(hashParams.entries()));

      if (!googleToken) {
        setError(`No Google access token found. Hash: ${window.location.hash.slice(0, 50)}... Session keys: ${Object.keys(session || {}).join(", ")}`);
        setStatus("Failed - Debug info in error message");
        return;
      }

      try {
        setStatus("Fetching channel data from YouTube...");
        
        // Fetch channel directly from client
        const chRes = await fetch(
          "https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&mine=true",
          { headers: { Authorization: `Bearer ${googleToken}` } }
        );

        if (!chRes.ok) {
          const errText = await chRes.text();
          setError(`YouTube API error: ${errText}`);
          setStatus("Failed");
          return;
        }

        const chJson = await chRes.json();
        const ch = chJson.items?.[0];

        if (!ch) {
          setError("No YouTube channel found for this Google account.");
          setStatus("Failed");
          return;
        }

        setStatus("Saving channel...");
        
        // Save channel to Supabase
        const { data: savedCh } = await supabase
          .from("channels")
          .upsert({
            user_id: session.user.id,
            yt_channel_id: ch.id,
            title: ch.snippet.title,
            country: ch.snippet.country ?? null,
            uploads_playlist_id: ch.contentDetails.relatedPlaylists.uploads,
            subs: Number(ch.statistics.subscriberCount ?? 0),
            views: Number(ch.statistics.viewCount ?? 0),
            last_sync: new Date().toISOString(),
          })
          .select()
          .single();

        if (!savedCh) {
          setError("Failed to save channel");
          return;
        }

        setStatus("Fetching videos...");

        // Fetch videos with pagination
        const uploadsPlaylist = ch.contentDetails.relatedPlaylists.uploads;
        let nextPageToken: string | undefined = undefined;
        const videoIds: string[] = [];
        while (videoIds.length < 500) {
          const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
          url.searchParams.set("part", "contentDetails");
          url.searchParams.set("playlistId", uploadsPlaylist);
          url.searchParams.set("maxResults", "50");
          if (nextPageToken) url.searchParams.set("pageToken", nextPageToken);
          const playlistRes = await fetch(url, { headers: { Authorization: `Bearer ${googleToken}` } });
          const playlistJson = await playlistRes.json();
          for (const it of playlistJson.items || []) {
            videoIds.push(it.contentDetails.videoId);
          }
          nextPageToken = playlistJson.nextPageToken;
          if (!nextPageToken) break;
        }

        if (videoIds.length === 0) {
          setStatus("No videos found. Redirecting...");
          setTimeout(() => window.location.href = "/dashboard", 1000);
          return;
        }

        setStatus(`Fetching details for ${videoIds.length} videos...`);

        // Fetch video details
        const videosRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoIds.join(",")}`,
          { headers: { Authorization: `Bearer ${googleToken}` } }
        );

        const videosJson = await videosRes.json();
        
        const parseISO = (iso: string) => {
          const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
          const [h, mi, s] = [m?.[1] ?? "0", m?.[2] ?? "0", m?.[3] ?? "0"].map(Number);
          return h * 3600 + mi * 60 + s;
        };

        const rows = (videosJson.items || []).map((v: any) => ({
          channel_id: savedCh.id,
          yt_video_id: v.id,
          title: v.snippet.title,
          published_at: v.snippet.publishedAt,
          duration_seconds: parseISO(v.contentDetails.duration),
          views: Number(v.statistics.viewCount ?? 0),
          likes: Number(v.statistics.likeCount ?? 0),
          comments: Number(v.statistics.commentCount ?? 0),
          tags: v.snippet.tags ? v.snippet.tags : null,
        }));

        setStatus("Saving videos...");
        await supabase.from("videos").upsert(rows, { onConflict: "yt_video_id" });

        setStatus("Success! Redirecting...");
        setTimeout(() => window.location.href = "/dashboard", 1000);
      } catch (e: any) {
        setError(e.message);
        setStatus("Failed");
      }
    })();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-md text-center space-y-4">
        <p className="text-lg text-zinc-700 dark:text-zinc-200">{status}</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}

