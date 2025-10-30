"use client";
import React from "react";
import { topPostingWindows } from "@/utils/postingWindows";

type Props = {
  videos: { published_at: string; views: number | null }[];
};

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hours = Array.from({ length: 24 }, (_, i) => i);

export default function Heatmap({ videos }: Props) {
  // Aggregate views per day/hour
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fmt = new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", hour12: false, timeZone: tz });
  const bucket = new Map<string, number>();
  for (const v of videos) {
    const parts = fmt.formatToParts(new Date(v.published_at));
    const day = parts.find((p) => p.type === "weekday")!.value;
    const hour = Number(parts.find((p) => p.type === "hour")!.value);
    const key = `${day}-${hour}`;
    bucket.set(key, (bucket.get(key) || 0) + (v.views ?? 0));
  }
  const max = Math.max(1, ...Array.from(bucket.values()));
  const top = topPostingWindows(videos, tz);

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-600">Top windows: {top.join(", ") || "N/A"}</div>
      <div className="overflow-x-auto">
        <div className="grid" style={{ gridTemplateColumns: `80px repeat(24, minmax(20px, 1fr))` }}>
          <div />
          {hours.map((h) => (
            <div key={h} className="text-[10px] text-center text-gray-500">{h}</div>
          ))}
          {days.map((d) => (
            <React.Fragment key={d}>
              <div className="text-xs text-gray-600 flex items-center">{d}</div>
              {hours.map((h) => {
                const val = bucket.get(`${d}-${h}`) || 0;
                const intensity = Math.round((val / max) * 100);
                return (
                  <div
                    key={`${d}-${h}`}
                    title={`${d} ${String(h).padStart(2, "0")}:00 → ${val} views`}
                    className="h-5 rounded-sm"
                    style={{ backgroundColor: `rgba(0,0,0,${0.05 + 0.55 * (intensity / 100)})` }}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}


