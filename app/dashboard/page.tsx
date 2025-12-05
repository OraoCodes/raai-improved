"use client";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import ContributionHeatmap from "@/components/ContributionHeatmap";
import VideoTable from "@/components/VideoTable";
import { connectYouTube } from "@/lib/auth";

type VideoRow = {
  id: number;
  title: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  published_at: string;
  duration_seconds: number;
};

export default function DashboardPage() {
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [allVideosForHeatmap, setAllVideosForHeatmap] = useState<{ published_at: string; views: number | null }[]>([]);
  const [insight, setInsight] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [channel, setChannel] = useState<{ id: number; title?: string | null; subs?: number | null; views?: number | null; last_sync?: string | null } | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [videoCount, setVideoCount] = useState<number>(0);
  const [firstUpload, setFirstUpload] = useState<string | null>(null);
  const [lastUpload, setLastUpload] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [loadingVideos, setLoadingVideos] = useState<boolean>(false);
  const videosPerPage = 20;

  const fetchVideos = async (channelId: number, page: number) => {
    setLoadingVideos(true);
    const supabase = getSupabaseBrowserClient();
    const start = (page - 1) * videosPerPage;
    const end = start + videosPerPage - 1;
    
    const { data: vids } = await supabase
      .from("videos")
      .select("id,title,views,likes,comments,published_at,duration_seconds")
      .eq("channel_id", channelId)
      .order("published_at", { ascending: false })
      .range(start, end);
    
    setVideos((vids as VideoRow[]) || []);
    setLoadingVideos(false);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      const supabase = getSupabaseBrowserClient();
      const { data: ch } = await supabase
        .from("channels")
        .select("id,title,subs,views,last_sync")
        .limit(1)
        .maybeSingle();
      if (!ch) {
        setChannel(null);
        setLoading(false);
        return;
      }
      setChannel(ch as any);

      await fetchVideos(ch.id, currentPage);

      // counts and first/last upload dates
      const countRes = await supabase
        .from("videos")
        .select("id", { count: "exact", head: true })
        .eq("channel_id", ch.id);
      setVideoCount(countRes.count ?? 0);

      // Fetch ALL videos for heatmap (only lightweight fields)
      const { data: allVids } = await supabase
        .from("videos")
        .select("published_at,views")
        .eq("channel_id", ch.id)
        .order("published_at", { ascending: false });
      setAllVideosForHeatmap(allVids || []);

      const { data: first } = await supabase
        .from("videos")
        .select("published_at")
        .eq("channel_id", ch.id)
        .order("published_at", { ascending: true })
        .limit(1);
      setFirstUpload(first && first[0]?.published_at ? first[0].published_at : null);

      const { data: last } = await supabase
        .from("videos")
        .select("published_at")
        .eq("channel_id", ch.id)
        .order("published_at", { ascending: false })
        .limit(1);
      setLastUpload(last && last[0]?.published_at ? last[0].published_at : null);

      const { data: latest } = await supabase
        .from("insights")
        .select("summary,generated_at")
        .eq("channel_id", ch.id)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latest) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-insights`, {
            method: "POST",
            headers: { Authorization: `Bearer ${session.access_token}` },
          })
            .then((r) => r.json())
            .then((j) => setInsight(j.summary ?? ""));
        }
      } else {
        setInsight(latest.summary as string);
      }
      setLoading(false);
    })();
  }, []);

  async function refreshData() {
    setRefreshing(true);
    const supabase = getSupabaseBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const provider_token = (session as any)?.provider_token || undefined;
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-channel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ provider_token, maxVideos: 200 })
      });
      if (!res.ok) {
        alert("Sync failed (no access token). Please click Connect my Channel again to refresh permissions.");
        setRefreshing(false);
        return;
      }
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-insights`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).then((r)=>r.json()).then((j)=> setInsight(j.summary ?? insight));
    } else {
      return setRefreshing(false);
    }
    // Re-query videos and counts
    const ch = channel;
    if (ch) {
      await fetchVideos(ch.id, currentPage);
      
      const countRes = await supabase
        .from("videos")
        .select("id", { count: "exact", head: true })
        .eq("channel_id", ch.id);
      setVideoCount(countRes.count ?? 0);

      // Refresh heatmap data
      const { data: allVids } = await supabase
        .from("videos")
        .select("published_at,views")
        .eq("channel_id", ch.id)
        .order("published_at", { ascending: false });
      setAllVideosForHeatmap(allVids || []);
    }
    setRefreshing(false);
  }

  if (loading) {
    return <div className="p-6">Loading…</div>;
  }

  if (!channel) {
    return (
      <div className="p-6 space-y-6">
        <h2 className="text-2xl font-heading font-semibold">Smart Posting Dashboard</h2>
        <div className="rounded border p-6">
          <h3 className="font-heading font-medium mb-2">Connect your YouTube channel</h3>
          <p className="text-sm text-gray-600 mb-4">You haven't connected a channel yet. Connect to sync your videos and generate insights.</p>
          <button onClick={connectYouTube} className="px-4 py-2 rounded bg-black text-white font-medium">Connect my Channel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-heading font-semibold">Smart Posting Dashboard</h2>

      {channel && (
        <div className="rounded border p-4 flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">Channel</div>
            <div className="font-medium">{channel.title || "My Channel"}</div>
            <div className="text-sm text-gray-600 mt-1">
              <span className="font-metric">{(channel.subs ?? 0).toLocaleString()}</span> subs • <span className="font-metric">{(channel.views ?? 0).toLocaleString()}</span> total views • <span className="font-metric">{videoCount}</span> videos
            </div>
            {(firstUpload || lastUpload) && (
              <div className="text-xs text-gray-500 mt-1">
                {firstUpload ? `First upload: ${new Date(firstUpload).toLocaleDateString()}` : null}
                {firstUpload && lastUpload ? " • " : null}
                {lastUpload ? `Latest upload: ${new Date(lastUpload).toLocaleDateString()}` : null}
              </div>
            )}
            {channel.last_sync && (
              <div className="text-xs text-gray-500 mt-1">Last sync: {new Date(channel.last_sync).toLocaleString()}</div>
            )}
          </div>
          <button onClick={refreshData} disabled={refreshing} className="px-3 py-2 rounded bg-black text-white font-medium disabled:opacity-50">
            {refreshing ? "Refreshing…" : "Refresh now"}
          </button>
        </div>
      )}

      <div className="rounded border p-4">
        <h3 className="font-heading font-medium mb-2">AI Insights</h3>
        <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">
          {loading && !insight ? "Loading…" : insight || "No insight yet."}
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={async () => {
              const supabase = getSupabaseBrowserClient();
              const { data: { session } } = await supabase.auth.getSession();
              if (!session) return;
              await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-insights`, {
                method: "POST",
                headers: { Authorization: `Bearer ${session.access_token}` },
              })
                .then((r) => r.json())
                .then((j) => setInsight(j.summary ?? ""));
            }}
            className="px-3 py-1 rounded border font-medium"
          >
            Regenerate
          </button>
          <button
            onClick={async () => {
              const supabase = getSupabaseBrowserClient();
              const ch = channel;
              if (!ch) return;
              await supabase.from("insight_feedback").insert({ user_id: (await supabase.auth.getUser()).data.user?.id, channel_id: ch.id, helpful: true });
            }}
            className="px-3 py-1 rounded border font-medium"
          >
            👍 Helpful
          </button>
          <button
            onClick={async () => {
              const supabase = getSupabaseBrowserClient();
              const ch = channel;
              if (!ch) return;
              await supabase.from("insight_feedback").insert({ user_id: (await supabase.auth.getUser()).data.user?.id, channel_id: ch.id, helpful: false });
            }}
            className="px-3 py-1 rounded border font-medium"
          >
            👎 Not Helpful
          </button>
        </div>
      </div>

      <div className="rounded border p-4">
        <h3 className="font-heading font-medium mb-4">Publishing Activity</h3>
        <ContributionHeatmap videos={allVideosForHeatmap} />
      </div>

      <div className="rounded border p-4">
        <h3 className="font-heading font-medium mb-4">Videos</h3>
        <VideoTable
          videos={videos}
          totalCount={videoCount}
          currentPage={currentPage}
          onPageChange={async (page) => {
            setCurrentPage(page);
            if (channel) await fetchVideos(channel.id, page);
          }}
          videosPerPage={videosPerPage}
          loading={loadingVideos}
        />
      </div>
    </div>
  );
}


