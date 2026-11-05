import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Svg, {
  Path,
  Circle,
  Line,
  Rect,
  Text as SvgText,
  Defs,
  LinearGradient as SvgGradient,
  Stop,
} from "react-native-svg";

import MusicHeader from "../../components/subComponents/MusicHeader";
import { HEADER_CONTENT } from "../../constants/headerContent";
import { useHideTabBarOnScroll } from "../../components/ui/BottomBar";

/* ───────────── constants ───────────── */

const AM = "#e49f33";
const PK = "#ec6f8e";
const VI = "#8b6cf0";
const TL = "#3cc0b8";
const OR = "#e0803a";
const GR = "#34c38f";

const RANGES = ["Week", "Month", "Year"];
const DN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/* ───────────── layout (same as Settings) ───────────── */
const BOTTOM_PAD = 130;
const TABLET_MIN = 768;
const TABLET_MAX_W = 840;
const CARD_MB = 12;

const MONO = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

function useLayout() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isTablet = width >= TABLET_MIN;

  return {
    insets,
    isTablet,
    padX: Math.max(20, insets.left, insets.right),
    maxW: isTablet ? TABLET_MAX_W : undefined,
  };
}

const rnd = (i) => {
  const x = Math.sin(i * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

const fmt = (m) =>
  `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, "0")}m`;

const hr12 = (h) => `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;

// measures the real width of a container so SVG charts can fill it
const useWidth = () => {
  const [w, setW] = useState(0);
  const onLayout = useCallback(
    (e) => setW(Math.round(e.nativeEvent.layout.width)),
    [],
  );
  return [w, onLayout];
};

// smooth bezier line through values
const smoothPath = (v, x, y) => {
  let d = `M${x(0)},${y(v[0])}`;
  for (let i = 1; i < v.length; i++) {
    const c = (x(i - 1) + x(i)) / 2;
    d += `C${c},${y(v[i - 1])} ${c},${y(v[i])} ${x(i)},${y(v[i])}`;
  }
  return d;
};

/* ───────────── listening data ───────────── */

// plays per hour, per weekday
const H = DN.map((_, d) =>
  Array.from({ length: 24 }, (_, h) => {
    const g = (c, w, a) => a * Math.exp(-((h - c) ** 2) / (2 * w * w));

    let v =
      d > 4
        ? g(11, 2.4, 18) + g(15, 2, 12) + g(21, 2.2, 28)
        : g(8, 1.5, 20) + g(13, 2, 9) + g(20.5, 2, 30) + g(23, 1.2, 8);

    v *= 0.75 + rnd(d * 24 + h) * 0.5;
    if (h < 5) v *= 0.25;

    return Math.round(v);
  }),
);

const dayMin = H.map((r) => r.reduce((a, b) => a + b, 0));
const dayHours = dayMin.map((m) => m / 60);
const prevDayHours = dayHours.map((h, i) => h * (0.84 + rnd(i + 40) * 0.12));

const RANGE_DATA = {
  Week: {
    v: dayHours,
    p: prevDayHours,
    l: DN.map((d) => d[0]),
    s: "Hours per day",
    d: "+12% vs last week",
    avg: "3.7h",
    longest: "2h 14m",
    skip: "8.4%",
  },
  Month: {
    v: [31.2, 28.4, 35.9, dayHours.reduce((a, b) => a + b, 0)],
    p: [27, 26.5, 30.2, 31],
    l: ["W1", "W2", "W3", "W4"],
    s: "Hours per week",
    d: "+8% vs last month",
    avg: "4.6h",
    longest: "3h 02m",
    skip: "7.9%",
  },
  Year: {
    v: [88, 102, 95, 121, 134, 118, 126, 141, 129, 150, 138, 146],
    p: [70, 80, 84, 92, 101, 99, 104, 112, 108, 121, 119, 124],
    l: ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"],
    s: "Hours per month",
    d: "+19% vs last year",
    avg: "3.9h",
    longest: "3h 41m",
    skip: "8.1%",
  },
};

/* ───────────── other data ───────────── */

const TOP_ARTISTS = [
  ["Kai Rivers", "KR", 11.4, "#ec6f8e,#f0a343"],
  ["Luna Vale", "LV", 9.8, "#5b3fa0,#2a1a5e"],
  ["Neon Harbor", "NH", 8.1, "#3a7ca5,#1b3a5c"],
  ["Aarav Mehta", "AM", 6.7, "#d3358f,#4a1a7a"],
  ["Zara Quinn", "ZQ", 4.2, "#1f9a9a,#0e3a5a"],
];

const TOP_SONGS = [
  ["Neon Night Drive", "Kai Rivers", 86],
  ["Chill Sunset", "Aarav Mehta", 74],
  ["Golden Hour", "Luna Vale", 61],
  ["Synthwave Dreams", "Neon Harbor", 55],
  ["Rainy Day", "Mira Okafor", 42],
];

// [label, percent, color, plays]
const GEN = [
  ["Pop", 34, AM, 436],
  ["Lo-fi", 24, TL, 308],
  ["Synthwave", 18, PK, 231],
  ["Acoustic", 14, VI, 180],
  ["Jazz", 10, OR, 129],
];

const AUD = [
  ["Lossless", 16],
  ["High", 54],
  ["Standard", 30],
];

const DISCOVERIES = [2, 5, 3, 7, 4, 9, 6, 11];
const SKIPS = [6, 8, 5, 9, 14, 8, 7, 12, 6, 8];

const TODAY = 23;

const calendarValue = (d) => {
  if (d > TODAY) return 0;
  if (d === TODAY) return dayMin[4];
  if (rnd(d * 3.7) < 0.2) return 0;

  return Math.round(35 + rnd(d * 9.1) * 250);
};

/* ───────────── page building blocks ───────────── */

function Frame({ layout, className = "", children }) {
  return (
    <View
      className={`w-full self-center ${className}`}
      style={{ maxWidth: layout.maxW, paddingHorizontal: layout.padX }}
    >
      {children}
    </View>
  );
}

function Chips({ items, active, onChange, padX }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="mt-7 grow-0"
      style={{ marginHorizontal: -padX }}
      contentContainerStyle={{ paddingHorizontal: padX, gap: 8 }}
    >
      {items.map((c, i) => (
        <TouchableOpacity
          key={c}
          onPress={() => onChange(i)}
          activeOpacity={0.75}
          className={`h-10 items-center justify-center rounded-full px-5 ${
            active === i ? "bg-amber-400" : ""
          }`}
          style={active === i ? null : { backgroundColor: "#1b1922" }}
        >
          <Text
            textTransform="capitalize"
            className="text-sm font-medium"
            style={{ color: active === i ? "#2a1500" : "#c4c4cc" }}
          >
            {c}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

/* ───────────── card shell + header ───────────── */

function Card({ children, style }) {
  return (
    <View
      className="overflow-hidden rounded-3xl border border-[#23212c] bg-[#13121a] p-4"
      style={[{ marginBottom: CARD_MB }, style]}
    >
      {/* soft top highlight line */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 24,
          right: 24,
          height: 1,
          backgroundColor: "rgba(228,159,51,0.35)",
        }}
      />
      {children}
    </View>
  );
}

const PILL = {
  pos: { c: "#34d399", bg: "rgba(16,185,129,0.10)", bd: "rgba(16,185,129,0.25)" },
  info: { c: "#22d3ee", bg: "rgba(6,182,212,0.10)", bd: "rgba(6,182,212,0.25)" },
  pur: { c: "#a78bfa", bg: "rgba(139,92,246,0.10)", bd: "rgba(139,92,246,0.25)" },
  neg: { c: "#fb7185", bg: "rgba(244,63,94,0.10)", bd: "rgba(244,63,94,0.25)" },
};

function Pill({ text, variant = "pos", style }) {
  const p = PILL[variant];

  return (
    <View
      style={[
        {
          alignSelf: "flex-start",
          marginTop: 4,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: p.bd,
          backgroundColor: p.bg,
          paddingHorizontal: 8,
          paddingVertical: 2,
        },
        style,
      ]}
    >
      <Text
        textTransform="capitalize"
        numberOfLines={1}
        style={{ color: p.c, fontSize: 11, fontWeight: "600" }}
      >
        {text}
      </Text>
    </View>
  );
}

function IconBadge({ name }) {
  return (
    <View
      style={{
        height: 28,
        width: 28,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#2a2838",
        backgroundColor: "#1b1a26",
        marginBottom: 10,
      }}
    >
      <Ionicons name={name} size={14} color={AM} />
    </View>
  );
}

function CardHeader({ icon, title, subtitle, value, note, variant = "pos" }) {
  return (
    <View style={{ marginBottom: 12 }}>
      {icon ? <IconBadge name={icon} /> : null}

      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text
            textTransform="capitalize"
            className="text-sm font-semibold uppercase text-[#f2f2f5]"
            style={{ fontFamily: MONO, letterSpacing: 2.4 }}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              textTransform="capitalize"
              className="mt-1 text-xs text-[#9d9da8]"
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        {value ? (
          <View style={{ alignItems: "flex-end" }}>
            <Text
              textTransform="capitalize"
              className="text-2xl font-bold text-[#f2f2f5]"
              style={{ fontFamily: MONO, fontVariant: ["tabular-nums"] }}
            >
              {value}
            </Text>
            {note ? <Pill text={note} variant={variant} /> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/* ───────────── gradient progress bar ───────────── */

function GradBar({ id, pct, from = VI, to = TL, height = 6 }) {
  return (
    <Svg width="100%" height={height}>
      <Defs>
        <SvgGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </SvgGradient>
      </Defs>
      <Rect
        x="0"
        y="0"
        width="100%"
        height={height}
        rx={height / 2}
        fill="#242230"
      />
      <Rect
        x="0"
        y="0"
        width={`${pct}%`}
        height={height}
        rx={height / 2}
        fill={`url(#${id})`}
      />
    </Svg>
  );
}

/* ───────────── area / line chart (dual series, dashed, axis) ───────────── */

function AreaChart({
  id,
  series, // [{ v, c, o, w, dash }]
  labels = [],
  height = 200,
  axis = false,
  max,
}) {
  const [W, onLayout] = useWidth();

  const pl = axis ? 26 : 2;
  const pr = 6;
  const pt = 8;
  const pb = axis ? 22 : 2;

  const n = series[0].v.length;
  const mx = max || Math.max(...series.flatMap((s) => s.v)) * 1.15;

  const x = (i) => pl + (i * (W - pl - pr)) / (n - 1);
  const y = (a) => pt + (height - pt - pb) * (1 - a / mx);

  return (
    <View onLayout={onLayout} style={{ width: "100%", height }}>
      {W > 0 && (
        <Svg width={W} height={height}>
          <Defs>
            {series.map((s, k) => (
              <SvgGradient
                key={k}
                id={`${id}${k}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <Stop offset="0" stopColor={s.c} stopOpacity={s.o} />
                <Stop offset="1" stopColor={s.c} stopOpacity={0} />
              </SvgGradient>
            ))}
          </Defs>

          {axis &&
            [0, 0.25, 0.5, 0.75, 1].map((t, i) => {
              const yy = pt + (height - pt - pb) * t;

              return (
                <React.Fragment key={i}>
                  <Line
                    x1={pl}
                    x2={W}
                    y1={yy}
                    y2={yy}
                    stroke="#23212c"
                    strokeDasharray="3 4"
                  />
                  <SvgText x={0} y={yy + 3} fill="#6d6d78" fontSize={9}>
                    {Math.round(mx * (1 - t))}
                  </SvgText>
                </React.Fragment>
              );
            })}

          {axis &&
            labels.map((l, i) => (
              <SvgText
                key={i}
                x={x(i)}
                y={height - 5}
                textAnchor="middle"
                fill="#9d9da8"
                fontSize={10}
                fontWeight="500"
              >
                {l}
              </SvgText>
            ))}

          {/* draw back series first so the main one sits on top */}
          {series
            .map((s, k) => ({ s, k }))
            .reverse()
            .map(({ s, k }) => {
              const d = smoothPath(s.v, x, y);

              return (
                <React.Fragment key={k}>
                  <Path
                    d={`${d}L${x(n - 1)},${height - pb}L${x(0)},${height - pb}Z`}
                    fill={`url(#${id}${k})`}
                  />
                  <Path
                    d={d}
                    fill="none"
                    stroke={s.c}
                    strokeWidth={s.w || 2.2}
                    strokeDasharray={s.dash ? "4 4" : undefined}
                    strokeLinecap="round"
                  />
                </React.Fragment>
              );
            })}

          <Circle
            cx={x(n - 1)}
            cy={y(series[0].v[n - 1])}
            r={4.5}
            fill={PK}
            stroke="#13121a"
            strokeWidth={2}
          />
        </Svg>
      )}
    </View>
  );
}

/* ───────────── small bar chart (tap a bar) ───────────── */

function MiniBars({ values, labels, selected, onSelect, height = 74 }) {
  const [W, onLayout] = useWidth();

  const mx = Math.max(...values);
  const n = values.length;
  const slot = W / n;
  const bw = Math.min(16, slot - 6);
  const top = 6;
  const base = height - 14;

  return (
    <View onLayout={onLayout} style={{ width: "100%", height }}>
      {W > 0 && (
        <Svg width={W} height={height}>
          {values.map((v, i) => {
            const bh = 8 + (v / mx) * (base - top - 8);
            const cx = slot * i + slot / 2;
            const on = selected === i;

            return (
              <React.Fragment key={i}>
                <Rect
                  x={cx - bw / 2}
                  y={base - bh}
                  width={bw}
                  height={bh}
                  rx={4}
                  fill={on ? PK : GR}
                  opacity={on ? 1 : 0.85}
                />
                <SvgText
                  x={cx}
                  y={height - 2}
                  textAnchor="middle"
                  fill="#9d9da8"
                  fontSize={9}
                >
                  {labels[i]}
                </SvgText>
                {/* full-height hit area */}
                <Rect
                  x={slot * i}
                  y={0}
                  width={slot}
                  height={height}
                  fill="transparent"
                  onPress={() => onSelect(on ? -1 : i)}
                />
              </React.Fragment>
            );
          })}
        </Svg>
      )}
    </View>
  );
}

/* ───────────── listening clock (24 hourly bars) ───────────── */

function HourBars({ data }) {
  const [W, onLayout] = useWidth();

  const height = 120;
  const base = 96;
  const mx = Math.max(...data);
  const peak = data.indexOf(mx);
  const slot = W / 24;
  const bw = Math.max(4, slot - 4);

  return (
    <View onLayout={onLayout} style={{ width: "100%", height }}>
      {W > 0 && (
        <Svg width={W} height={height}>
          {data.map((v, h) => {
            const t = v / mx;
            const bh = 4 + t * 86;

            return (
              <Rect
                key={h}
                x={slot * h + (slot - bw) / 2}
                y={base - bh}
                width={bw}
                height={bh}
                rx={3}
                fill={h === peak ? PK : AM}
                opacity={0.3 + 0.7 * t}
              />
            );
          })}

          {[
            [0, "12a"],
            [6, "6a"],
            [12, "12p"],
            [18, "6p"],
          ].map(([h, l]) => (
            <SvgText
              key={l}
              x={slot * h + slot / 2}
              y={height - 4}
              textAnchor="middle"
              fill="#9d9da8"
              fontSize={10}
            >
              {l}
            </SvgText>
          ))}
        </Svg>
      )}
    </View>
  );
}

/* ───────────── interactive donut ───────────── */

function InteractiveDonut({ segments, active, onSelect }) {
  const r = 34;
  const circ = 2 * Math.PI * r;
  const SIZE = 230;

  const [name, , , plays] = segments[active];

  // precompute each segment's start offset so nothing is mutated during render
  const offsets = segments.reduce(
    (acc, [, pct]) => {
      acc.push(acc[acc.length - 1] + (circ * pct) / 100);
      return acc;
    },
    [0],
  );

  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={SIZE} height={SIZE} viewBox="0 0 100 100">
        {segments.map(([label, pct, color], i) => {
          const length = (circ * pct) / 100;
          const dashOffset = -offsets[i];

          return (
            <Circle
              key={label}
              cx={50}
              cy={50}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={i === active ? 15 : 11}
              strokeDasharray={`${(length - 2).toFixed(2)} ${(
                circ -
                length +
                2
              ).toFixed(2)}`}
              strokeDashoffset={dashOffset.toFixed(2)}
              transform="rotate(-90 50 50)"
              onPress={() => onSelect(i)}
            />
          );
        })}

        <SvgText
          x={50}
          y={42}
          textAnchor="middle"
          fill="#9d9da8"
          fontSize={4.5}
          letterSpacing={0.5}
        >
          TOP GENRE
        </SvgText>
        <SvgText
          x={50}
          y={52}
          textAnchor="middle"
          fill="#f2f2f5"
          fontSize={9}
          fontWeight="700"
        >
          {name}
        </SvgText>
        <SvgText
          x={50}
          y={60}
          textAnchor="middle"
          fill={TL}
          fontSize={5.5}
          fontWeight="700"
        >
          {`${plays} plays`}
        </SvgText>
      </Svg>
    </View>
  );
}

function GenreRow({ label, pct, color, plays, active, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: active ? "rgba(139,108,240,0.55)" : "#23212c",
        backgroundColor: active ? "#181626" : "#0f0e15",
      }}
    >
      <View
        style={{ height: 10, width: 10, borderRadius: 5, backgroundColor: color }}
      />
      <Text
        textTransform="capitalize"
        className="flex-1 text-xs text-[#f2f2f5]"
        style={{ fontFamily: MONO }}
      >
        {label}
      </Text>
      <Text
        textTransform="capitalize"
        className="text-xs text-[#9d9da8]"
        style={{ fontFamily: MONO }}
      >
        {plays}
      </Text>
      <Text
        textTransform="capitalize"
        className="text-xs font-bold"
        style={{ fontFamily: MONO, color: "#22d3ee", minWidth: 48, textAlign: "right" }}
      >
        {pct.toFixed(1)}%
      </Text>
    </TouchableOpacity>
  );
}

/* ───────────── mini metric card (2-column grid) ───────────── */

function MiniCard({ icon, title, subtitle, value, note, variant, children }) {
  return (
    <View
      className="overflow-hidden rounded-3xl border border-[#23212c] bg-[#13121a]"
      style={{ width: "48.5%", padding: 14 }}
    >
      <IconBadge name={icon} />

      <Text
        textTransform="capitalize"
        className="text-[11px] font-semibold uppercase text-[#f2f2f5]"
        style={{ fontFamily: MONO, letterSpacing: 1.8 }}
        numberOfLines={1}
      >
        {title}
      </Text>
      <Text
        textTransform="capitalize"
        className="mt-1 text-xs text-[#9d9da8]"
        numberOfLines={1}
      >
        {subtitle}
      </Text>

      <Text
        textTransform="capitalize"
        className="mt-3 text-lg font-bold text-[#f2f2f5]"
        style={{ fontFamily: MONO, fontVariant: ["tabular-nums"] }}
        numberOfLines={1}
      >
        {value}
      </Text>
      <Pill text={note} variant={variant} />

      <View style={{ marginTop: 10 }}>{children}</View>
    </View>
  );
}

function QualityRow({ id, label, pct }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <Text textTransform="capitalize" className="text-[11px] text-[#9d9da8]">
          {label}
        </Text>
        <Text
          textTransform="capitalize"
          className="text-[11px] font-bold"
          style={{ color: "#a78bfa" }}
        >
          {pct}%
        </Text>
      </View>
      <GradBar id={id} pct={pct} />
    </View>
  );
}

/* ───────────── calendar ───────────── */

const CELL = `${100 / 7}%`;

function Calendar({ onSelectDay }) {
  const offset = (new Date(2026, 9, 1).getDay() + 6) % 7;

  return (
    <View>
      <View style={{ flexDirection: "row" }}>
        {DN.map((d) => (
          <Text
            textTransform="capitalize"
            key={d}
            className="pb-1 text-center text-xs font-medium text-[#9d9da8]"
            style={{ width: CELL }}
          >
            {d[0]}
          </Text>
        ))}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {Array.from({ length: offset }).map((_, i) => (
          <View key={`empty-${i}`} style={{ width: CELL, aspectRatio: 1 }} />
        ))}

        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
          const minutes = calendarValue(d);
          const future = d > TODAY;
          const today = d === TODAY;
          const alpha = minutes ? 0.2 + 0.8 * Math.min(1, minutes / 300) : 0;

          return (
            <View key={d} style={{ width: CELL, aspectRatio: 1, padding: 2.5 }}>
              <TouchableOpacity
                onPress={() => onSelectDay(d)}
                activeOpacity={0.8}
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 999,
                  opacity: future ? 0.35 : 1,
                  borderWidth: today ? 1.5 : 0,
                  borderColor: "#ffffff",
                  backgroundColor: minutes
                    ? `rgba(228,159,51,${alpha})`
                    : "transparent",
                }}
              >
                <Text
                  textTransform="capitalize"
                  className="text-sm font-medium"
                  style={{ color: alpha > 0.55 ? "#0b0b0e" : "#f4f4f6" }}
                >
                  {d}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/* ───────────── rank row ───────────── */

function RankRow({ initials, gradient, rank, title, subtitle, value, pct }) {
  const [c1] = gradient ? gradient.split(",") : ["#555"];

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginBottom: 12,
      }}
    >
      {initials ? (
        <View
          style={{
            height: 48,
            width: 48,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 24,
            backgroundColor: c1,
          }}
        >
          <Text
            textTransform="capitalize"
            className="text-sm font-bold text-white"
          >
            {initials}
          </Text>
        </View>
      ) : (
        <Text
          textTransform="capitalize"
          className="text-center text-base font-bold text-[#9d9da8]"
          style={{ width: 32 }}
        >
          {rank}
        </Text>
      )}

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          textTransform="capitalize"
          numberOfLines={1}
          className="text-base font-bold text-[#f2f2f5]"
        >
          {title}
        </Text>

        {subtitle ? (
          <Text
            textTransform="capitalize"
            numberOfLines={1}
            className="mt-1 text-xs text-[#9d9da8]"
          >
            {subtitle}
          </Text>
        ) : null}

        <View
          style={{
            marginTop: 8,
            height: 5,
            overflow: "hidden",
            borderRadius: 999,
            backgroundColor: "#242230",
          }}
        >
          <View
            style={{
              height: "100%",
              width: `${pct}%`,
              borderRadius: 999,
              backgroundColor: AM,
            }}
          />
        </View>
      </View>

      <Text
        textTransform="capitalize"
        className="text-sm font-semibold text-[#f2f2f5]"
        style={{
          fontVariant: ["tabular-nums"],
          minWidth: 44,
          textAlign: "right",
        }}
      >
        {value}
      </Text>
    </View>
  );
}

/* ───────────── habit tile ───────────── */

function HabitTile({ label, value, note, valueClass = "text-xl" }) {
  return (
    <View
      style={{
        width: "48.5%",
        borderRadius: 16,
        backgroundColor: "#1b1a23",
        padding: 12,
      }}
    >
      <Text
        textTransform="capitalize"
        className="text-sm font-medium text-[#9d9da8]"
      >
        {label}
      </Text>

      <Text
        textTransform="capitalize"
        numberOfLines={1}
        className={`mt-1 font-bold text-[#f2f2f5] ${valueClass}`}
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {value}
      </Text>

      <Text
        textTransform="capitalize"
        numberOfLines={1}
        className="mt-1 text-sm text-[#9d9da8]"
      >
        {note}
      </Text>
    </View>
  );
}

/* ───────────── footer stat (inside Total listen) ───────────── */

function FootStat({ label, value, color = "#f2f2f5" }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text
        textTransform="capitalize"
        className="text-[10px] uppercase text-[#9d9da8]"
        style={{ fontFamily: MONO, letterSpacing: 1.2 }}
      >
        {label}
      </Text>
      <Text
        textTransform="capitalize"
        className="mt-1 text-sm font-bold"
        style={{ fontFamily: MONO, color }}
      >
        {value}
      </Text>
    </View>
  );
}

/* ───────────── screen ───────────── */

export default function StatisticsScreen() {
  const layout = useLayout();
  const { insets, padX } = layout;
  const router = useRouter();
  const goArtists = () => router.push("/artists");

  const onScroll = useHideTabBarOnScroll();

  const [range, setRange] = useState("Week");
  const [selectedDay, setSelectedDay] = useState(4); // Fri
  const [genreIdx, setGenreIdx] = useState(1);
  const [calendarDay, setCalendarDay] = useState(TODAY);

  const rangeData = RANGE_DATA[range];
  const totalMinutes = rangeData.v.reduce((a, b) => a + b, 0) * 60;

  // hourly bars follow the day picked in "Daily hours" (none picked = weekly average)
  const clockData = useMemo(() => {
    if (selectedDay < 0) {
      return H[0].map((_, h) =>
        Math.round(H.reduce((sum, row) => sum + row[h], 0) / 7),
      );
    }
    return H[selectedDay];
  }, [selectedDay]);

  const peakHour = clockData.indexOf(Math.max(...clockData));

  const dailyValue =
    selectedDay < 0
      ? `${(dayHours.reduce((a, b) => a + b, 0) / 7).toFixed(1)}h`
      : `${dayHours[selectedDay].toFixed(1)}h`;

  const calendarCaption =
    calendarDay > TODAY
      ? `Oct ${calendarDay}: nothing yet`
      : `Oct ${calendarDay}${calendarDay === TODAY ? " (today)" : ""}: ${
          calendarValue(calendarDay)
            ? `${fmt(calendarValue(calendarDay))} of listening`
            : "no listening"
        }`;

  const genre = GEN[genreIdx];

  return (
    <View className="flex-1 bg-[#08080f]" style={{ paddingTop: insets.top }}>
      {/* soft glow */}
      <View
        pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 260 }}
      >
        <Svg width="100%" height="100%">
          <Defs>
            <SvgGradient id="glow" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#ac3287" stopOpacity={0.4} />
              <Stop offset="1" stopColor="#ac3287" stopOpacity={0} />
            </SvgGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#glow)" />
        </Svg>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        bounces
        scrollEventThrottle={16}
        onScroll={onScroll}
        contentContainerStyle={{
          alignItems: "center",
          paddingBottom: BOTTOM_PAD,
        }}
      >
        <Frame layout={layout}>
          <MusicHeader {...HEADER_CONTENT.statistics} goArtists={goArtists} />

          {/* range chips */}
          <Chips
            items={RANGES}
            active={RANGES.indexOf(range)}
            onChange={(i) => setRange(RANGES[i])}
            padX={padX}
          />

          <View style={{ marginTop: 28 }}>
            {/* ── total listen: dual-series area chart ── */}
            <Card>
              <CardHeader
                icon="pie-chart-outline"
                title="Total listen"
                subtitle={rangeData.s}
                value={fmt(totalMinutes)}
                note={`↗ ${rangeData.d}`}
                variant="pos"
              />

              <AreaChart
                id="tl"
                axis
                height={200}
                labels={rangeData.l}
                series={[
                  { v: rangeData.v, c: AM, o: 0.4, w: 2.6 },
                  { v: rangeData.p, c: VI, o: 0.22, w: 2, dash: true },
                ]}
              />

              <View
                style={{
                  flexDirection: "row",
                  marginTop: 12,
                  paddingTop: 12,
                  borderTopWidth: 1,
                  borderTopColor: "#23212c",
                }}
              >
                <FootStat label="Avg / day" value={rangeData.avg} />
                <FootStat
                  label="Longest"
                  value={rangeData.longest}
                  color="#34d399"
                />
                <FootStat
                  label="Skip rate"
                  value={rangeData.skip}
                  color="#22d3ee"
                />
              </View>
            </Card>

            {/* ── 2 × 2 mini metric cards ── */}
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "space-between",
                rowGap: 12,
                marginBottom: CARD_MB,
              }}
            >
              <MiniCard
                icon="sparkles-outline"
                title="Discoveries"
                subtitle="New songs / week"
                value="47"
                note="+6 artists"
                variant="pos"
              >
                <AreaChart
                  id="ds"
                  height={56}
                  max={13}
                  series={[{ v: DISCOVERIES, c: TL, o: 0.25, w: 2 }]}
                />
              </MiniCard>

              <MiniCard
                icon="bar-chart-outline"
                title="Daily hours"
                subtitle="Tap a bar"
                value={dailyValue}
                note={selectedDay < 0 ? "Average" : DN[selectedDay]}
                variant="info"
              >
                <MiniBars
                  values={dayHours}
                  labels={DN.map((d) => d[0])}
                  selected={selectedDay}
                  onSelect={setSelectedDay}
                />
              </MiniCard>

              <MiniCard
                icon="play-skip-forward-outline"
                title="Skips"
                subtitle="Skipped early"
                value="8.4%"
                note="2 spikes"
                variant="neg"
              >
                <AreaChart
                  id="sk"
                  height={56}
                  max={18}
                  series={[{ v: SKIPS, c: "#fb7185", o: 0.3, w: 1.8 }]}
                />
              </MiniCard>

              <MiniCard
                icon="musical-notes-outline"
                title="Audio quality"
                subtitle="Stream mix"
                value="70%"
                note="High+"
                variant="pur"
              >
                <QualityRow id="q0" label={AUD[0][0]} pct={AUD[0][1]} />
                <QualityRow id="q1" label={AUD[1][0]} pct={AUD[1][1]} />
                <QualityRow id="q2" label={AUD[2][0]} pct={AUD[2][1]} />
              </MiniCard>
            </View>

            {/* ── by genre: interactive donut + breakdown ── */}
            <Card>
              <CardHeader
                icon="disc-outline"
                title="By genre"
                subtitle="Tap a slice to inspect"
                value={`${genre[1]}%`}
                note={genre[0]}
                variant="pur"
              />

              <InteractiveDonut
                segments={GEN}
                active={genreIdx}
                onSelect={setGenreIdx}
              />

              <Text
                textTransform="capitalize"
                className="mb-2 mt-3 text-[11px] uppercase text-[#9d9da8]"
                style={{ fontFamily: MONO, letterSpacing: 1.4 }}
              >
                Genre breakdown
              </Text>

              {GEN.map(([label, pct, color, plays], i) => (
                <GenreRow
                  key={label}
                  label={label}
                  pct={pct}
                  color={color}
                  plays={plays}
                  active={i === genreIdx}
                  onPress={() => setGenreIdx(i)}
                />
              ))}
            </Card>

            {/* ── listening clock: hourly bars ── */}
            <Card>
              <CardHeader
                icon="time-outline"
                title="Listening clock"
                subtitle={
                  selectedDay < 0
                    ? "Plays per hour · weekly average"
                    : `Plays per hour · ${DN[selectedDay]}`
                }
                value={hr12(peakHour)}
                note="Peak hour"
                variant="pos"
              />

              <HourBars data={clockData} />
            </Card>

            {/* ── calendar ── */}
            <Card>
              <CardHeader
                title="Listening days"
                subtitle="October 2026"
              />

              <Calendar onSelectDay={setCalendarDay} />

              <Text
                textTransform="capitalize"
                className="mt-3 text-sm font-medium text-[#f2f2f5]"
              >
                {calendarCaption}
              </Text>
            </Card>

            {/* ── habits ── */}
            <Card>
              <CardHeader title="Habits" subtitle="How you listen overall" />

              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  rowGap: 12,
                }}
              >
                <View
                  style={{
                    width: "100%",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    borderRadius: 16,
                    backgroundColor: "#1b1a23",
                    padding: 12,
                  }}
                >
                  <View>
                    <Text
                      textTransform="capitalize"
                      className="text-xs font-medium text-[#9d9da8]"
                    >
                      Repeat rate
                    </Text>
                    <Text
                      textTransform="capitalize"
                      className="mt-1 text-2xl font-bold text-[#f2f2f5]"
                      style={{ fontVariant: ["tabular-nums"] }}
                    >
                      5%
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <GradBar id="rep" pct={5} from={AM} to={PK} />
                    <Text
                      textTransform="capitalize"
                      numberOfLines={1}
                      className="mt-2 text-xs text-[#9d9da8]"
                    >
                      of plays are songs you replayed
                    </Text>
                  </View>
                </View>

                <HabitTile
                  label="Total listen"
                  value="1,284"
                  note="plays so far"
                />
                <HabitTile
                  label="Never listened"
                  value="37"
                  note="downloaded, no plays"
                />
                <HabitTile
                  label="First listen"
                  value="Mar 14, 2026"
                  note="Chill Sunset"
                  valueClass="text-sm"
                />
                <HabitTile
                  label="Last listen"
                  value="Today, 9:41 pm"
                  note="Neon Night Drive"
                  valueClass="text-sm"
                />
              </View>
            </Card>

            {/* ── top artists ── */}
            <Card>
              <CardHeader
                title="Top artists"
                subtitle="Hours listened this year"
              />

              {TOP_ARTISTS.map(([name, initials, hours, gradient], i) => (
                <View
                  key={name}
                  style={
                    i === TOP_ARTISTS.length - 1 ? { marginBottom: -12 } : null
                  }
                >
                  <RankRow
                    initials={initials}
                    gradient={gradient}
                    title={name}
                    value={`${hours}h`}
                    pct={(hours / TOP_ARTISTS[0][2]) * 100}
                  />
                </View>
              ))}
            </Card>

            {/* ── most played ── */}
            <Card style={{ marginBottom: 0 }}>
              <CardHeader
                title="Most played"
                subtitle="Songs you came back to"
              />

              {TOP_SONGS.map(([title, artist, plays], i) => (
                <View
                  key={title}
                  style={
                    i === TOP_SONGS.length - 1 ? { marginBottom: -12 } : null
                  }
                >
                  <RankRow
                    rank={i + 1}
                    title={title}
                    subtitle={artist}
                    value={String(plays)}
                    pct={(plays / TOP_SONGS[0][2]) * 100}
                  />
                </View>
              ))}
            </Card>
          </View>
        </Frame>
      </ScrollView>
    </View>
  );
}