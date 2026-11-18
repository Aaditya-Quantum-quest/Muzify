import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useIsFocused } from "expo-router";
import { getRecordingPermissionsAsync } from "expo-audio";
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
import { usePlayer } from "../../context/player-context";
import { getSetting } from "../../databases/queries/settings";
import { AUDIO_VISUALIZER_SETTING } from "../../services/audio/audioConfig";
import { playbackQueue } from "../../services/audio/PlaybackQueue";

/* ------------------------------------------------------------------ */
/* Constants (module scope: allocated once)                            */
/* ------------------------------------------------------------------ */

const FONT = {
  light: "Outfit_300Light",
  semi: "Outfit_600SemiBold",
};

const COLOR = {
  accent: "#ff2d55",
  bgLight: "#0e0f13",
  bgDark: "#0b0c0f",
  fg: "#f3f2ee",
  mute: "#8b909c",
  line: "rgba(255,255,255,0.08)",
  baseline: "rgba(255,255,255,0.14)",
  bar: "rgba(243,242,238,0.94)",
};

// Spectrum geometry
const BAND_COUNT = 20;
const AREA_H = 52; // bar area height
const SPEC_H = AREA_H + 4; // bar area + baseline
const BAR_W = 3;
const MIN_BAR = 3;
const PEAK_GAP = 5; // space between a bar and its peak tick

// Timing
const FRAME_MS = 1000 / 30; // spectrum runs at ~30 fps to save battery
const SETTLE_MS = 1100; // time for bars to settle after pausing
const PEAK_FALL = 0.45; // peak decay per frame while playing
const PEAK_DROP = 1.2; // peak decay per frame once paused

// Analysis
const ANALYSIS_SIZE = 256;
const MIN_BAND_BINS = 0.75; // keeps low bands from sampling the same bin
const PROBES_PER_BAND = 2;

// Per-band height ceilings: bass-weighted with a second mid-range lift.
const MAXH = Array.from({ length: BAND_COUNT }, (_, i) => {
  const x = i / BAND_COUNT;
  const shape = Math.min(
    1,
    0.16 +
      0.95 * Math.exp(-((x - 0.14) ** 2) / 0.05) +
      0.55 * Math.exp(-((x - 0.6) ** 2) / 0.08),
  );
  return AREA_H * (0.72 + 0.28 * shape);
});
const BARS = MAXH.map((_, i) => i);
const REST = MAXH.map((m) => m * 0.1);
const STATIC_FRAME = MAXH.map(
  (m, i) => m * (0.35 + 0.4 * Math.abs(Math.sin(i * 0.9))),
);

/* ------------------------------------------------------------------ */
/* Audio analysis (JS thread)                                          */
/* ------------------------------------------------------------------ */

// Window + Goertzel coefficients depend only on the frame size, so they are
// built once per size instead of on every audio callback.
const planCache = new Map();
const mono = new Float64Array(ANALYSIS_SIZE);

function getPlan(size) {
  let plan = planCache.get(size);
  if (plan) return plan;

  const hann = new Float64Array(size);
  for (let i = 0; i < size; i += 1) {
    hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  }

  // Band edges in (fractional) bins: logarithmic, but never narrower than
  // MIN_BAND_BINS so the lowest bars don't all read the same bin.
  const maxBin = size / 2;
  const edges = [1];
  for (let b = 1; b <= BAND_COUNT; b += 1) {
    edges.push(
      Math.max(edges[b - 1] + MIN_BAND_BINS, maxBin ** (b / BAND_COUNT)),
    );
  }

  // Goertzel accepts fractional frequencies: probe each band at a few points.
  const coeffs = new Float64Array(BAND_COUNT * PROBES_PER_BAND);
  for (let b = 0; b < BAND_COUNT; b += 1) {
    for (let p = 0; p < PROBES_PER_BAND; p += 1) {
      const bin =
        edges[b] + ((edges[b + 1] - edges[b]) * (p + 1)) / (PROBES_PER_BAND + 1);
      coeffs[b * PROBES_PER_BAND + p] = 2 * Math.cos((2 * Math.PI * bin) / size);
    }
  }

  plan = { hann, coeffs };
  planCache.set(size, plan);
  return plan;
}

function analyzeAudioSample(sample) {
  const channels = (sample?.channels ?? []).filter(
    (channel) => Array.isArray(channel?.frames) && channel.frames.length > 0,
  );
  if (!channels.length) return null;

  const frameCount = Math.min(...channels.map((c) => c.frames.length));
  const size = Math.min(ANALYSIS_SIZE, 2 ** Math.floor(Math.log2(frameCount)));
  if (size < 32) return null;

  const { hann, coeffs } = getPlan(size);
  const channelCount = channels.length;

  for (let i = 0; i < size; i += 1) {
    const frameIndex = Math.floor((i * frameCount) / size);
    let sum = 0;
    for (let c = 0; c < channelCount; c += 1) {
      sum += channels[c].frames[frameIndex] || 0;
    }
    mono[i] = (sum / channelCount) * hann[i];
  }

  const levels = new Array(BAND_COUNT);
  for (let band = 0; band < BAND_COUNT; band += 1) {
    let peakPower = 0;

    for (let p = 0; p < PROBES_PER_BAND; p += 1) {
      const coefficient = coeffs[band * PROBES_PER_BAND + p];
      let previous = 0;
      let beforePrevious = 0;
      for (let i = 0; i < size; i += 1) {
        const current = mono[i] + coefficient * previous - beforePrevious;
        beforePrevious = previous;
        previous = current;
      }
      const power =
        previous * previous +
        beforePrevious * beforePrevious -
        coefficient * previous * beforePrevious;
      if (power > peakPower) peakPower = power;
    }

    const rms = (Math.sqrt(peakPower) * 2.8) / size;
    const normalized = Math.min(1, (rms * 3.8) ** 0.72);
    levels[band] = REST[band] + normalized * (MAXH[band] - REST[band]);
  }

  return levels;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

// "96.0 kHz" -> { value: "96.0", unit: "kHz" }; "PCM" -> { value: "PCM", unit: "" }
function formatRate(sampleRate, sourceHz) {
  if (sampleRate != null) {
    const text = String(sampleRate).trim();
    const match = text.match(/^([\d.,]+)\s*(\S+)$/);
    return match
      ? { value: match[1], unit: match[2] }
      : { value: text, unit: "" };
  }
  return sourceHz > 0
    ? { value: (sourceHz / 1000).toFixed(1), unit: "kHz" }
    : { value: "PCM", unit: "" };
}

function haptic() {
  try {
    Haptics.selectionAsync().catch(() => {});
  } catch {
    // unsupported device
  }
}

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
// only a render-cache, written after paint and never during render.
function useWhileActive(value, active) {
  const ref = useRef(value);
  useEffect(() => {
    if (active) ref.current = value;
  }, [active, value]);
  // eslint-disable-next-line react-hooks/refs
  return ref.current;
}

/* ------------------------------------------------------------------ */
/* Spectrum: real PCM levels, smoothed on the UI thread                */
/* ------------------------------------------------------------------ */

function useSpectrum({ playing, active, reduceMotion }) {
  const cur = useSharedValue(REST);
  const pk = useSharedValue(REST);
  const target = useSharedValue(REST);
  const accSV = useSharedValue(0);
  const playingSV = useSharedValue(playing);

  const frame = useFrameCallback((info) => {
    "worklet";
    // throttle to ~30 fps
    accSV.value += info.timeSincePreviousFrame ?? 16.7;
    if (accSV.value < FRAME_MS * 0.9) return;
    const dt = Math.min(64, accSV.value);
    accSV.value = 0;

    const k = dt / 33.3;
    const f = 1 - Math.pow(0.5, k);
    const isPlay = playingSV.value;
    const c = cur.value;
    const p = pk.value;
    const levels = target.value;
    const fall = (isPlay ? PEAK_FALL : PEAK_DROP) * k;
    const nc = new Array(BAND_COUNT);
    const np = new Array(BAND_COUNT);

    for (let i = 0; i < BAND_COUNT; i += 1) {
      const goal = isPlay ? levels[i] : REST[i];
      const v = c[i] + (goal - c[i]) * f;
      nc[i] = v;
      np[i] = v > p[i] ? v : Math.max(v, p[i] - fall);
    }

    cur.value = nc;
    pk.value = np;
  }, false);

  // Hidden screen: stop now. Paused by the user: keep running just long
  // enough for the bars to settle, then stop.
  /* eslint-disable react-hooks/immutability -- shared values are mutated by design */
  useEffect(() => {
    playingSV.value = playing;
    target.value = REST;

    if (reduceMotion) {
      frame.setActive(false);
      cur.value = STATIC_FRAME;
      pk.value = STATIC_FRAME;
      return undefined;
    }
    if (!active) {
      frame.setActive(false);
      return undefined;
    }
    if (playing) {
      accSV.value = 0;
      frame.setActive(true);
      return undefined;
    }
    frame.setActive(true);
    const timer = setTimeout(() => frame.setActive(false), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [playing, active, reduceMotion, frame, playingSV, accSV, cur, pk, target]);
  /* eslint-enable react-hooks/immutability */

  return { cur, pk, target };
}

const Column = memo(function Column({ index, cur, pk }) {
  const capStyle = useAnimatedStyle(() => ({
    height: Math.max(MIN_BAR, cur.value[index]),
  }));
  const peakStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -(pk.value[index] + PEAK_GAP) }],
  }));
  return (
    <View style={styles.col}>
      <Animated.View style={[styles.cap, capStyle]} />
      <Animated.View style={[styles.peak, peakStyle]} />
    </View>
  );
});

const Spectrum = memo(function Spectrum({ cur, pk }) {
  return (
    <View style={styles.specBody} pointerEvents="none">
      <View style={styles.bars}>
        {BARS.map((i) => (
          <Column key={i} index={i} cur={cur} pk={pk} />
        ))}
      </View>
      <View style={styles.baseline} />
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
    opacity: 0.55 * (1 - p.value),
    transform: [{ scale: 1 + 2.2 * p.value }],
  }));
  return <Animated.View pointerEvents="none" style={[styles.ping, style]} />;
});

/* ------------------------------------------------------------------ */
/* DAC stream banner (compact)                                         */
/* ------------------------------------------------------------------ */

export const AcousticDacStream = memo(function AcousticDacStream({
  sampleRate,
  headroom = 4.2,
  jitter = 0.8,
  active = true,
  onToggle,
}) {
  const isActive = useIsActive(active);
  const reduceMotion = useReducedMotion();
  const dark = useColorScheme() === "dark";
  const { track, playing: playerPlaying, togglePlay } = usePlayer();
  const isPlaying = Boolean(track && playerPlaying);

  const [visualizerEnabled, setVisualizerEnabled] = useState(false);
  const [audioPermissionGranted, setAudioPermissionGranted] = useState(
    Platform.OS !== "android",
  );
  const [samplingSupported, setSamplingSupported] = useState(null);
  const [hasSample, setHasSample] = useState(false);
  const hasSampleRef = useRef(false);
  const lastAnalysisRef = useRef(0);

  useEffect(() => {
    if (!isActive) return;
    try {
      setVisualizerEnabled(getSetting(AUDIO_VISUALIZER_SETTING) === "true");
    } catch (error) {
      console.warn("[DACStreamVisualizer] setting lookup failed:", error);
      setVisualizerEnabled(false);
    }
  }, [isActive]);

  useEffect(() => {
    if (Platform.OS !== "android") {
      setAudioPermissionGranted(true);
      return undefined;
    }
    if (!isActive || !visualizerEnabled) {
      setAudioPermissionGranted(false);
      return undefined;
    }

    let mounted = true;
    getRecordingPermissionsAsync()
      .then(({ granted }) => {
        if (mounted) setAudioPermissionGranted(granted);
      })
      .catch((error) => {
        console.warn("[DACStreamVisualizer] permission lookup failed:", error);
        if (mounted) setAudioPermissionGranted(false);
      });
    return () => {
      mounted = false;
    };
  }, [isActive, visualizerEnabled]);

  const canSample =
    visualizerEnabled && (Platform.OS !== "android" || audioPermissionGranted);

  // Lazy mount: the spectrum is not built until the banner has been visible
  // once. State, not a ref, because the mount branch reads it during render.
  const [everActive, setEverActive] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isActive) setEverActive(true);
  }, [isActive]);

  // Readout values, frozen while off-screen.
  const sourceHz = Number(track?.sample_rate);
  const liveSource = useMemo(
    () => ({ rate: formatRate(sampleRate, sourceHz), headroom, jitter }),
    [sampleRate, sourceHz, headroom, jitter],
  );
  const live = useWhileActive(liveSource, isActive);

  const { cur, pk, target } = useSpectrum({
    playing: isPlaying && canSample && samplingSupported !== false,
    active: isActive,
    reduceMotion,
  });

  const handleAudioSample = useCallback(
    (sample) => {
      // Native samples can arrive faster than the display needs.
      const now = Date.now();
      if (now - lastAnalysisRef.current < FRAME_MS) return;
      lastAnalysisRef.current = now;

      const levels = analyzeAudioSample(sample);
      if (!levels) return;
      target.value = levels;
      if (!hasSampleRef.current) {
        hasSampleRef.current = true;
        setHasSample(true);
      }
    },
    [target],
  );

  useEffect(() => {
    hasSampleRef.current = false;
    setHasSample(false);
    setSamplingSupported(null);

    if (!isActive || !isPlaying || !canSample) return undefined;

    const player = playbackQueue.engine?.player;
    if (!player) {
      setSamplingSupported(false);
      return undefined;
    }

    let subscription;
    try {
      if (Platform.OS !== "web" && player.isAudioSamplingSupported === false) {
        setSamplingSupported(false);
        return undefined;
      }
      player.setAudioSamplingEnabled(true);
      if (player.isAudioSamplingSupported === false) {
        setSamplingSupported(false);
        player.setAudioSamplingEnabled(false);
        return undefined;
      }
      subscription = player.addListener("audioSampleUpdate", handleAudioSample);
      setSamplingSupported(true);
    } catch (error) {
      console.warn("[DACStreamVisualizer] audio sampling unavailable:", error);
      setSamplingSupported(false);
    }

    return () => {
      subscription?.remove();
      try {
        player.setAudioSamplingEnabled(false);
      } catch {
        // The player may have been released while the screen was inactive.
      }
    };
  }, [isActive, isPlaying, canSample, handleAudioSample]);

  const toggle = useCallback(() => {
    if (!track) return;
    haptic();
    togglePlay();
    onToggle?.(!isPlaying);
  }, [track, togglePlay, onToggle, isPlaying]);

  // Kept short so it always fits beside the title in the compact header.
  const stateText = !track
    ? "Ready"
    : !isPlaying
      ? "Paused"
      : !visualizerEnabled
        ? "Visualizer off"
        : !canSample
          ? "Access needed"
          : samplingSupported === false
            ? "No audio data"
            : hasSample
              ? reduceMotion
                ? "Playing"
                : "Live audio"
              : "Analyzing";
  const streaming =
    isPlaying && canSample && samplingSupported !== false && hasSample;

  return (
    <View
      style={[
        styles.panel,
        { backgroundColor: dark ? COLOR.bgDark : COLOR.bgLight },
      ]}
    >
      <View style={styles.body}>
        {/* Header */}
        <View style={styles.top}>
          <View style={styles.ttl}>
            <View style={[styles.liveWrap, { opacity: isPlaying ? 1 : 0.35 }]}>
              {streaming && isActive ? <PingRing /> : null}
              <View style={styles.live} />
            </View>
            <Text numberOfLines={1} style={styles.title}>
              Acoustic DAC stream
            </Text>
          </View>
          <Text
            numberOfLines={1}
            style={styles.state}
            accessibilityLiveRegion="polite"
          >
            {stateText}
          </Text>
        </View>

        {/* Sample rate + spectrum */}
        <View style={styles.hero}>
          <View style={styles.rate}>
            <View style={styles.rateRow}>
              <Text style={styles.rateValue}>{live.rate.value}</Text>
              {live.rate.unit ? (
                <Text style={styles.rateUnit}>{live.rate.unit}</Text>
              ) : null}
            </View>
            <Text style={styles.label}>Sample rate</Text>
          </View>

          <Pressable
            onPress={toggle}
            disabled={!track}
            accessibilityRole="button"
            accessibilityLabel={track ? `Spectrum for ${track.title}` : "Spectrum"}
            accessibilityHint={
              isPlaying ? "Double tap to pause playback" : "Double tap to play"
            }
            accessibilityState={{ selected: isPlaying, disabled: !track }}
            style={styles.spec}
          >
            {everActive ? <Spectrum cur={cur} pk={pk} /> : null}
          </Pressable>
        </View>
      </View>

      {/* Readouts */}
      <View style={styles.read}>
        <View style={styles.cell}>
          <Text style={styles.cellValue}>
            +{live.headroom.toFixed(1)}
            <Text style={styles.cellUnit}> dB</Text>
          </Text>
          <Text style={styles.cellLabel}>Headroom</Text>
        </View>
        <View style={[styles.cell, styles.cellDivider]}>
          <Text style={styles.cellValue}>
            <Text style={styles.cellUnit}>{"< "}</Text>
            {live.jitter.toFixed(1)}
            <Text style={styles.cellUnit}> ps</Text>
          </Text>
          <Text style={styles.cellLabel}>Jitter</Text>
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
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  body: { paddingTop: 18, paddingHorizontal: 20 },

  // Header
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  ttl: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minWidth: 0,
  },
  liveWrap: {
    width: 6,
    height: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  live: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLOR.accent },
  ping: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLOR.accent,
  },
  title: {
    flexShrink: 1,
    color: COLOR.fg,
    fontFamily: FONT.semi,
    fontSize: 11,
    letterSpacing: 1.76,
    textTransform: "uppercase",
  },
  state: {
    flexShrink: 0,
    color: COLOR.mute,
    fontFamily: FONT.light,
    fontSize: 11,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },

  // Sample rate + spectrum
  hero: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 20,
    marginTop: 16,
  },
  rate: { flexShrink: 0 },
  rateRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  rateValue: {
    color: COLOR.fg,
    fontFamily: FONT.light,
    fontSize: 48,
    lineHeight: 46,
    letterSpacing: -2.2,
    includeFontPadding: false,
    fontVariant: ["tabular-nums"],
  },
  rateUnit: {
    color: COLOR.mute,
    fontFamily: FONT.light,
    fontSize: 14,
    includeFontPadding: false,
  },
  label: {
    marginTop: 8,
    color: COLOR.mute,
    fontFamily: FONT.light,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },

  spec: { flex: 1, minWidth: 0, height: SPEC_H },
  specBody: { ...StyleSheet.absoluteFillObject },
  bars: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: AREA_H,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  col: { width: BAR_W, height: AREA_H, justifyContent: "flex-end" },
  cap: {
    width: BAR_W,
    borderRadius: BAR_W / 2,
    backgroundColor: COLOR.bar,
  },
  peak: {
    position: "absolute",
    bottom: 0,
    width: BAR_W,
    height: 2,
    borderRadius: 1,
    backgroundColor: COLOR.accent,
  },
  baseline: {
    position: "absolute",
    left: 0,
    right: 0,
    top: AREA_H + 2,
    height: 1,
    backgroundColor: COLOR.baseline,
  },

  // Readouts
  read: {
    flexDirection: "row",
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLOR.line,
  },
  cell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  cellDivider: { borderLeftWidth: 1, borderLeftColor: COLOR.line },
  cellValue: {
    color: COLOR.fg,
    fontFamily: FONT.light,
    fontSize: 17,
    letterSpacing: -0.35,
    fontVariant: ["tabular-nums"],
  },
  cellUnit: { color: COLOR.mute, fontSize: 12, letterSpacing: 0 },
  cellLabel: {
    color: COLOR.mute,
    fontFamily: FONT.light,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
});