"use client";
import React, { useState, useMemo } from "react";

type Video = {
  id: number;
  yt_video_id: string;
  title: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  published_at: string;
  duration_seconds: number;
};

type Comment = {
  id: string;
  author: string;
  authorProfileImage: string;
  text: string;
  likeCount: number;
  publishedAt: string;
  replyCount: number;
};

type Props = {
  videos: Video[];
  totalCount: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  videosPerPage: number;
  loading?: boolean;
};

type SortField = "title" | "views" | "published_at" | "duration_seconds" | "engagement";
type SortOrder = "asc" | "desc";
type TabFilter = "all" | "top" | "recent" | "needsAttention";

export default function VideoTable({ videos, totalCount, currentPage, onPageChange, videosPerPage, loading }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("published_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [activeTab, setActiveTab] = useState<TabFilter>("all");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [minViews, setMinViews] = useState<string>("");
  const [maxViews, setMaxViews] = useState<string>("");
  const [durationFilter, setDurationFilter] = useState<string>("all");
  const [videoComments, setVideoComments] = useState<Map<string, Comment[]>>(new Map());
  const [loadingComments, setLoadingComments] = useState<Map<string, boolean>>(new Map());
  const [showComments, setShowComments] = useState<Set<string>>(new Set());

  // Calculate engagement rate
  const getEngagementRate = (video: Video) => {
    if (!video.views || video.views === 0) return 0;
    const engagements = (video.likes || 0) + (video.comments || 0);
    return (engagements / video.views) * 100;
  };

  // Get performance indicator
  const getPerformanceIndicator = (video: Video) => {
    const views = video.views || 0;
    if (views >= 10000) return { icon: "🔥", label: "High" };
    if (views >= 1000) return { icon: "✨", label: "Good" };
    if (views < 500) return { icon: "📉", label: "Low" };
    return { icon: "📊", label: "Average" };
  };

  // Filter videos based on search and filters
  const filteredVideos = useMemo(() => {
    let filtered = [...videos];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter((v) =>
        v.title.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Views filter
    if (minViews) {
      const min = parseInt(minViews);
      filtered = filtered.filter((v) => (v.views || 0) >= min);
    }
    if (maxViews) {
      const max = parseInt(maxViews);
      filtered = filtered.filter((v) => (v.views || 0) <= max);
    }

    // Duration filter
    if (durationFilter !== "all") {
      filtered = filtered.filter((v) => {
        const mins = v.duration_seconds / 60;
        if (durationFilter === "short") return mins < 5;
        if (durationFilter === "medium") return mins >= 5 && mins <= 15;
        if (durationFilter === "long") return mins > 15;
        return true;
      });
    }

    // Tab filter
    if (activeTab === "top") {
      filtered = filtered.filter((v) => (v.views || 0) >= 5000);
    } else if (activeTab === "recent") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      filtered = filtered.filter((v) => new Date(v.published_at) >= thirtyDaysAgo);
    } else if (activeTab === "needsAttention") {
      filtered = filtered.filter((v) => (v.views || 0) < 500);
    }

    return filtered;
  }, [videos, searchQuery, minViews, maxViews, durationFilter, activeTab]);

  // Sort videos
  const sortedVideos = useMemo(() => {
    const sorted = [...filteredVideos];
    sorted.sort((a, b) => {
      let aVal: any, bVal: any;

      if (sortField === "engagement") {
        aVal = getEngagementRate(a);
        bVal = getEngagementRate(b);
      } else if (sortField === "published_at") {
        aVal = new Date(a.published_at).getTime();
        bVal = new Date(b.published_at).getTime();
      } else {
        aVal = a[sortField] || 0;
        bVal = b[sortField] || 0;
      }

      if (sortOrder === "asc") {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    return sorted;
  }, [filteredVideos, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const toggleRowExpansion = (id: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const fetchComments = async (ytVideoId: string) => {
    // Toggle show comments
    const newShowComments = new Set(showComments);
    if (newShowComments.has(ytVideoId)) {
      newShowComments.delete(ytVideoId);
      setShowComments(newShowComments);
      return;
    }

    // If already fetched, just show them
    if (videoComments.has(ytVideoId)) {
      newShowComments.add(ytVideoId);
      setShowComments(newShowComments);
      return;
    }

    // Fetch comments
    setLoadingComments(new Map(loadingComments.set(ytVideoId, true)));
    
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/fetch-comments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await getSessionToken()}`,
          },
          body: JSON.stringify({ videoId: ytVideoId, maxResults: 10 }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setVideoComments(new Map(videoComments.set(ytVideoId, data.comments || [])));
        newShowComments.add(ytVideoId);
        setShowComments(newShowComments);
      }
    } catch (error) {
      console.error("Failed to fetch comments:", error);
    } finally {
      setLoadingComments(new Map(loadingComments.set(ytVideoId, false)));
    }
  };

  const getSessionToken = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || "";
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="text-gray-400">↕</span>;
    return sortOrder === "asc" ? <span>↑</span> : <span>↓</span>;
  };

  // Tab counts
  const tabCounts = useMemo(() => {
    return {
      all: videos.length,
      top: videos.filter((v) => (v.views || 0) >= 5000).length,
      recent: videos.filter((v) => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return new Date(v.published_at) >= thirtyDaysAgo;
      }).length,
      needsAttention: videos.filter((v) => (v.views || 0) < 500).length,
    };
  }, [videos]);

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search videos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={durationFilter}
            onChange={(e) => setDurationFilter(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-black"
          >
            <option value="all">All durations</option>
            <option value="short">&lt; 5 min</option>
            <option value="medium">5-15 min</option>
            <option value="long">&gt; 15 min</option>
          </select>
          <input
            type="number"
            placeholder="Min views"
            value={minViews}
            onChange={(e) => setMinViews(e.target.value)}
            className="w-24 px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
          <input
            type="number"
            placeholder="Max views"
            value={maxViews}
            onChange={(e) => setMaxViews(e.target.value)}
            className="w-24 px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setActiveTab("all")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "all"
              ? "border-black text-black"
              : "border-transparent text-gray-600 hover:text-gray-900"
          }`}
        >
          All <span className="font-metric ml-1">{tabCounts.all}</span>
        </button>
        <button
          onClick={() => setActiveTab("top")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "top"
              ? "border-black text-black"
              : "border-transparent text-gray-600 hover:text-gray-900"
          }`}
        >
          Top Performers <span className="font-metric ml-1">{tabCounts.top}</span>
        </button>
        <button
          onClick={() => setActiveTab("recent")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "recent"
              ? "border-black text-black"
              : "border-transparent text-gray-600 hover:text-gray-900"
          }`}
        >
          Recent <span className="font-metric ml-1">{tabCounts.recent}</span>
        </button>
        <button
          onClick={() => setActiveTab("needsAttention")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "needsAttention"
              ? "border-black text-black"
              : "border-transparent text-gray-600 hover:text-gray-900"
          }`}
        >
          Needs Attention <span className="font-metric ml-1">{tabCounts.needsAttention}</span>
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="w-8 px-4 py-3"></th>
              <th
                onClick={() => handleSort("title")}
                className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                Title <SortIcon field="title" />
              </th>
              <th
                onClick={() => handleSort("published_at")}
                className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                Published <SortIcon field="published_at" />
              </th>
              <th
                onClick={() => handleSort("views")}
                className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                Views <SortIcon field="views" />
              </th>
              <th
                onClick={() => handleSort("duration_seconds")}
                className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                Duration <SortIcon field="duration_seconds" />
              </th>
              <th
                onClick={() => handleSort("engagement")}
                className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                Engagement <SortIcon field="engagement" />
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  Loading videos...
                </td>
              </tr>
            ) : sortedVideos.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No videos found matching your filters
                </td>
              </tr>
            ) : (
              sortedVideos.map((video) => {
                const performance = getPerformanceIndicator(video);
                const engagement = getEngagementRate(video);
                const isExpanded = expandedRows.has(video.id);

                return (
                  <React.Fragment key={video.id}>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleRowExpansion(video.id)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          {isExpanded ? "▼" : "▶"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{performance.icon}</span>
                          <span className="line-clamp-2">{video.title}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {formatDate(video.published_at)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-metric">
                        {(video.views || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-metric">
                        {formatDuration(video.duration_seconds)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-metric">
                        {engagement.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            performance.label === "High"
                              ? "bg-green-100 text-green-800"
                              : performance.label === "Good"
                              ? "bg-blue-100 text-blue-800"
                              : performance.label === "Low"
                              ? "bg-red-100 text-red-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {performance.label}
                        </span>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-gray-50">
                        <td colSpan={7} className="px-4 py-4">
                          <div className="space-y-4">
                            {/* Metrics Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <div className="text-gray-600 text-xs uppercase mb-1">Likes</div>
                                <div className="font-metric font-medium">
                                  {(video.likes || 0).toLocaleString()}
                                </div>
                              </div>
                              <div>
                                <div className="text-gray-600 text-xs uppercase mb-1">Comments</div>
                                <div className="font-metric font-medium">
                                  {(video.comments || 0).toLocaleString()}
                                </div>
                              </div>
                              <div>
                                <div className="text-gray-600 text-xs uppercase mb-1">Like Rate</div>
                                <div className="font-metric font-medium">
                                  {video.views ? ((video.likes || 0) / video.views * 100).toFixed(2) : 0}%
                                </div>
                              </div>
                              <div>
                                <div className="text-gray-600 text-xs uppercase mb-1">Comment Rate</div>
                                <div className="font-metric font-medium">
                                  {video.views ? ((video.comments || 0) / video.views * 100).toFixed(2) : 0}%
                                </div>
                              </div>
                            </div>

                            {/* Comments Section */}
                            <div className="border-t pt-4">
                              <button
                                onClick={() => fetchComments(video.yt_video_id)}
                                disabled={loadingComments.get(video.yt_video_id) || false}
                                className="px-3 py-1.5 rounded border border-gray-300 font-medium text-sm hover:bg-white hover:border-gray-400 transition-colors disabled:opacity-50"
                              >
                                {loadingComments.get(video.yt_video_id)
                                  ? "Loading comments..."
                                  : showComments.has(video.yt_video_id)
                                  ? "Hide Comments"
                                  : "See Comments"}
                              </button>

                              {showComments.has(video.yt_video_id) && (
                                <div className="mt-4 space-y-3">
                                  {videoComments.get(video.yt_video_id)?.length === 0 ? (
                                    <div className="text-sm text-gray-500 italic">No comments</div>
                                  ) : (
                                    videoComments.get(video.yt_video_id)?.map((comment) => (
                                      <div key={comment.id} className="flex gap-3 pb-3 border-b last:border-0">
                                        <img
                                          src={comment.authorProfileImage}
                                          alt={comment.author}
                                          className="w-8 h-8 rounded-full"
                                        />
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 mb-1">
                                            <span className="font-medium text-sm">{comment.author}</span>
                                            <span className="text-xs text-gray-500">
                                              {new Date(comment.publishedAt).toLocaleDateString()}
                                            </span>
                                          </div>
                                          <div
                                            className="text-sm text-gray-700 mb-1"
                                            dangerouslySetInnerHTML={{ __html: comment.text }}
                                          />
                                          <div className="flex items-center gap-3 text-xs text-gray-500">
                                            <span className="font-metric">
                                              👍 {comment.likeCount.toLocaleString()}
                                            </span>
                                            {comment.replyCount > 0 && (
                                              <span className="font-metric">
                                                💬 {comment.replyCount} {comment.replyCount === 1 ? "reply" : "replies"}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalCount > videosPerPage && (
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-gray-600">
            Showing <span className="font-metric">{((currentPage - 1) * videosPerPage) + 1}</span>–<span className="font-metric">{Math.min(currentPage * videosPerPage, totalCount)}</span> of <span className="font-metric">{totalCount}</span> videos
            {(searchQuery || minViews || maxViews || durationFilter !== "all" || activeTab !== "all") && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setMinViews("");
                  setMaxViews("");
                  setDurationFilter("all");
                  setActiveTab("all");
                }}
                className="ml-2 text-blue-600 hover:underline text-xs"
              >
                Clear filters
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1 || loading}
              className="px-3 py-1 rounded border border-gray-300 font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 hover:border-gray-400"
            >
              Previous
            </button>
            <div className="flex items-center px-3 text-sm">
              Page <span className="font-metric mx-1">{currentPage}</span> of <span className="font-metric ml-1">{Math.ceil(totalCount / videosPerPage)}</span>
            </div>
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= Math.ceil(totalCount / videosPerPage) || loading}
              className="px-3 py-1 rounded border border-gray-300 font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 hover:border-gray-400"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

