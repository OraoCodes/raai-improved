export function topPostingWindows(
  videos: { published_at: string; views: number | null }[],
  tz?: string
) {
  const timeZone = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fmt = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    hour12: false,
    timeZone,
  });
  const buckets = new Map<string, { sum: number; n: number }>();
  for (const v of videos) {
    const parts = fmt.formatToParts(new Date(v.published_at));
    const day = parts.find((p) => p.type === "weekday")!.value;
    const hour = (parts.find((p) => p.type === "hour")!.value || "0").toString().padStart(2, "0");
    const key = `${day} ${hour}:00`;
    const cur = buckets.get(key) || { sum: 0, n: 0 };
    cur.sum += v.views ?? 0;
    cur.n += 1;
    buckets.set(key, cur);
  }
  const vals = Array.from(buckets.values());
  const totalSum = vals.reduce((a, b) => a + b.sum, 0);
  const totalN = vals.reduce((a, b) => a + b.n, 0) || 1;
  const globalMean = totalSum / totalN;
  const prior = 10;
  const scored = Array.from(buckets.entries()).map(([k, v]) => ({
    k,
    score: (v.sum + prior * globalMean) / (v.n + prior),
  }));
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.k);
}


