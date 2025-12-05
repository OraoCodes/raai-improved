"use client";
import React, { useState, useMemo } from "react";

type Video = {
  published_at: string;
  views: number | null;
};

type Props = {
  videos: Video[];
};

type DayData = {
  date: Date;
  count: number;
  videos: Video[];
  isEmpty: boolean;
};

export default function ContributionHeatmap({ videos }: Props) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  // Get available years from video data
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    videos.forEach((v) => {
      years.add(new Date(v.published_at).getFullYear());
    });
    return Array.from(years).sort((a, b) => b - a); // Descending order
  }, [videos]);

  // Generate calendar data for selected year
  const calendarData = useMemo(() => {
    const startDate = new Date(selectedYear, 0, 1); // Jan 1
    const endDate = new Date(selectedYear, 11, 31); // Dec 31
    
    // Adjust to start from Sunday of the week containing Jan 1
    const startDay = startDate.getDay();
    const adjustedStart = new Date(startDate);
    adjustedStart.setDate(startDate.getDate() - startDay);
    
    // Adjust to end on Saturday of the week containing Dec 31
    const endDay = endDate.getDay();
    const adjustedEnd = new Date(endDate);
    adjustedEnd.setDate(endDate.getDate() + (6 - endDay));
    
    // Create a map of date string to video count
    const dateMap = new Map<string, { count: number; videos: Video[] }>();
    videos.forEach((v) => {
      const date = new Date(v.published_at);
      if (date.getFullYear() === selectedYear) {
        const dateStr = date.toISOString().split("T")[0];
        if (!dateMap.has(dateStr)) {
          dateMap.set(dateStr, { count: 0, videos: [] });
        }
        const entry = dateMap.get(dateStr)!;
        entry.count++;
        entry.videos.push(v);
      }
    });
    
    // Generate all days
    const days: DayData[] = [];
    const current = new Date(adjustedStart);
    
    while (current <= adjustedEnd) {
      const dateStr = current.toISOString().split("T")[0];
      const data = dateMap.get(dateStr);
      const isInYear = current.getFullYear() === selectedYear;
      
      days.push({
        date: new Date(current),
        count: data?.count || 0,
        videos: data?.videos || [],
        isEmpty: !isInYear,
      });
      
      current.setDate(current.getDate() + 1);
    }
    
    return days;
  }, [videos, selectedYear]);

  // Group days into weeks
  const weeks = useMemo(() => {
    const weeksArray: DayData[][] = [];
    for (let i = 0; i < calendarData.length; i += 7) {
      weeksArray.push(calendarData.slice(i, i + 7));
    }
    return weeksArray;
  }, [calendarData]);

  // Calculate total contributions for the year
  const totalContributions = useMemo(() => {
    return calendarData.reduce((sum, day) => sum + day.count, 0);
  }, [calendarData]);

  // Get color intensity based on count
  const getColor = (count: number, isEmpty: boolean) => {
    if (isEmpty) return "bg-transparent";
    if (count === 0) return "bg-gray-100 dark:bg-gray-800";
    if (count === 1) return "bg-green-200 dark:bg-green-900";
    if (count === 2) return "bg-green-300 dark:bg-green-800";
    if (count === 3) return "bg-green-400 dark:bg-green-700";
    return "bg-green-500 dark:bg-green-600";
  };

  // Get month labels for the year
  const monthLabels = useMemo(() => {
    const labels: { month: string; weekIndex: number }[] = [];
    let lastMonth = -1;
    
    weeks.forEach((week, weekIndex) => {
      const firstDayOfWeek = week[0];
      if (!firstDayOfWeek.isEmpty) {
        const month = firstDayOfWeek.date.getMonth();
        if (month !== lastMonth) {
          labels.push({
            month: firstDayOfWeek.date.toLocaleDateString("en-US", { month: "short" }),
            weekIndex,
          });
          lastMonth = month;
        }
      }
    });
    
    return labels;
  }, [weeks]);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", { 
      weekday: "short", 
      year: "numeric", 
      month: "short", 
      day: "numeric" 
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-700 dark:text-gray-300">
          <span className="font-metric font-medium">{totalContributions}</span> videos published in {selectedYear}
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Month labels */}
          <div className="flex mb-1" style={{ marginLeft: "28px" }}>
            {monthLabels.map((label, idx) => (
              <div
                key={idx}
                className="text-xs text-gray-600 dark:text-gray-400"
                style={{ 
                  position: "absolute",
                  left: `${28 + label.weekIndex * 13}px`,
                }}
              >
                {label.month}
              </div>
            ))}
          </div>

          {/* Calendar */}
          <div className="flex mt-6">
            {/* Day labels */}
            <div className="flex flex-col justify-between text-xs text-gray-600 dark:text-gray-400 mr-2 pr-2" style={{ height: "91px" }}>
              <div>Mon</div>
              <div>Wed</div>
              <div>Fri</div>
            </div>

            {/* Weeks grid */}
            <div className="flex gap-[3px]">
              {weeks.map((week, weekIdx) => (
                <div key={weekIdx} className="flex flex-col gap-[3px]">
                  {week.map((day, dayIdx) => (
                    <div
                      key={dayIdx}
                      className={`w-[10px] h-[10px] rounded-sm ${getColor(day.count, day.isEmpty)} hover:ring-2 hover:ring-gray-400 cursor-pointer transition-all`}
                      title={
                        day.isEmpty
                          ? ""
                          : day.count === 0
                          ? `No videos on ${formatDate(day.date)}`
                          : `${day.count} video${day.count > 1 ? "s" : ""} published on ${formatDate(day.date)}`
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
              <span>Less</span>
              <div className="w-[10px] h-[10px] bg-gray-100 dark:bg-gray-800 rounded-sm" />
              <div className="w-[10px] h-[10px] bg-green-200 dark:bg-green-900 rounded-sm" />
              <div className="w-[10px] h-[10px] bg-green-300 dark:bg-green-800 rounded-sm" />
              <div className="w-[10px] h-[10px] bg-green-400 dark:bg-green-700 rounded-sm" />
              <div className="w-[10px] h-[10px] bg-green-500 dark:bg-green-600 rounded-sm" />
              <span>More</span>
            </div>

            {/* Year selector */}
            <div className="flex gap-2">
              {availableYears.map((year) => (
                <button
                  key={year}
                  onClick={() => setSelectedYear(year)}
                  className={`px-3 py-1 text-sm rounded font-medium transition-colors ${
                    year === selectedYear
                      ? "bg-black text-white dark:bg-white dark:text-black"
                      : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Contribution settings link */}
      <div className="text-right">
        <button className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
          Publishing insights →
        </button>
      </div>
    </div>
  );
}

