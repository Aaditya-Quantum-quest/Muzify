import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
  Pressable,
} from "react-native";

import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  LinearTransition,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useIsFocused } from "expo-router";
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
  LinearGradient,
  ClipPath,
  G,
} from "react-native-svg";

import MusicHeader from "../../components/subComponents/MusicHeader";
import { HEADER_CONTENT } from "../../constants/headerContent";
import { useHideTabBarOnScroll } from "../../components/ui/BottomBar";
import { useStatistics } from "../../hooks/useStatistics";

/* ───────────── constants ───────────── */

const AM = "#e49f33";
const PK = "#ec6f8e";
const VI = "#8b6cf0";
const TL = "#3cc0b8";
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
  if (!v?.length) return `M${x(0)},${y(0)}`;
  let d = `M${x(0)},${y(v[0] || 0)}`;
  for (let i = 1; i < v.length; i++) {
    const c = (x(i - 1) + x(i)) / 2;
    d += `C${c},${y(v[i - 1] || 0)} ${c},${y(v[i] || 0)} ${x(i)},${y(v[i] || 0)}`;
  }
  return d;
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

function Tappable({ children, width = "100%", delay = 0, style }) {
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(450).springify().damping(16)}
      style={[{ width }, pressStyle]}
    >
      <Pressable
        onPressIn={() => {
          // eslint-disable-next-line react-hooks/immutability
          scale.value = withSpring(0.96, { damping: 15, stiffness: 300 });
        }}
        onPressOut={() => {
          // eslint-disable-next-line react-hooks/immutability
          scale.value = withSpring(1, { damping: 12, stiffness: 260 });
        }}
        onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
        style={[
          {
            flex: 1,
            overflow: "hidden",
            borderRadius: 20,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.06)",
            backgroundColor: "#1b1a23",
            padding: 14,
          },
          style,
        ]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

function IconChip({ name, accent }) {
  return (
    <View
      style={{
        height: 32,
        width: 32,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 10,
        backgroundColor: `${accent}22`,
        borderWidth: 1,
        borderColor: `${accent}33`,
      }}
    >
      <Ionicons name={name} size={16} color={accent} />
    </View>
  );
}

/* soft colored glow tucked into the top-right corner */
function CornerGlow({ accent }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: -34,
        right: -34,
        height: 96,
        width: 96,
        borderRadius: 48,
        backgroundColor: accent,
        opacity: 0.1,
      }}
    />
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
  pos: {
    c: "#34d399",
    bg: "rgba(16,185,129,0.10)",
    bd: "rgba(16,185,129,0.25)",
  },
  info: {
    c: "#22d3ee",
    bg: "rgba(6,182,212,0.10)",
    bd: "rgba(6,182,212,0.25)",
  },
  pur: {
    c: "#a78bfa",
    bg: "rgba(139,92,246,0.10)",
    bd: "rgba(139,92,246,0.25)",
  },
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
            style={{ letterSpacing: 2.4 }}
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

const TIP_W = 104;


function AreaChart({
  id,
  series, // [{ v, c, o, w, dash, name? }]
  labels = [],
  height = 200,
  axis = false,
  max,
  compact = false, // sparkline mode: no scrubbing, tooltip, pulse or glow
}) {
  const [W, onLayout] = useWidth();
  const [sel, setSel] = useState(null);
  const lastIdx = useRef(null);

  const reveal = useSharedValue(0);
  const pulse = useSharedValue(0);

  const pl = axis ? 26 : 2;
  const pr = 6;
  const pt = 8;
  const pb = axis ? 22 : 2;

  const seriesSafe = series.map((s) => ({
    ...s,
    v: s.v?.length ? s.v : [0, 0],
  }));
  const n = Math.max(2, seriesSafe[0].v.length);
  const values = seriesSafe.flatMap((s) => s.v);
  const mx = max || Math.max(1, ...values) * 1.15;

  const x = (i) => pl + (i * (W - pl - pr)) / Math.max(1, n - 1);
  const y = (a) => pt + (height - pt - pb) * (1 - a / mx);

  const ready = W > 0;
  const dataKey = seriesSafe.map((s) => s.v.join(",")).join("|");
  const named = seriesSafe.filter((s) => s.name);

  // lines sweep in from the left, and again whenever the range changes
  useEffect(() => {
    if (!ready) return;
    reveal.value = 0;
    reveal.value = withTiming(1, {
      duration: 950,
      easing: Easing.out(Easing.cubic),
    });
  }, [dataKey, ready, reveal]);

  // gentle pulse on the latest point (skipped for sparklines)
  useEffect(() => {
    if (compact) return;
    pulse.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
  }, [pulse, compact]);

  const clipProps = useAnimatedProps(() => ({
    width: Math.max(0.01, W * reveal.value),
  }));

  const dotProps = useAnimatedProps(() => ({
    opacity: Math.max(0, (reveal.value - 0.85) / 0.15),
  }));

  const pulseProps = useAnimatedProps(() => ({
    r: 4.5 + 9 * pulse.value,
    opacity:
      0.45 * (1 - pulse.value) * Math.max(0, (reveal.value - 0.85) / 0.15),
  }));

  const pick = (px) => {
    if (!ready) return;
    const step = (W - pl - pr) / (n - 1);
    const i = Math.max(0, Math.min(n - 1, Math.round((px - pl) / step)));
    if (i === lastIdx.current) return;
    lastIdx.current = i;
    Haptics.selectionAsync();
    setSel(i);
  };

  const release = () => {
    lastIdx.current = null;
    setSel(null);
  };

  return (
    <View>
      {/* legend (only for series that have a name) */}
      {named.length ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            marginBottom: 10,
          }}
        >
          {named.map((s) => (
            <View
              key={s.name}
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <View
                style={{
                  height: 3,
                  width: 14,
                  borderRadius: 2,
                  backgroundColor: s.c,
                  opacity: s.dash ? 0.6 : 1,
                }}
              />
              <Text className="text-xs font-medium text-[#9d9da8]">
                {s.name}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View onLayout={onLayout} style={{ width: "100%", height }}>
        {ready && (
          <Svg width={W} height={height}>
            <Defs>
              {seriesSafe.map((s, k) => (
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
              <ClipPath id={`${id}clip`}>
                <AnimatedRect
                  x={0}
                  y={0}
                  height={height}
                  animatedProps={clipProps}
                />
              </ClipPath>
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
                  fill={sel === i ? "#f2f2f5" : "#9d9da8"}
                  fontSize={10}
                  fontWeight={sel === i ? "700" : "500"}
                >
                  {l}
                </SvgText>
              ))}

            {/* scrub crosshair */}
            {sel !== null ? (
              <Line
                x1={x(sel)}
                x2={x(sel)}
                y1={pt}
                y2={height - pb}
                stroke="rgba(255,255,255,0.28)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            ) : null}

            {/* draw back series first so the main one sits on top */}
            <G clipPath={`url(#${id}clip)`}>
              {seriesSafe
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
                      {/* soft glow under the main line */}
                      {k === 0 && !compact ? (
                        <Path
                          d={d}
                          fill="none"
                          stroke={s.c}
                          strokeWidth={(s.w || 2.2) + 6}
                          strokeLinecap="round"
                          opacity={0.12}
                        />
                      ) : null}
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
            </G>

            {/* latest point: pulsing while idle, hidden while scrubbing */}
            {sel === null ? (
              <>
                {!compact ? (
                  <AnimatedCircle
                    cx={x(n - 1)}
                    cy={y(seriesSafe[0].v[n - 1])}
                    fill={PK}
                    animatedProps={pulseProps}
                  />
                ) : null}
                <AnimatedCircle
                  cx={x(n - 1)}
                  cy={y(seriesSafe[0].v[n - 1])}
                  r={compact ? 3.5 : 4.5}
                  fill={PK}
                  stroke="#13121a"
                  strokeWidth={compact ? 1.5 : 2}
                  animatedProps={dotProps}
                />
              </>
            ) : (
              seriesSafe.map((s, k) => (
                <Circle
                  key={k}
                  cx={x(sel)}
                  cy={y(s.v[sel])}
                  r={k === 0 ? 5 : 4}
                  fill={s.c}
                  stroke="#13121a"
                  strokeWidth={2}
                />
              ))
            )}
          </Svg>
        )}

        {/* floating readout that follows your finger */}
        {!compact && ready && sel !== null ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              left: Math.max(0, Math.min(W - TIP_W, x(sel) - TIP_W / 2)),
              width: TIP_W,
              paddingHorizontal: 10,
              paddingVertical: 8,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.1)",
              backgroundColor: "rgba(27,26,35,0.96)",
            }}
          >
            {labels[sel] != null ? (
              <Text
                className="text-[10px] font-semibold uppercase text-[#9d9da8]"
                style={{ letterSpacing: 1.2 }}
              >
                {labels[sel]}
              </Text>
            ) : null}

            {seriesSafe.map((s, k) => (
              <View
                key={k}
                style={{
                  marginTop: 4,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <View
                  style={{
                    height: 7,
                    width: 7,
                    borderRadius: 4,
                    backgroundColor: s.c,
                  }}
                />
                <Text
                  className={`text-sm ${
                    k === 0
                      ? "font-bold text-[#f2f2f5]"
                      : "font-medium text-[#9d9da8]"
                  }`}
                  style={{ fontVariant: ["tabular-nums"] }}
                >
                  {Math.round(s.v[sel])}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* touch layer: tap or drag across the chart to scrub */}
        {!compact ? (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={(e) => pick(e.nativeEvent.locationX)}
            onResponderMove={(e) => pick(e.nativeEvent.locationX)}
            onResponderRelease={release}
            onResponderTerminate={release}
          />
        ) : null}
      </View>
    </View>
  );
}

/* ───────────── small bar chart (tap a bar) ───────────── */

function MiniBar({ x, w, bh, base, fill, opacity, delay }) {
  const h = useSharedValue(0);

  // grows from the baseline on mount, springs when values change
  useEffect(() => {
    h.value = withDelay(delay, withSpring(bh, { damping: 16, stiffness: 140 }));
  }, [bh, delay, h]);

  const animatedProps = useAnimatedProps(() => ({
    y: base - h.value,
    height: Math.max(0.01, h.value),
  }));

  return (
    <AnimatedRect
      x={x}
      width={w}
      rx={Math.min(5, w / 2)}
      fill={fill}
      opacity={opacity}
      animatedProps={animatedProps}
    />
  );
}

function MiniBars({ values, labels, selected, onSelect, height = 74 }) {
  const [W, onLayout] = useWidth();

  const mx = Math.max(1, ...(values.length ? values : [0]));
  const n = Math.max(1, values.length);
  const slot = W / n;
  const bw = Math.min(16, slot - 6);
  const top = 6;
  const base = height - 14;

  return (
    <View onLayout={onLayout} style={{ width: "100%", height }}>
      {W > 0 && (
        <Svg width={W} height={height}>
          <Defs>
            <SvgGradient id="mbGr" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={GR} stopOpacity="1" />
              <Stop offset="1" stopColor={GR} stopOpacity="0.45" />
            </SvgGradient>
            <SvgGradient id="mbPk" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={PK} stopOpacity="1" />
              <Stop offset="1" stopColor={PK} stopOpacity="0.55" />
            </SvgGradient>
          </Defs>

          {/* baseline */}
          <Rect
            x={0}
            y={base + 0.5}
            width={W}
            height={1}
            fill="rgba(255,255,255,0.08)"
          />

          {values.map((v, i) => {
            const bh = 8 + (v / mx) * (base - top - 8);
            const cx = slot * i + slot / 2;
            const on = selected === i;
            const dim = selected >= 0 && !on;

            return (
              <React.Fragment key={i}>
                {/* highlight column behind the selected bar */}
                {on ? (
                  <Rect
                    x={slot * i + 1}
                    y={top - 4}
                    width={slot - 2}
                    height={height - top + 2}
                    rx={8}
                    fill="rgba(236,111,142,0.1)"
                  />
                ) : null}

                <MiniBar
                  x={cx - bw / 2}
                  w={bw}
                  bh={bh}
                  base={base}
                  delay={i * 45}
                  fill={on ? "url(#mbPk)" : "url(#mbGr)"}
                  opacity={on ? 1 : dim ? 0.5 : 0.85}
                />

                <SvgText
                  x={cx}
                  y={height - 2}
                  textAnchor="middle"
                  fill={on ? "#f2f2f5" : "#9d9da8"}
                  fontSize={9}
                  fontWeight={on ? "700" : "500"}
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
                  onPress={() => {
                    Haptics.selectionAsync();
                    onSelect(on ? -1 : i);
                  }}
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

const AnimatedRect = Animated.createAnimatedComponent(Rect);

function HourBar({ x, w, bh, base, fill, opacity, delay }) {
  const h = useSharedValue(0);

  // grows from the baseline on mount, and morphs when the data changes
  useEffect(() => {
    h.value = withDelay(
      delay,
      withTiming(bh, { duration: 550, easing: Easing.out(Easing.cubic) }),
    );
  }, [bh, delay, h]);

  const animatedProps = useAnimatedProps(() => ({
    y: base - h.value,
    height: h.value,
  }));

  return (
    <AnimatedRect
      x={x}
      width={w}
      rx={Math.min(5, w / 2)}
      fill={fill}
      opacity={opacity}
      animatedProps={animatedProps}
    />
  );
}

function HourBars({ data }) {
  const [W, onLayout] = useWidth();
  const [sel, setSel] = useState(null);
  const lastHour = useRef(null);

  const height = 150;
  const base = 126;
  const maxBar = 100;
  const mx = Math.max(1, ...(data.length ? data : [0]));
  const peak = Math.max(0, data.indexOf(Math.max(0, ...data)));
  const slot = W / 24;
  const bw = Math.max(4, slot - 4);

  const shown = sel ?? peak;

  const pick = (x) => {
    if (!W) return;
    const h = Math.max(0, Math.min(23, Math.floor(x / slot)));
    if (h === lastHour.current) return;
    lastHour.current = h;
    Haptics.selectionAsync();
    setSel(h);
  };

  const release = () => {
    lastHour.current = null;
    setSel(null);
  };

  return (
    <View>
      {/* live readout: shows the peak by default, follows your finger on touch */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
          padding: 12,
          borderRadius: 16,
          borderWidth: 1,
          borderColor:
            shown === peak ? "rgba(236,111,142,0.28)" : "rgba(228,159,51,0.22)",
          backgroundColor:
            shown === peak ? "rgba(236,111,142,0.07)" : "rgba(228,159,51,0.07)",
        }}
      >
        <View>
          <Text
            textTransform="capitalize"
            className="text-xs font-medium uppercase text-[#9d9da8]"
            style={{ letterSpacing: 1.2 }}
          >
            {sel === null ? "Busiest hour" : "Selected hour"}
          </Text>
          <Text
            textTransform="capitalize"
            className="mt-1 text-2xl font-bold text-[#f2f2f5]"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {hr12(shown)}
          </Text>
        </View>

        <View style={{ alignItems: "flex-end" }}>
          {shown === peak ? (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 999,
                marginBottom: 4,
                backgroundColor: "rgba(236,111,142,0.18)",
              }}
            >
              <Text
                textTransform="capitalize"
                className="text-xs font-semibold"
                style={{ color: PK }}
              >
                Peak
              </Text>
            </View>
          ) : null}
          <Text
            textTransform="capitalize"
            className="text-lg font-bold text-[#f2f2f5]"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {data[shown]}{" "}
            <Text className="text-xs font-medium text-[#9d9da8]">plays</Text>
          </Text>
        </View>
      </View>

      {/* chart */}
      <View onLayout={onLayout} style={{ width: "100%", height }}>
        {W > 0 && (
          <Svg width={W} height={height}>
            <Defs>
              <LinearGradient id="barAm" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={AM} stopOpacity="1" />
                <Stop offset="1" stopColor={AM} stopOpacity="0.45" />
              </LinearGradient>
              <LinearGradient id="barPk" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={PK} stopOpacity="1" />
                <Stop offset="1" stopColor={PK} stopOpacity="0.45" />
              </LinearGradient>
            </Defs>

            {/* guide lines */}
            {[0.5, 1].map((f) => (
              <Line
                key={f}
                x1={0}
                x2={W}
                y1={base - maxBar * f}
                y2={base - maxBar * f}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={1}
                strokeDasharray="3 5"
              />
            ))}
            <Line
              x1={0}
              x2={W}
              y1={base + 0.5}
              y2={base + 0.5}
              stroke="rgba(255,255,255,0.1)"
              strokeWidth={1}
            />

            {/* highlight column behind the selected hour */}
            {sel !== null ? (
              <Rect
                x={slot * sel + 1}
                y={base - maxBar - 8}
                width={slot - 2}
                height={maxBar + 8}
                rx={8}
                fill="rgba(255,255,255,0.06)"
              />
            ) : null}

            {data.map((v, h) => {
              const t = v / mx;
              const bh = 4 + t * (maxBar - 4);
              const dim = sel !== null && h !== sel;

              return (
                <HourBar
                  key={h}
                  x={slot * h + (slot - bw) / 2}
                  w={bw}
                  bh={bh}
                  base={base}
                  delay={h * 18}
                  fill={h === peak ? "url(#barPk)" : "url(#barAm)"}
                  opacity={(0.3 + 0.7 * t) * (dim ? 0.45 : 1)}
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
                y={height - 6}
                textAnchor="middle"
                fill={sel === h ? "#f2f2f5" : "#9d9da8"}
                fontSize={10}
                fontWeight="600"
              >
                {l}
              </SvgText>
            ))}
          </Svg>
        )}

        {/* touch layer: tap or drag across the bars to scrub through hours */}
        <View
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => pick(e.nativeEvent.locationX)}
          onResponderMove={(e) => pick(e.nativeEvent.locationX)}
          onResponderRelease={release}
          onResponderTerminate={release}
        />
      </View>
    </View>
  );
}

/* ───────────── interactive donut ───────────── */

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function DonutSegment({
  i,
  r,
  circ,
  length,
  offset,
  color,
  isActive,
  onPress,
  halo = false,
}) {
  const grow = useSharedValue(0);
  const act = useSharedValue(isActive ? 1 : 0);

  // slice draws itself in, one after another
  useEffect(() => {
    grow.value = withDelay(
      i * 110,
      withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }),
    );
  }, [i, grow]);

  // slice swells smoothly when selected
  useEffect(() => {
    act.value = withSpring(isActive ? 1 : 0, { damping: 14, stiffness: 180 });
  }, [isActive, act]);

  const animatedProps = useAnimatedProps(() => {
    const visible = Math.max(0.01, (length - 2) * grow.value);
    const w = 11 + 4 * act.value;

    return halo
      ? {
          strokeWidth: w + 8,
          strokeDasharray: [visible, circ - visible],
          opacity: 0.22 * act.value,
        }
      : {
          strokeWidth: w,
          strokeDasharray: [visible, circ - visible],
          opacity: 0.55 + 0.45 * act.value,
        };
  });

  return (
    <AnimatedCircle
      cx={50}
      cy={50}
      r={r}
      fill="none"
      stroke={color}
      strokeDashoffset={offset}
      transform="rotate(-90 50 50)"
      animatedProps={animatedProps}
      onPress={halo ? undefined : onPress}
    />
  );
}

function InteractiveDonut({ segments, active, onSelect }) {
  const r = 34;
  const circ = 2 * Math.PI * r;
  const SIZE = 230;

  const [name, , color, plays] = segments[active];

  // precompute each segment's start offset so nothing is mutated during render
  const offsets = segments.reduce(
    (acc, [, pct]) => {
      acc.push(acc[acc.length - 1] + (circ * pct) / 100);
      return acc;
    },
    [0],
  );

  const select = (i) => {
    if (i !== active) Haptics.selectionAsync();
    onSelect(i);
  };

  const common = (i, pct) => ({
    i,
    r,
    circ,
    length: (circ * pct) / 100,
    offset: -offsets[i],
  });

  return (
    <View
      style={{
        alignSelf: "center",
        width: SIZE,
        height: SIZE,
        alignItems: "center",
        justifyContent: "center",
        marginVertical: 4,
      }}
    >
      {/* ambient glow in the active slice's color */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: SIZE * 0.78,
          height: SIZE * 0.78,
          borderRadius: SIZE * 0.39,
          backgroundColor: color,
          opacity: 0.07,
        }}
      />

      <Svg width={SIZE} height={SIZE} viewBox="0 0 100 100">
        {/* track */}
        <Circle
          cx={50}
          cy={50}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={15}
        />

        {/* soft halos first, so they never cover neighbouring slices */}
        {segments.map(([label, pct, c], i) => (
          <DonutSegment
            key={`halo-${label}`}
            halo
            color={c}
            isActive={i === active}
            {...common(i, pct)}
          />
        ))}

        {segments.map(([label, pct, c], i) => (
          <DonutSegment
            key={label}
            color={c}
            isActive={i === active}
            onPress={() => select(i)}
            {...common(i, pct)}
          />
        ))}
      </Svg>

      {/* center readout: re-animates whenever the slice changes */}
      <Animated.View
        key={active}
        entering={FadeIn.duration(220)}
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View style={{ maxWidth: 112, alignItems: "center" }}>
          <Text
            textTransform="capitalize"
            className="text-[10px] font-medium uppercase text-[#9d9da8]"
            style={{ letterSpacing: 1.6 }}
          >
            Top genre
          </Text>
          <Text
            textTransform="capitalize"
            numberOfLines={1}
            adjustsFontSizeToFit
            className="mt-1 text-xl font-bold text-[#f2f2f5]"
          >
            {name}
          </Text>
          <View
            style={{
              marginTop: 6,
              paddingHorizontal: 10,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: "rgba(255,255,255,0.06)",
            }}
          >
            <Text
              textTransform="capitalize"
              className="text-xs font-bold"
              style={{ color: TL, fontVariant: ["tabular-nums"] }}
            >
              {`${plays} plays`}
            </Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

function GenreRow({
  label,
  pct,
  color,
  plays,
  active,
  onPress,
  max = 100,
  index = 0,
}) {
  const act = useSharedValue(active ? 1 : 0);
  const fill = useSharedValue(0);

  useEffect(() => {
    act.value = withTiming(active ? 1 : 0, { duration: 220 });
  }, [active, act]);

  useEffect(() => {
    fill.value = withDelay(
      index * 60,
      withTiming(Math.min(100, (pct / max) * 100), {
        duration: 700,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [pct, max, index, fill]);

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 50).duration(350)}
      style={{ marginBottom: 8 }}
    >
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingVertical: 6,
          paddingHorizontal: 8,
          borderRadius: 12,
          backgroundColor: active ? "rgba(236,111,142,0.08)" : "transparent",
        }}
      >
        <View
          style={{
            height: 10,
            width: 10,
            borderRadius: 5,
            backgroundColor: color,
          }}
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
          style={{
            fontFamily: MONO,
            color: "#22d3ee",
            minWidth: 48,
            textAlign: "right",
          }}
        >
          {pct.toFixed(1)}%
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

/* ───────────── mini metric card (2-column grid) ───────────── */

const MINI_ACCENT = {
  pos: "#34d399",
  info: "#22d3ee",
  neg: "#fb7185",
  pur: "#a78bfa",
};

function MiniCard({
  icon,
  title,
  subtitle,
  value,
  note,
  variant,
  children,
  delay = 0,
}) {
  const accent = MINI_ACCENT[variant] ?? "#e49f33";
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(450).springify().damping(16)}
      style={[{ width: "48.5%" }, pressStyle]}
    >
      <Pressable
        onPressIn={() => {
          scale.value = withSpring(0.97, { damping: 15, stiffness: 300 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 12, stiffness: 260 });
        }}
        onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
        style={{
          flex: 1,
          overflow: "hidden",
          borderRadius: 24,
          borderWidth: 1,
          borderColor: "#23212c",
          backgroundColor: "#13121a",
          padding: 14,
        }}
      >
        {/* soft top highlight line in the tile's accent */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 20,
            right: 20,
            height: 1,
            backgroundColor: accent,
            opacity: 0.4,
          }}
        />

        {/* corner glow */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -40,
            right: -40,
            height: 110,
            width: 110,
            borderRadius: 55,
            backgroundColor: accent,
            opacity: 0.09,
          }}
        />

        {/* icon chip */}
        <View
          style={{
            height: 32,
            width: 32,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 10,
            borderRadius: 10,
            backgroundColor: `${accent}22`,
            borderWidth: 1,
            borderColor: `${accent}33`,
          }}
        >
          <Ionicons name={icon} size={16} color={accent} />
        </View>

        <Text
          textTransform="capitalize"
          className="text-[11px] font-semibold uppercase text-[#f2f2f5]"
          style={{ letterSpacing: 1.8 }}
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
          className="mt-3 text-xl font-bold text-[#f2f2f5]"
          style={{ fontFamily: MONO, fontVariant: ["tabular-nums"] }}
          numberOfLines={1}
        >
          {value}
        </Text>
        <Pill text={note} variant={variant} />

        <View style={{ marginTop: 12 }}>{children}</View>
      </Pressable>
    </Animated.View>
  );
}
function QualityRow({ id, label, pct, index = 0 }) {
  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80).duration(350)}
      style={{ marginBottom: 10 }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 5,
        }}
      >
        <Text
          textTransform="capitalize"
          numberOfLines={1}
          className="flex-1 pr-2 text-[11px] font-medium text-[#9d9da8]"
        >
          {label}
        </Text>

        <View
          style={{
            paddingHorizontal: 6,
            paddingVertical: 1,
            borderRadius: 999,
            backgroundColor: "rgba(167,139,250,0.14)",
          }}
        >
          <Text
            textTransform="capitalize"
            className="text-[11px] font-bold"
            style={{ color: "#a78bfa", fontVariant: ["tabular-nums"] }}
          >
            {pct}%
          </Text>
        </View>
      </View>

      <GradBar id={id} pct={pct} />
    </Animated.View>
  );
}

/* ───────────── calendar ───────────── */

const CELL = `${100 / 7}%`;

function DayCell({ d, alpha, minutes, future, today, selected, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        width: CELL,
        aspectRatio: 1,
        alignItems: "center",
        justifyContent: "center",
        opacity: future ? 0.25 : 1,
      }}
    >
      <View
        style={{
          width: "82%",
          aspectRatio: 1,
          borderRadius: 8,
          backgroundColor: today
            ? "rgba(236,111,142,0.35)"
            : selected
              ? "rgba(228,159,51,0.35)"
              : `rgba(228,159,51,${alpha})`,
          borderWidth: today ? 1.5 : 0,
          borderColor: today ? "#ec6f8e" : "transparent",
        }}
      >
        <Text
          textTransform="capitalize"
          className="text-center text-xs"
          style={{
            color: today || selected ? "#2a1500" : "#9d9da8",
            fontWeight: today ? "700" : "500",
          }}
        >
          {d}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function CalendarLegend() {
  return (
    <View
      style={{ flexDirection: "row", gap: 14, marginTop: 10, flexWrap: "wrap" }}
    >
      {[
        ["Today", "#ec6f8e"],
        ["Selected", "#e49f33"],
        ["Listened", "#e49f33"],
        ["Quiet", "#2a2838"],
      ].map(([label, color]) => (
        <View
          key={label}
          style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
        >
          <View
            style={{
              height: 8,
              width: 8,
              borderRadius: 4,
              backgroundColor: color,
            }}
          />
          <Text
            textTransform="capitalize"
            className="text-[10px] text-[#9d9da8]"
          >
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Calendar({
  onSelectDay,
  selectedDay,
  daysInMonth = 31,
  offset = 0,
  today = 1,
  minutes = [],
}) {
  return (
    <View>
      <View style={{ flexDirection: "row", marginBottom: 4 }}>
        {DN.map((d, i) => (
          <Text
            textTransform="capitalize"
            key={d}
            className="pb-1 text-center text-xs font-semibold uppercase"
            style={{
              width: CELL,
              letterSpacing: 1,
              color: i >= 5 ? "#e49f33" : "#9d9da8",
            }}
          >
            {d[0]}
          </Text>
        ))}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {Array.from({ length: offset }).map((_, i) => (
          <View key={`empty-${i}`} style={{ width: CELL, aspectRatio: 1 }} />
        ))}

        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
          const value = minutes[d] || 0;
          const future = d > today;
          const isToday = d === today;
          const alpha = value ? 0.2 + 0.8 * Math.min(1, value / 300) : 0;

          return (
            <DayCell
              key={d}
              d={d}
              alpha={alpha}
              minutes={value}
              future={future}
              today={isToday}
              selected={d === selectedDay}
              onPress={() => onSelectDay(d)}
            />
          );
        })}
      </View>

      <CalendarLegend />
    </View>
  );
}

/* ───────────── rank row ───────────── */

function RankRow({
  initials,
  gradient,
  rank,
  title,
  subtitle,
  value,
  pct,
  index,
}) {
  const [c1] = gradient ? gradient.split(",") : ["#555"];
  const hasIndex = typeof index === "number";
  const isFirst = hasIndex && index === 0;

  const [active, setActive] = useState(false);
  const scale = useSharedValue(1);
  const fill = useSharedValue(0);

  // bar fills in on mount, staggered per row
  useEffect(() => {
    fill.value = withDelay(
      (index ?? 0) * 90,
      withTiming(pct, {
        duration: 750,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [pct, index, fill]);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const barStyle = useAnimatedStyle(() => ({
    width: `${fill.value}%`,
  }));

  return (
    <Animated.View
      layout={LinearTransition.springify().damping(18)}
      style={[{ marginBottom: 12 }, pressStyle]}
    >
      <Pressable
        onPressIn={() => {
          // eslint-disable-next-line react-hooks/immutability
          scale.value = withSpring(0.97, { damping: 15, stiffness: 300 });
        }}
        onPressOut={() => {
          // eslint-disable-next-line react-hooks/immutability
          scale.value = withSpring(1, { damping: 12, stiffness: 260 });
        }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setActive((v) => !v);
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          padding: 10,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: active
            ? "rgba(228,159,51,0.35)"
            : "rgba(255,255,255,0.04)",
          backgroundColor: active
            ? "rgba(228,159,51,0.08)"
            : "rgba(255,255,255,0.025)",
        }}
      >
        {initials ? (
          <View>
            {/* soft colored ring around the avatar */}
            <View
              style={{
                padding: 2,
                borderRadius: 30,
                borderWidth: 1.5,
                borderColor: active ? c1 : `${c1}66`,
              }}
            >
              <View
                style={{
                  height: 46,
                  width: 46,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 23,
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
            </View>

            {/* rank badge */}
            {hasIndex ? (
              <View
                style={{
                  position: "absolute",
                  right: -4,
                  bottom: -2,
                  minWidth: 20,
                  height: 20,
                  paddingHorizontal: 4,
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isFirst ? AM : "#242230",
                  borderWidth: 2,
                  borderColor: "#13121a",
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "800",
                    includeFontPadding: false,
                    color: isFirst ? "#2a1500" : "#d6d4de",
                  }}
                >
                  {index + 1}
                </Text>
              </View>
            ) : null}
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

          {/* progress track with glowing knob */}
          <View
            style={{
              marginTop: 10,
              height: 6,
              borderRadius: 999,
              backgroundColor: "#242230",
            }}
          >
            <Animated.View
              style={[
                {
                  height: "100%",
                  borderRadius: 999,
                  backgroundColor: AM,
                },
                barStyle,
              ]}
            >
              <View
                style={{
                  position: "absolute",
                  right: -3,
                  top: -2,
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: "#fff",
                  borderWidth: 2,
                  borderColor: AM,
                  shadowColor: AM,
                  shadowOpacity: 0.9,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 0 },
                  elevation: 4,
                }}
              />
            </Animated.View>
          </View>

          {/* revealed on tap */}
          {active ? (
            <Animated.Text
              entering={FadeIn.duration(200)}
              className="mt-2 text-xs text-[#9d9da8]"
            >
              {Math.round(pct)}% of your most-played artist
            </Animated.Text>
          ) : null}
        </View>

        {/* value pill */}
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 999,
            minWidth: 44,
            alignItems: "center",
            backgroundColor: active
              ? "rgba(228,159,51,0.22)"
              : "rgba(228,159,51,0.12)",
          }}
        >
          <Text
            textTransform="capitalize"
            className="text-sm font-semibold"
            style={{
              color: AM,
              fontVariant: ["tabular-nums"],
              textAlign: "center",
            }}
          >
            {value}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
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

function FootStat({
  label,
  value,
  color = "#f2f2f5",
  icon = "pulse-outline",
  delay = 0,
}) {
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(400).springify().damping(16)}
      style={[{ flex: 1 }, pressStyle]}
    >
      <Pressable
        onPressIn={() => {
          // eslint-disable-next-line react-hooks/immutability
          scale.value = withSpring(0.95, { damping: 15, stiffness: 300 });
        }}
        onPressOut={() => {
          // eslint-disable-next-line react-hooks/immutability
          scale.value = withSpring(1, { damping: 12, stiffness: 260 });
        }}
        onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
        style={{
          alignItems: "center",
          overflow: "hidden",
          paddingVertical: 12,
          paddingHorizontal: 6,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.06)",
          backgroundColor: "#1b1a23",
        }}
      >
        {/* faint accent wash at the top */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -30,
            height: 60,
            width: 60,
            borderRadius: 30,
            backgroundColor: color,
            opacity: 0.1,
          }}
        />

        <View
          style={{
            height: 28,
            width: 28,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 9,
            backgroundColor: `${color}22`,
            borderWidth: 1,
            borderColor: `${color}33`,
          }}
        >
          <Ionicons name={icon} size={14} color={color} />
        </View>

        <Text
          textTransform="capitalize"
          className="mt-2 text-[10px] uppercase text-[#9d9da8]"
          style={{ fontFamily: MONO, letterSpacing: 1.2 }}
        >
          {label}
        </Text>
        <Text
          textTransform="capitalize"
          numberOfLines={1}
          adjustsFontSizeToFit
          className="mt-1 text-base font-bold"
          style={{ fontFamily: MONO, color, fontVariant: ["tabular-nums"] }}
        >
          {value}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/* ───────────── screen ───────────── */

export default function StatisticsScreen() {
  const layout = useLayout();
  const { insets, padX } = layout;
  const router = useRouter();
  const isFocused = useIsFocused();
  const goArtists = () => router.push("/artists");
  const stats = useStatistics();

  const onScroll = useHideTabBarOnScroll();

  const [range, setRange] = useState("Week");
  const [selectedDay, setSelectedDay] = useState(-1);
  const [genreIdx, setGenreIdx] = useState(0);
  const [calendarDay, setCalendarDay] = useState(stats.calendar.today);

  useEffect(() => {
    setCalendarDay(stats.calendar.today);
  }, [stats.calendar.today, stats.calendar.month, stats.calendar.year]);

  useEffect(() => {
    if (genreIdx >= stats.genres.length) setGenreIdx(0);
  }, [genreIdx, stats.genres.length]);

  const rangeData = stats.range[range];
  const dayHours = stats.dayHours;
  const GEN = stats.genres;
  const AUD = stats.quality;
  const TOP_ARTISTS = stats.topArtists;
  const TOP_SONGS = stats.topSongs;
  const TODAY = stats.calendar.today;
  const calendarValue = (d) => stats.calendar.minutes[d] || 0;
  const totalMinutes = rangeData.v.reduce((a, b) => a + b, 0) * 60;

  const clockData = useMemo(() => {
    const grid = stats.hourGrid;
    if (selectedDay < 0) {
      return grid[0].map((_, h) =>
        Math.round(grid.reduce((sum, row) => sum + row[h], 0) / 7),
      );
    }
    return grid[selectedDay] || Array(24).fill(0);
  }, [selectedDay, stats.hourGrid]);

  const peakHour = clockData.indexOf(Math.max(...clockData));

  const dailyValue =
    selectedDay < 0
      ? `${(dayHours.reduce((a, b) => a + b, 0) / 7).toFixed(1)}h`
      : `${(dayHours[selectedDay] || 0).toFixed(1)}h`;

  const monthShort = stats.calendar.monthLabel.split(" ")[0].slice(0, 3);
  const calendarMinutes = calendarValue(calendarDay);
  const calendarCaption =
    calendarDay > TODAY
      ? `${monthShort} ${calendarDay}: nothing yet`
      : `${monthShort} ${calendarDay}${calendarDay === TODAY ? " (today)" : ""}: ${
          calendarMinutes ? `${fmt(calendarMinutes)} of listening` : "no listening"
        }`;

  const genre = GEN[genreIdx] || GEN[0];

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
          <MusicHeader
            {...HEADER_CONTENT.statistics}
            goArtists={goArtists}
            active={isFocused}
          />

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
                note={rangeData.d}
                variant={rangeData.variant || "pos"}
              />

              <AreaChart
                id="tl"
                axis
                height={200}
                labels={rangeData.l}
                series={[
                  {
                    v: rangeData.v,
                    c: AM,
                    o: 0.4,
                    w: 2.6,
                    name: "This period",
                  },
                  {
                    v: rangeData.p,
                    c: VI,
                    o: 0.22,
                    w: 2,
                    dash: true,
                    name: "Previous",
                  },
                ]}
              />

              <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
                <FootStat
                  delay={0}
                  icon="speedometer-outline"
                  label="Avg / day"
                  value={rangeData.avg}
                />
                <FootStat
                  delay={70}
                  icon="trophy-outline"
                  label="Longest"
                  value={rangeData.longest}
                  color="#34d399"
                />
                <FootStat
                  delay={140}
                  icon="play-skip-forward-outline"
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
                delay={0}
                icon="sparkles-outline"
                title="Discoveries"
                subtitle="New songs / week"
                value={stats.discoveriesValue}
                note={stats.discoveriesNote}
                variant="pos"
              >
                <AreaChart
                  id="ds"
                  compact
                  height={56}
                  max={Math.max(1, ...stats.discoveries)}
                  series={[{ v: stats.discoveries, c: TL, o: 0.25, w: 2 }]}
                />
              </MiniCard>

              <MiniCard
                delay={70}
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
                delay={140}
                icon="play-skip-forward-outline"
                title="Skips"
                subtitle="Skipped early"
                value={stats.skipRate}
                note={stats.skipNote}
                variant="neg"
              >
                <AreaChart
                  id="sk"
                  compact
                  height={56}
                  max={Math.max(1, ...stats.skips)}
                  series={[{ v: stats.skips, c: "#fb7185", o: 0.3, w: 1.8 }]}
                />
              </MiniCard>

              <MiniCard
                delay={210}
                icon="musical-notes-outline"
                title="Audio quality"
                subtitle="Stream mix"
                value={stats.qualityValue}
                note={stats.qualityNote}
                variant="pur"
              >
                <QualityRow
                  index={0}
                  id="q0"
                  label={AUD[0][0]}
                  pct={AUD[0][1]}
                />
                <QualityRow
                  index={1}
                  id="q1"
                  label={AUD[1][0]}
                  pct={AUD[1][1]}
                />
                <QualityRow
                  index={2}
                  id="q2"
                  label={AUD[2][0]}
                  pct={AUD[2][1]}
                />
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

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  marginTop: 12,
                  marginBottom: 10,
                }}
              >
                <Text
                  textTransform="capitalize"
                  className="text-[11px] uppercase text-[#9d9da8]"
                  style={{ fontFamily: MONO, letterSpacing: 1.4 }}
                >
                  Genre breakdown
                </Text>
                <View
                  style={{
                    flex: 1,
                    height: 1,
                    backgroundColor: "rgba(255,255,255,0.06)",
                  }}
                />
                <Text
                  className="text-[11px] text-[#9d9da8]"
                  style={{ fontFamily: MONO }}
                >
                  {GEN.length} genres
                </Text>
              </View>

              {GEN.map(([label, pct, color, plays], i) => (
                <GenreRow
                  key={label}
                  index={i}
                  max={Math.max(...GEN.map((g) => g[1]))}
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
                subtitle={stats.calendar.monthLabel}
              />

              <Calendar
                onSelectDay={setCalendarDay}
                selectedDay={calendarDay}
                daysInMonth={stats.calendar.daysInMonth}
                offset={stats.calendar.offset}
                today={TODAY}
                minutes={stats.calendar.minutes}
              />

              {/* caption: re-animates whenever the selected day changes */}
              <Animated.View
                key={calendarDay}
                entering={FadeIn.duration(250)}
                style={{
                  marginTop: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: "rgba(228,159,51,0.22)",
                  backgroundColor: "rgba(228,159,51,0.07)",
                }}
              >
                <View
                  style={{
                    height: 32,
                    width: 32,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 10,
                    backgroundColor: "rgba(228,159,51,0.16)",
                  }}
                >
                  <Ionicons
                    name={
                      calendarDay > TODAY
                        ? "hourglass-outline"
                        : calendarValue(calendarDay)
                          ? "musical-notes-outline"
                          : "moon-outline"
                    }
                    size={16}
                    color="#e49f33"
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text
                    textTransform="capitalize"
                    className="text-sm font-semibold text-[#f2f2f5]"
                  >
                    {calendarCaption}
                  </Text>

                  {calendarDay <= TODAY && calendarValue(calendarDay) ? (
                    <View
                      style={{
                        marginTop: 8,
                        height: 4,
                        borderRadius: 999,
                        backgroundColor: "#242230",
                        overflow: "hidden",
                      }}
                    >
                      <View
                        style={{
                          height: "100%",
                          width: `${Math.min(1, calendarValue(calendarDay) / 300) * 100}%`,
                          borderRadius: 999,
                          backgroundColor: "#e49f33",
                        }}
                      />
                    </View>
                  ) : null}
                </View>
              </Animated.View>
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
                {/* hero: repeat rate */}
                <Tappable
                  delay={0}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 16,
                    borderColor: "rgba(228,159,51,0.22)",
                  }}
                >
                  <CornerGlow accent={AM} />

                  <View>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <IconChip name="repeat-outline" accent={AM} />
                      <Text
                        textTransform="capitalize"
                        className="text-xs font-medium uppercase text-[#9d9da8]"
                        style={{ letterSpacing: 1.2 }}
                      >
                        Repeat rate
                      </Text>
                    </View>

                    <Text
                      textTransform="capitalize"
                      className="mt-2 text-4xl font-bold text-[#f2f2f5]"
                      style={{ fontVariant: ["tabular-nums"] }}
                    >
                      {`${stats.habits.repeatRate}%`}
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <GradBar
                      id="rep"
                      pct={stats.habits.repeatRate}
                      from={AM}
                      to={PK}
                    />
                    <Text
                      textTransform="capitalize"
                      numberOfLines={1}
                      className="mt-2 text-xs text-[#9d9da8]"
                    >
                      of plays are songs you replayed
                    </Text>
                  </View>
                </Tappable>

                <HabitTile
                  delay={80}
                  icon="musical-notes-outline"
                  accent="#e49f33"
                  label="Total listen"
                  value={String(stats.habits.totalPlays)}
                  note="plays so far"
                />
                <HabitTile
                  delay={140}
                  icon="eye-off-outline"
                  accent="#ec6f8e"
                  label="Never listened"
                  value={String(stats.habits.neverPlayed)}
                  note="downloaded, no plays"
                />
                <HabitTile
                  delay={200}
                  icon="calendar-outline"
                  accent="#7c9cff"
                  label="First listen"
                  value={stats.habits.firstListen}
                  note={stats.habits.firstTitle}
                  valueClass="text-sm"
                />
                <HabitTile
                  delay={260}
                  icon="time-outline"
                  accent="#5fd0a5"
                  label="Last listen"
                  value={stats.habits.lastListen}
                  note={stats.habits.lastTitle}
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

              {TOP_ARTISTS.length === 0 ? (
                <Text className="text-sm text-[#9d9da8]">No plays yet</Text>
              ) : null}

              {TOP_ARTISTS.map(([name, initials, hours, gradient], i) => (
                <View
                  key={name}
                  style={
                    i === TOP_ARTISTS.length - 1 ? { marginBottom: -12 } : null
                  }
                >
                  <RankRow
                    index={i}
                    initials={initials}
                    gradient={gradient}
                    title={name}
                    value={`${hours}h`}
                    pct={
                      TOP_ARTISTS[0][2]
                        ? (hours / TOP_ARTISTS[0][2]) * 100
                        : 0
                    }
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

              {TOP_SONGS.length === 0 ? (
                <Text className="text-sm text-[#9d9da8]">No plays yet</Text>
              ) : null}

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
                    pct={TOP_SONGS[0][2] ? (plays / TOP_SONGS[0][2]) * 100 : 0}
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
