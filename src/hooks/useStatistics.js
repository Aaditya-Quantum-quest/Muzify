import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsFocused } from "expo-router";

import {
  getDiscoveriesByBucket,
  getFirstListen,
  getGenreListenStats,
  getGenrePlayCounts,
  getHabitBounds,
  getLastListen,
  getLibraryPlayStats,
  getListenMsByBucket,
  getListenMsByDay,
  getListenMsByMonthOfYear,
  getListenMsByWeekdayHour,
  getListenSummary,
  getQualityLibraryStats,
  getQualityListenStats,
  getRepeatPlays,
  getSkipCountsByBucket,
  getTopArtistsByPlayCount,
  getTopListenedArtists,
  getTopListenedSongs,
  getTopSongsByPlayCount,
} from "../databases/queries/listen";
import { subscribeListenChanged } from "../services/listenEvents";

const GENRE_COLORS = ["#e49f33", "#3cc0b8", "#ec6f8e", "#8b6cf0", "#e0803a", "#34c38f"];
const ARTIST_COLORS = [
  "#ec6f8e,#f0a343",
  "#5b3fa0,#2a1a5e",
  "#3a7ca5,#1b3a5c",
  "#d3358f,#4a1a7a",
  "#1f9a9a,#0e3a5a",
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function startOfWeek(date = new Date()) {
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  return monday.getTime();
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

function startOfYear(date = new Date()) {
  return new Date(date.getFullYear(), 0, 1).getTime();
}

function addDays(ts, days) {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

function addMonths(ts, months) {
  const d = new Date(ts);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}

function addYears(ts, years) {
  const d = new Date(ts);
  d.setFullYear(d.getFullYear() + years);
  return d.getTime();
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function msToHours(ms) {
  return Math.round((ms / 3600000) * 10) / 10;
}

function fmtMinutes(m) {
  const minutes = Math.max(0, Math.round(m));
  const h = Math.floor(minutes / 60);
  const min = minutes % 60;
  if (h <= 0) return `${min}m`;
  return `${h}h ${String(min).padStart(2, "0")}m`;
}

function fmtHoursValue(hours) {
  if (!hours) return "0h";
  if (hours < 10) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours)}h`;
}

function pctChange(current, previous) {
  if (!previous && !current) return "0% vs last";
  if (!previous) return "New period";
  const delta = Math.round(((current - previous) / previous) * 100);
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta}% vs last`;
}

function deltaVariant(current, previous) {
  if (!previous) return current > 0 ? "pos" : "info";
  return current >= previous ? "pos" : "neg";
}

function initialsFrom(name) {
  const parts = String(name || "Unknown")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function qualityBucket({ file_format: format, bitrate, bit_depth: bitDepth }) {
  const fmt = String(format || "").toLowerCase();
  const br = Number(bitrate) || 0;
  const depth = Number(bitDepth) || 0;
  if (
    fmt.includes("flac") ||
    fmt.includes("wav") ||
    fmt.includes("alac") ||
    fmt.includes("aiff") ||
    depth >= 16 ||
    br >= 900
  ) {
    return "Lossless";
  }
  if (br >= 256 || fmt.includes("aac") || fmt.includes("m4a")) return "High";
  return "Standard";
}

function fillBuckets(rows, count) {
  const out = Array.from({ length: count }, () => 0);
  for (const row of rows || []) {
    const i = Number(row.bucket);
    if (i >= 0 && i < count) out[i] = Number(row.total) || 0;
  }
  return out;
}

function fillSkipBuckets(rows, count) {
  const out = Array.from({ length: count }, () => 0);
  for (const row of rows || []) {
    const i = Number(row.bucket);
    if (i >= 0 && i < count) out[i] = Number(row.skips) || 0;
  }
  return out;
}

function sundayToMonday(dow) {
  return (Number(dow) + 6) % 7;
}

function formatListenStamp(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today, ${time}`;
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function emptyStats(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const dim = daysInMonth(year, month);

  return {
    range: {
      Week: {
        v: Array(7).fill(0),
        p: Array(7).fill(0),
        l: WEEKDAYS.map((d) => d[0]),
        s: "Hours per day",
        d: "0% vs last",
        avg: "0h",
        longest: "0m",
        skip: "0%",
        variant: "info",
      },
      Month: {
        v: Array(4).fill(0),
        p: Array(4).fill(0),
        l: ["W1", "W2", "W3", "W4"],
        s: "Hours per week",
        d: "0% vs last",
        avg: "0h",
        longest: "0m",
        skip: "0%",
        variant: "info",
      },
      Year: {
        v: Array(12).fill(0),
        p: Array(12).fill(0),
        l: MONTHS,
        s: "Hours per month",
        d: "0% vs last",
        avg: "0h",
        longest: "0m",
        skip: "0%",
        variant: "info",
      },
    },
    dayHours: Array(7).fill(0),
    hourGrid: Array.from({ length: 7 }, () => Array(24).fill(0)),
    discoveries: Array(8).fill(0),
    skips: Array(10).fill(0),
    skipRate: "0%",
    skipNote: "No skips yet",
    genres: [["Unknown", 100, GENRE_COLORS[0], 0]],
    quality: [
      ["Lossless", 0],
      ["High", 0],
      ["Standard", 0],
    ],
    qualityValue: "0%",
    qualityNote: "No plays yet",
    topArtists: [],
    topSongs: [],
    calendar: {
      year,
      month,
      monthLabel: `${MONTH_NAMES[month]} ${year}`,
      daysInMonth: dim,
      offset: (new Date(year, month, 1).getDay() + 6) % 7,
      today,
      minutes: Array(dim + 1).fill(0),
    },
    habits: {
      repeatRate: 0,
      totalPlays: 0,
      neverPlayed: 0,
      firstListen: "—",
      firstTitle: "No plays yet",
      lastListen: "—",
      lastTitle: "No plays yet",
    },
    discoveriesValue: "0",
    discoveriesNote: "No new songs",
  };
}

function loadStatistics() {
  const now = new Date();
  const stats = emptyStats(now);

  try {
    const weekStart = startOfWeek(now);
    const prevWeekStart = addDays(weekStart, -7);
    const monthStart = startOfMonth(now);
    const prevMonthStart = addMonths(monthStart, -1);
    const yearStart = startOfYear(now);
    const prevYearStart = addYears(yearStart, -1);
    const nextWeek = addDays(weekStart, 7);
    const nextMonth = addMonths(monthStart, 1);
    const nextYear = addYears(yearStart, 1);
    const todayStart = startOfLocalDay(now);

    const weekSummary = getListenSummary(weekStart, nextWeek);
    const prevWeekSummary = getListenSummary(prevWeekStart, weekStart);
    const monthSummary = getListenSummary(monthStart, nextMonth);
    const prevMonthSummary = getListenSummary(prevMonthStart, monthStart);
    const yearSummary = getListenSummary(yearStart, nextYear);
    const prevYearSummary = getListenSummary(prevYearStart, yearStart);

    const weekBuckets = fillBuckets(getListenMsByBucket(weekStart, nextWeek, DAY_MS), 7);
    const prevWeekBuckets = fillBuckets(
      getListenMsByBucket(prevWeekStart, weekStart, DAY_MS),
      7,
    );
    const monthBuckets = fillBuckets(
      getListenMsByBucket(monthStart, nextMonth, 7 * DAY_MS),
      4,
    );
    const prevMonthBuckets = fillBuckets(
      getListenMsByBucket(prevMonthStart, monthStart, 7 * DAY_MS),
      4,
    );
    const yearHours = Array(12).fill(0);
    for (const row of getListenMsByMonthOfYear(yearStart, nextYear)) {
      const m = Number(row.month);
      if (m >= 1 && m <= 12) yearHours[m - 1] = msToHours(row.total);
    }
    const prevYearHours = Array(12).fill(0);
    for (const row of getListenMsByMonthOfYear(prevYearStart, yearStart)) {
      const m = Number(row.month);
      if (m >= 1 && m <= 12) prevYearHours[m - 1] = msToHours(row.total);
    }

    const weekHours = weekBuckets.map(msToHours);
    const prevWeekHours = prevWeekBuckets.map(msToHours);
    const monthHours = monthBuckets.map(msToHours);
    const prevMonthHours = prevMonthBuckets.map(msToHours);

    const weekDays = Math.max(1, Math.round((now.getTime() - weekStart) / DAY_MS) + 1);
    const monthDays = Math.max(1, now.getDate());
    const yearDays = Math.max(
      1,
      Math.round((now.getTime() - yearStart) / DAY_MS) + 1,
    );

    const applyRange = (key, current, previous, labels, subtitle, summary, prevSummary, days) => {
      const avgHours = msToHours(summary.total_ms) / days;
      const skipPct =
        summary.plays > 0 ? Math.round((summary.skips / summary.plays) * 1000) / 10 : 0;
      stats.range[key] = {
        v: current,
        p: previous,
        l: labels,
        s: subtitle,
        d: pctChange(summary.total_ms, prevSummary.total_ms),
        avg: fmtHoursValue(avgHours),
        longest: fmtMinutes((summary.longest_ms || 0) / 60000),
        skip: `${skipPct}%`,
        variant: deltaVariant(summary.total_ms, prevSummary.total_ms),
      };
    };

    applyRange(
      "Week",
      weekHours,
      prevWeekHours,
      WEEKDAYS.map((d) => d[0]),
      "Hours per day",
      weekSummary,
      prevWeekSummary,
      weekDays,
    );
    applyRange(
      "Month",
      monthHours,
      prevMonthHours,
      ["W1", "W2", "W3", "W4"],
      "Hours per week",
      monthSummary,
      prevMonthSummary,
      monthDays,
    );
    applyRange(
      "Year",
      yearHours,
      prevYearHours,
      MONTHS,
      "Hours per month",
      yearSummary,
      prevYearSummary,
      yearDays,
    );

    stats.dayHours = weekHours;

    const hourGrid = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const row of getListenMsByWeekdayHour(weekStart, nextWeek)) {
      const day = sundayToMonday(row.dow);
      const hour = Number(row.hour);
      if (day >= 0 && day < 7 && hour >= 0 && hour < 24) {
        hourGrid[day][hour] = Number(row.plays) || 0;
      }
    }
    stats.hourGrid = hourGrid;

    const discFrom = addDays(todayStart, -7);
    stats.discoveries = fillBuckets(
      getDiscoveriesByBucket(discFrom, addDays(todayStart, 1), DAY_MS).map((row) => ({
        bucket: row.bucket,
        total: row.total,
      })),
      8,
    );
    const discTotal = stats.discoveries.reduce((a, b) => a + b, 0);
    stats.discoveriesValue = String(discTotal);
    stats.discoveriesNote = discTotal ? `${discTotal} this week` : "No new songs";

    const skipFrom = addDays(todayStart, -9);
    stats.skips = fillSkipBuckets(
      getSkipCountsByBucket(skipFrom, addDays(todayStart, 1), DAY_MS),
      10,
    );
    const skipTotal = stats.skips.reduce((a, b) => a + b, 0);
    const skipPlays = getListenSummary(skipFrom, addDays(todayStart, 1)).plays;
    const skipPct = skipPlays > 0 ? Math.round((skipTotal / skipPlays) * 1000) / 10 : 0;
    stats.skipRate = `${skipPct}%`;
    stats.skipNote = skipTotal ? `${skipTotal} this week` : "No skips yet";

    const liveGenres = getGenreListenStats(yearStart, nextYear);
    const fallbackGenres = liveGenres.length ? liveGenres : getGenrePlayCounts();
    const genreTotal = fallbackGenres.reduce(
      (sum, row) => sum + (Number(row.plays) || 0),
      0,
    );
    stats.genres = (fallbackGenres.length ? fallbackGenres : [{ genre: "Unknown", plays: 0 }])
      .slice(0, 5)
      .map((row, i) => {
        const plays = Number(row.plays) || 0;
        const pct = genreTotal ? Math.round((plays / genreTotal) * 1000) / 10 : i === 0 ? 100 : 0;
        return [row.genre || "Unknown", pct, GENRE_COLORS[i % GENRE_COLORS.length], plays];
      });

    const liveQuality = getQualityListenStats(yearStart, nextYear);
    const fallbackQuality = liveQuality.length ? liveQuality : getQualityLibraryStats();
    const qualityTotals = { Lossless: 0, High: 0, Standard: 0 };
    let qualityWeight = 0;
    for (const row of fallbackQuality) {
      const weight = Number(row.total_ms || row.songs || row.plays) || 0;
      qualityTotals[qualityBucket(row)] += weight;
      qualityWeight += weight;
    }
    stats.quality = ["Lossless", "High", "Standard"].map((label) => [
      label,
      qualityWeight ? Math.round((qualityTotals[label] / qualityWeight) * 100) : 0,
    ]);
    const highPlus = stats.quality[0][1] + stats.quality[1][1];
    stats.qualityValue = `${highPlus}%`;
    stats.qualityNote = highPlus >= 50 ? "High+" : stats.quality[2][1] ? "Mostly standard" : "No plays yet";

    const liveArtists = getTopListenedArtists(yearStart, nextYear, 5);
    const artists = liveArtists.length ? liveArtists : getTopArtistsByPlayCount(5);
    stats.topArtists = artists.map((row, i) => {
      const hours = row.total_ms
        ? msToHours(row.total_ms)
        : Math.round(((Number(row.duration_sec) || 0) / 3600) * 10) / 10;
      return [row.artist, initialsFrom(row.artist), hours, ARTIST_COLORS[i % ARTIST_COLORS.length]];
    });

    const liveSongs = getTopListenedSongs(yearStart, nextYear, 5);
    const songs = liveSongs.length ? liveSongs : getTopSongsByPlayCount(5);
    stats.topSongs = songs.map((row) => [
      row.title || "Unknown",
      row.artist || "Unknown",
      Number(row.plays) || 0,
    ]);

    const calFrom = startOfMonth(now);
    const calTo = addMonths(calFrom, 1);
    const minutes = Array(stats.calendar.daysInMonth + 1).fill(0);
    for (const row of getListenMsByDay(calFrom, calTo)) {
      const day = Number(String(row.day).slice(-2));
      if (day >= 1 && day <= stats.calendar.daysInMonth) {
        minutes[day] = Math.round((Number(row.total) || 0) / 60000);
      }
    }
    stats.calendar.minutes = minutes;

    const library = getLibraryPlayStats();
    const repeats = getRepeatPlays();
    const firstEvent = getFirstListen();
    const lastEvent = getLastListen();
    const bounds = getHabitBounds();
    const firstTs = firstEvent?.started_at || bounds?.first_played;
    const lastTs = lastEvent?.started_at || bounds?.last_played;
    const firstTitle = firstEvent?.title || "Library";
    const lastTitle = lastEvent?.title || "Library";
    const repeatPct =
      repeats.plays > 0 ? Math.round((repeats.repeats / repeats.plays) * 100) : 0;

    stats.habits = {
      repeatRate: repeatPct,
      totalPlays: Number(library.plays) || 0,
      neverPlayed: Number(library.never_played) || 0,
      firstListen: formatListenStamp(firstTs),
      firstTitle: firstTs ? firstTitle : "No plays yet",
      lastListen: formatListenStamp(lastTs),
      lastTitle: lastTs ? lastTitle : "No plays yet",
    };
  } catch (error) {
    console.warn("[useStatistics] load failed:", error);
  }

  return stats;
}

export function useStatistics() {
  const focused = useIsFocused();
  const [stats, setStats] = useState(() => emptyStats());
  const timerRef = useRef(null);
  const focusedRef = useRef(focused);
  focusedRef.current = focused;

  const refresh = useCallback(() => {
    try {
      setStats(loadStatistics());
    } catch (error) {
      console.warn("[useStatistics] refresh failed:", error);
    }
  }, []);

  useEffect(() => {
    const unsub = subscribeListenChanged(() => {
      if (!focusedRef.current) return;
      if (timerRef.current) return;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        refresh();
      }, 800);
    });
    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [refresh]);

  useEffect(() => {
    if (!focused) return;
    const id = setTimeout(() => refresh(), 0);
    return () => clearTimeout(id);
  }, [focused, refresh]);

  return useMemo(() => ({ ...stats, refresh }), [stats, refresh]);
}

export { fmtMinutes as fmtListenMinutes };
