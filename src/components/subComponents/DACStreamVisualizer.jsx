import React, {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useIsFocused } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

/* ------------------------------------------------------------------ */
/* Constants (module scope: allocated once)                            */
/* ------------------------------------------------------------------ */

const FONT = {
  light: "Outfit_300Light",
  semi: "Outfit_600SemiBold",
};

const ACCENT = "#ff2d55";
const AREA_H = 112; // height of the bar area
const FOOT_H = 34; // axis labels below the baseline
const SPEC_H = AREA_H + FOOT_H;
const MIN_BAR = 14;
const BAR_W = 14;
const FRAME_MS = 1000 / 30; // spectrum is computed at ~30 fps to save battery
const SETTLE_MS = 1100; // time for bars to settle after pausing

// Relative heights per band (Sub ... Air), scaled to the bar area.
const BAND_MAX = [48, 42, 46, 40, 36, 44, 52, 46, 38, 42, 40, 48];
const MAXH = BAND_MAX.map((m) => (m / 52) * AREA_H);
const BARS = BAND_MAX.map((_, i) => i);
const START = MAXH.map((m) => m * 0.5);
const STATIC_FRAME = MAXH.map((m, i) => m * (0.35 + 0.4 * Math.abs(Math.sin(i * 0.9))));

const BAR_GRADIENT = ["rgba(243,242,238,0.96)", "rgba(243,242,238,0.28)"];

const PANEL = {
  bgLight: "#0e0f13",
  bgDark: "#111218",
  fg: "#f3f2ee",
  mute: "#8b909c",
  line: "rgba(255,255,255,0.08)",
  grid: "rgba(255,255,255,0.05)",
};

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

// Single gate: screen focused + app foregrounded + `active` prop.
function useIsActive(flag = true) {
  const focused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === "active");

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) =>
      setAppActive(s === "active"),
    );
    return () => sub.remove();
  }, []);

  return flag && focused && appActive;
}

// While inactive, keep returning the last value seen while active. The ref is
// only a render-cache — written after paint, never during render.
function useWhileActive(value, active) {
  const ref = useRef(value);
  useEffect(() => {
    if (active) ref.current = value;
  }, [active, value]);
  // eslint-disable-next-line react-hooks/refs
  return ref.current;
}

const haptic = () => {
  try {
    Haptics.selectionAsync().catch(() => {});
  } catch {
    // unsupported device
  }
};

/* ------------------------------------------------------------------ */
/* Spectrum: computed on the UI thread, zero React re-renders per frame */
/* ------------------------------------------------------------------ */

function useSpectrum({ playing, active, reduceMotion, jitter }) {
  const cur = useSharedValue(START);
  const pk = useSharedValue(START);
  const timeSV = useSharedValue(0);
  const stepSV = useSharedValue(0);
  const accSV = useSharedValue(0);
  const playingSV = useSharedValue(playing);
  const jitterSV = useSharedValue(jitter);

  // Jitter changes never restart anything; the worklet just reads the new value.
  useEffect(() => {
    jitterSV.value = jitter;
  }, [jitter, jitterSV]);

  const frame = useFrameCallback((info) => {
    "worklet";
    // throttle to ~30 fps
    const dtRaw = info.timeSincePreviousFrame ?? 16.7;
    accSV.value += dtRaw;
    if (accSV.value < FRAME_MS * 0.9) return;
    const dt = Math.min(64, accSV.value);
    accSV.value = 0;

    const k = dt / 33.3;
    const isPlay = playingSV.value;
    let time = timeSV.value;
    let step = stepSV.value;
    if (isPlay) {
      time += 0.08 * k;
      step += k;
      timeSV.value = time;
      stepSV.value = step;
    }

    const c = cur.value;
    const p = pk.value;
    const jit = jitterSV.value;
    const f = 1 - Math.pow(0.5, k);
    const nc = [];
    const np = [];

    for (let i = 0; i < MAXH.length; i += 1) {
      const mx = MAXH[i];
      let target;
      if (isPlay) {
        const w1 = Math.sin(time * 3 + i * 0.7) * 0.35;
        const w2 = Math.cos(time * 5.2 - i * 0.4) * 0.25;
        const rh = Math.floor(step) % (i % 2 === 0 ? 10 : 14) === 0 ? 0.4 : 0;
        const nz = (Math.random() - 0.5) * (jit * 0.18);
        target = mx * Math.max(0.18, Math.min(1, 0.4 + w1 + w2 + rh + nz));
      } else {
        target = mx * 0.12;
      }
      const v = c[i] + (target - c[i]) * f;
      let peak = p[i];
      if (v > peak) peak = v;
      else peak = Math.max(v, peak - (isPlay ? 0.9 : 2.4) * k);
      nc.push(v);
      np.push(peak);
    }

    cur.value = nc;
    pk.value = np;
  }, false);

  // Start/stop the frame loop. Hidden screen: stop now. Paused by the user:
  // keep running just long enough for the bars to settle, then stop.
  useEffect(() => {
    // `playingSV`, `cur`, `pk`, `accSV` are stable shared values mutated on
    // the UI thread inside an effect — not React state, so the compiler's
    // immutability flag is a false positive.
    // eslint-disable-next-line react-hooks/immutability
    playingSV.value = playing;

    if (reduceMotion) {
      frame.setActive(false);
      // eslint-disable-next-line react-hooks/immutability
      cur.value = STATIC_FRAME;
      // eslint-disable-next-line react-hooks/immutability
      pk.value = STATIC_FRAME;
      return undefined;
    }
    if (!active) {
      frame.setActive(false);
      return undefined;
    }
    if (playing) {
      // eslint-disable-next-line react-hooks/immutability
      accSV.value = 0;
      frame.setActive(true);
      return undefined;
    }
    frame.setActive(true);
    const timer = setTimeout(() => frame.setActive(false), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [playing, active, reduceMotion, frame, playingSV, accSV, cur, pk]);

  return { cur, pk };
}

const Capsule = memo(function Capsule({ index, cur }) {
  const style = useAnimatedStyle(() => ({
    height: Math.max(MIN_BAR, cur.value[index]),
  }));
  return (
    <Animated.View style={[styles.cap, style]}>
      <LinearGradient colors={BAR_GRADIENT} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
});

const PeakDot = memo(function PeakDot({ index, pk }) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -(pk.value[index] + 8) }],
  }));
  return <Animated.View style={[styles.peak, style]} />;
});

const Spectrum = memo(function Spectrum({ cur, pk }) {
  return (
    <View style={styles.specBody} pointerEvents="none">
      <View style={[styles.gridLine, { top: AREA_H * 0.25 }]} />
      <View style={[styles.gridLine, { top: AREA_H * 0.5 }]} />
      <View style={[styles.gridLine, { top: AREA_H * 0.75 }]} />

      <View style={styles.bars}>
        {BARS.map((i) => (
          <View key={i} style={styles.col}>
            <Capsule index={i} cur={cur} />
            <PeakDot index={i} pk={pk} />
          </View>
        ))}
      </View>

      <View style={styles.baseline} />
      <View style={styles.axis}>
        <Text style={styles.axisText}>Sub</Text>
        <Text style={styles.axisText}>Mid</Text>
        <Text style={styles.axisText}>Air</Text>
      </View>
    </View>
  );
});

/* ------------------------------------------------------------------ */
/* Live dot: the ping ring exists (and loops) only while streaming     */
/* ------------------------------------------------------------------ */

const PingRing = memo(function PingRing() {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = 0;
    p.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
    return () => cancelAnimation(p);
  }, [p]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.6 * (1 - p.value),
    transform: [{ scale: 1 + 2.2 * p.value }],
  }));
  return <Animated.View pointerEvents="none" style={[styles.ping, style]} />;
});

/* ------------------------------------------------------------------ */
/* DAC stream banner                                                   */
/* ------------------------------------------------------------------ */

export const AcousticDacStream = memo(function AcousticDacStream({
  sampleRate = "DSD 5.6 MHz",
  headroom = 4.2,
  jitter = 0.8,
  isPlaying, // optional: controlled. Leave undefined for uncontrolled (starts playing)
  active = true,
  onToggle,
}) {
  const isActive = useIsActive(active);
  const reduceMotion = useReducedMotion();
  const dark = useColorScheme() === "dark";

  // Lazy mount: the spectrum is not built until the banner has been visible once.
  // State, not a ref — the Spectrum mount branch reads it during render, so it
  // must trigger a re-render the moment the banner becomes visible.
  const [everActive, setEverActive] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isActive) setEverActive(true);
  }, [isActive]);

  // Readout values frozen while off-screen.
  const live = useWhileActive({ sampleRate, headroom, jitter }, isActive);

  const [internal, setInternal] = useState(true);
  const playing = isPlaying ?? internal;
  // Live refs: read only inside the toggle callback, never during render.
  const playingRef = useRef(playing);
  const onToggleRef = useRef(onToggle);
  useEffect(() => {
    playingRef.current = playing;
    onToggleRef.current = onToggle;
  }, [playing, onToggle]);

  const { cur, pk } = useSpectrum({
    playing,
    active: isActive,
    reduceMotion,
    jitter: live.jitter,
  });

  const toggle = useCallback(() => {
    const next = !playingRef.current;
    haptic();
    setInternal(next);
    onToggleRef.current?.(next);
  }, []);

  const streaming = playing && !reduceMotion;
  const stateText = reduceMotion ? "Streaming" : playing ? "Streaming" : "Paused";

  return (
    <View
      style={[
        styles.panel,
        { backgroundColor: dark ? PANEL.bgDark : PANEL.bgLight },
      ]}
    >
      {/* Header */}
      <View style={styles.top}>
        <View style={styles.ttl}>
          <View style={[styles.liveWrap, { opacity: playing ? 1 : 0.35 }]}>
            {streaming && isActive ? <PingRing /> : null}
            <View style={styles.live} />
          </View>
          <Text numberOfLines={1} style={styles.title}>
            Acoustic DAC stream
          </Text>
        </View>
        <View style={styles.rate}>
          <Text style={styles.rateText}>{live.sampleRate}</Text>
        </View>
      </View>
      <Text style={styles.state} accessibilityLiveRegion="polite">
        {stateText}
      </Text>

      {/* Spectrum */}
      <Pressable
        onPress={toggle}
        disabled={reduceMotion}
        accessibilityRole="button"
        accessibilityLabel="Spectrum"
        accessibilityHint={playing ? "Double tap to pause the stream" : "Double tap to resume the stream"}
        accessibilityState={{ selected: playing }}
        style={styles.spec}
      >
        {everActive ? <Spectrum cur={cur} pk={pk} /> : null}
      </Pressable>

      {/* Readouts */}
      <View style={styles.read}>
        <View style={styles.cell}>
          <Text style={styles.cellValue}>+{live.headroom.toFixed(1)} dB</Text>
          <Text style={styles.cellLabel}>Headroom</Text>
        </View>
        <View style={[styles.cell, styles.cellDivider]}>
          <Text style={styles.cellValue}>{"< "}{live.jitter.toFixed(1)} ps</Text>
          <Text style={styles.cellLabel}>Jitter, RMS</Text>
        </View>
      </View>
    </View>
  );
});

/* ------------------------------------------------------------------ */
/* Section wrapper: <DACStreamVisualizer active={isVisible} />          */
/* Renders just the banner (no ScrollView / safe-area wrapper), so it  */
/* can sit inside any screen.                                          */
/* ------------------------------------------------------------------ */

function DACStreamVisualizer({ active = true, ...props }) {
  return <AcousticDacStream active={active} {...props} />;
}

export default memo(DACStreamVisualizer);

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  panel: {
    width: "100%",
    borderRadius: 32,
    paddingTop: 22,
    paddingHorizontal: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: PANEL.line,
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },

  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  ttl: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  liveWrap: { width: 9, height: 9, alignItems: "center", justifyContent: "center" },
  live: { width: 9, height: 9, borderRadius: 5, backgroundColor: ACCENT },
  ping: {
    position: "absolute",
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: ACCENT,
  },
  title: {
    flexShrink: 1,
    color: PANEL.fg,
    fontFamily: FONT.semi,
    fontSize: 17,
    letterSpacing: -0.35,
  },
  rate: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PANEL.line,
    justifyContent: "center",
  },
  rateText: { color: PANEL.mute, fontFamily: FONT.light, fontSize: 13 },
  state: {
    marginTop: 6,
    marginLeft: 19,
    color: PANEL.mute,
    fontFamily: FONT.light,
    fontSize: 13,
  },

  spec: { height: SPEC_H, marginTop: 18 },
  specBody: { ...StyleSheet.absoluteFillObject },
  gridLine: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: PANEL.grid },
  bars: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: AREA_H,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 4,
  },
  col: { flex: 1, height: AREA_H, alignItems: "center", justifyContent: "flex-end" },
  cap: { width: BAR_W, borderRadius: BAR_W / 2, overflow: "hidden" },
  peak: {
    position: "absolute",
    bottom: 0,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: ACCENT,
  },
  baseline: { position: "absolute", left: 0, right: 0, top: AREA_H, height: 1, backgroundColor: PANEL.line },
  axis: {
    position: "absolute",
    left: 4,
    right: 4,
    top: AREA_H + 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  axisText: { color: PANEL.mute, fontFamily: FONT.light, fontSize: 12 },

  read: {
    flexDirection: "row",
    marginTop: 14,
    marginHorizontal: -22,
    borderTopWidth: 1,
    borderTopColor: PANEL.line,
  },
  cell: { flex: 1, paddingTop: 16, paddingBottom: 18, paddingHorizontal: 22 },
  cellDivider: { borderLeftWidth: 1, borderLeftColor: PANEL.line },
  cellValue: { color: PANEL.fg, fontFamily: FONT.light, fontSize: 26, letterSpacing: -0.8 },
  cellLabel: { marginTop: 5, color: PANEL.mute, fontFamily: FONT.light, fontSize: 13 },
});