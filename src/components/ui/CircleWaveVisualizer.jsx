import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "expo-router";
import Svg, { Circle } from "react-native-svg";
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
} from "react-native-reanimated";

/**
 * WaveVisualizer: concentric groove rings with a ripple of light.
 *
 * Twenty thin rings sit around an empty centre. Each ring is a spring joined
 * to its neighbours, so a kick at the centre travels outward through the rings,
 * bunching and lighting them as it passes, then fades at the edge.
 *
 * The whole simulation runs on the UI thread (useFrameCallback), so React
 * never re-renders while it animates. Meant for a dark surface.
 *
 * Props
 *  - playing      boolean  beat-driven ripples (default false = calm)
 *  - level        number   OPTIONAL real audio level 0..1, replaces the built-in beat
 *  - bpm          number   tempo of the built-in beat (default 110)
 *  - energy       number   overall strength, 1 = normal
 *  - size         number   width/height in px (default 300)
 *  - label, value string   centre text (trailing letters of value become a small unit)
 *  - interactive  boolean  touch / drag sends a ripple (default true)
 *  - active       boolean  pass your visibility flag (default true)
 */

/* ------------------------------------------------------------------ */
/* Constants (module scope: allocated once)                            */
/* ------------------------------------------------------------------ */

const FONT = { thin: "Outfit_200ExtraLight", light: "Outfit_300Light" };

const M = 20; // rings
const RINGS = Array.from({ length: M }, (_, i) => i);

// Wave along the radius: c = speed, k = pull to rest, d = damping
const WC = 0.07;
const WK = 0.002;
const WD = 0.012;
const ABSORB_FROM = M - 6; // outer rings soak up the wave

const VIS_STEP = 1 / 30; // rings are redrawn at ~30 fps
const PHYS_STEP = 1 / 60; // physics always runs at 60 Hz
const POKE_GAP_MS = 45;

const INK = "#f3f2ee";
const MUTE = "#8b909c";
const ACCENT = "#ff2d55";

const ZERO = new Array(M).fill(0);
const STATIC_FRAME = Array.from(
  { length: M },
  (_, j) => 0.55 * Math.exp(-((j - 3) * (j - 3)) / 9) * Math.cos(j * 0.6),
);

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/* ------------------------------------------------------------------ */
/* Worklet helpers (run on the UI thread, mutate local copies only)    */
/* ------------------------------------------------------------------ */

function push(v, j0, str, w) {
  "worklet";
  const reach = Math.ceil(w * 3);
  const c = Math.round(j0);
  for (let d = -reach; d <= reach; d += 1) {
    const i = c + d;
    if (i >= 0 && i < M) v[i] += str * Math.exp(-(d * d) / (2 * w * w));
  }
}

function stepPhysics(h, v) {
  "worklet";
  for (let j = 0; j < M; j += 1) {
    const l = j === 0 ? h[1] : h[j - 1];
    const r = j === M - 1 ? 0 : h[j + 1];
    const damp = WD + (j > ABSORB_FROM ? (j - ABSORB_FROM) * 0.028 : 0);
    v[j] += WC * (l + r - 2 * h[j]) - WK * h[j] - damp * v[j];
  }
  for (let j = 0; j < M; j += 1) {
    h[j] += v[j];
    if (h[j] > 2) h[j] = 2;
    else if (h[j] < -2) h[j] = -2;
  }
}

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

/* ------------------------------------------------------------------ */
/* Simulation: one frame callback, everything on the UI thread         */
/* ------------------------------------------------------------------ */

function useRippleEngine({ playing, level, bpm, energy, running, reduceMotion }) {
  const hSV = useSharedValue(ZERO);
  const vSV = useSharedValue(ZERO);
  const view = useSharedValue(ZERO); // what the rings actually read (~30 fps)
  const bassView = useSharedValue(0);

  const bassSV = useSharedValue(0);
  const beatT = useSharedValue(0);
  const bar = useSharedValue(0);
  const breathT = useSharedValue(0);
  const prevLevel = useSharedValue(0);
  const phys = useSharedValue(0); // physics time accumulator
  const vis = useSharedValue(0); // visual time accumulator

  const playingSV = useSharedValue(playing);
  const levelSV = useSharedValue(typeof level === "number" ? level : -1);
  const bpmSV = useSharedValue(bpm);
  const energySV = useSharedValue(energy);
  const pokeSV = useSharedValue({ id: 0, j: 0, str: 0, w: 1 });
  const pokeSeen = useSharedValue(0);

  // Prop changes never restart anything; the worklet reads the new values.
  useEffect(() => {
    playingSV.value = playing;
    levelSV.value = typeof level === "number" ? Math.min(1, Math.max(0, level)) : -1;
    bpmSV.value = bpm;
    energySV.value = energy;
  }, [playing, level, bpm, energy, playingSV, levelSV, bpmSV, energySV]);

  const frame = useFrameCallback((info) => {
    "worklet";
    const dt = Math.min(0.05, (info.timeSincePreviousFrame ?? 16.7) / 1000);
    const h = hSV.value.slice();
    const v = vSV.value.slice();
    const e = energySV.value;
    let bass = bassSV.value;

    // touch impulse (latest one since the previous frame)
    const pk = pokeSV.value;
    if (pk.id !== pokeSeen.value) {
      pokeSeen.value = pk.id;
      push(v, pk.j, pk.str * e, pk.w);
    }

    if (playingSV.value) {
      const lvl = levelSV.value;
      if (lvl >= 0) {
        // follow a real audio level: a sudden rise is a beat
        const rise = lvl - prevLevel.value;
        prevLevel.value = lvl;
        if (rise > 0.08) {
          push(v, 1, (0.18 + 0.4 * lvl) * e, 1.6);
          bass = Math.min(1, lvl * 1.2);
        }
        if (Math.random() < dt * 20 * lvl) {
          push(v, 4 + Math.random() * 7, 0.07 * lvl * e, 1.2);
        }
      } else {
        // built-in beat: kick, snare, hats
        const eighth = 60 / bpmSV.value / 2;
        let t = beatT.value + dt;
        let b = bar.value;
        while (t >= eighth) {
          t -= eighth;
          b = (b + 1) % 8;
          const on = b % 2 === 0;
          const beat = b / 2;
          if (on && (beat === 0 || beat === 2)) {
            push(v, 1, 0.4 * e, 1.6);
            bass = 1;
          } else if (on) {
            push(v, 1.5, 0.2 * e, 1.3);
            bass = Math.max(bass, 0.4);
          } else if (Math.random() < 0.65) {
            push(v, 4 + Math.random() * 7, 0.07 * e, 1.2);
          }
        }
        beatT.value = t;
        bar.value = b;
      }
    } else {
      // calm: a faint pulse leaves the centre every few seconds
      const t = breathT.value + dt;
      if (t > 3.4) {
        breathT.value = 0;
        push(v, 1, 0.1 * e, 2.4);
      } else {
        breathT.value = t;
      }
    }

    // fixed 60 Hz physics, even if the frame time wobbles
    let acc = phys.value + dt;
    let n = 0;
    while (acc >= PHYS_STEP && n < 4) {
      stepPhysics(h, v);
      acc -= PHYS_STEP;
      n += 1;
    }
    phys.value = Math.min(acc, PHYS_STEP);

    bass *= Math.pow(0.9, dt * 60);
    hSV.value = h;
    vSV.value = v;
    bassSV.value = bass;

    // only push to the rings at ~30 fps
    const va = vis.value + dt;
    if (va >= VIS_STEP - 0.002) {
      vis.value = 0;
      view.value = h;
      bassView.value = bass;
    } else {
      vis.value = va;
    }
  }, false);

  // Run only while visible. Hidden screen or reduced motion: stop completely.
  useEffect(() => {
    if (reduceMotion) {
      frame.setActive(false);
      // `view` is a stable shared value; the compiler's immutability flag is a
      // false positive because this runs inside an effect.
      // eslint-disable-next-line react-hooks/immutability
      view.value = STATIC_FRAME;
      return;
    }
    frame.setActive(running);
  }, [running, reduceMotion, frame, view]);

  return { view, bassView, pokeSV };
}

/* ------------------------------------------------------------------ */
/* One ring: animated props only, never re-renders                     */
/* ------------------------------------------------------------------ */

const Ring = memo(function Ring({ index, view, c, R0, sp, A }) {
  const base = 0.36 - 0.24 * (index / (M - 1)); // quieter toward the outside
  const r0 = R0 + index * sp;

  const props = useAnimatedProps(() => {
    const hj = view.value[index];
    const e = Math.min(1, Math.abs(hj) * 1.7);
    const a = Math.min(1, base + e * 0.75);
    const m = hj > 0 ? e : 0; // crests warm toward the accent
    const R = Math.round(243 + 12 * m);
    const G = Math.round(242 - 197 * m);
    const B = Math.round(238 - 153 * m);
    return {
      r: Math.max(1, r0 + hj * A),
      strokeWidth: 1 + e * 1.1,
      stroke: `rgb(${R},${G},${B})`,
      strokeOpacity: a,
    };
  }, [r0, A, base]);

  return (
    <AnimatedCircle
      cx={c}
      cy={c}
      r={r0}
      fill="none"
      stroke={INK}
      strokeWidth={1}
      strokeOpacity={base}
      animatedProps={props}
    />
  );
});

/* ------------------------------------------------------------------ */
/* Centre value: counts up once, the first time it is visible          */
/* ------------------------------------------------------------------ */

const VALUE_RE = /^([^0-9]*)([\d,]+(?:\.\d+)?)(.*)$/;

const formatInt = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const CountValue = memo(function CountValue({ value, run, instant, fontSize }) {
  const m = useMemo(() => VALUE_RE.exec(String(value)), [value]);
  const target = m ? parseFloat(m[2].replace(/,/g, "")) : 0;
  const [n, setN] = useState(instant || !m ? target : 0);

  useEffect(() => {
    if (!m) return undefined;
    if (instant) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setN(target);
      return undefined;
    }
    if (!run) return undefined;
    const t0 = Date.now();
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / 1300);
      setN(target * (1 - Math.pow(1 - p, 3)));
      if (p >= 1) clearInterval(id);
    }, 33);
    return () => clearInterval(id);
  }, [run, instant, target, m]);

  if (!m) {
    return <Text style={[styles.value, { fontSize }]}>{String(value)}</Text>;
  }

  const [, prefix, , suffix] = m;
  return (
    <Text style={[styles.value, { fontSize, letterSpacing: -fontSize * 0.05 }]}>
      {prefix}
      {formatInt(n)}
      {suffix ? (
        <Text style={[styles.unit, { fontSize: fontSize * 0.44 }]}>{` ${suffix}`.trimEnd()}</Text>
      ) : null}
    </Text>
  );
});

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

function WaveVisualizer({
  playing = false,
  level,
  bpm = 110,
  energy = 1,
  size = 300,
  label = "Total hours",
  value = "12,340h",
  interactive = true,
  active = true,
}) {
  const isActive = useIsActive(active);
  const reduceMotion = useReducedMotion();
  const running = isActive && !reduceMotion;

  // Lazy mount: rings are not built until the component has been visible once.
  // State, not a ref — the SVG and CountValue branches both read it during
  // render, so it must trigger a re-render the moment the component becomes visible.
  const [everActive, setEverActive] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isActive) setEverActive(true);
  }, [isActive]);

  const { view, bassView, pokeSV } = useRippleEngine({
    playing,
    level,
    bpm,
    energy,
    running,
    reduceMotion,
  });

  const g = useMemo(() => {
    const R0 = size * 0.285;
    const R1 = size * 0.475;
    const sp = (R1 - R0) / (M - 1);
    return { c: size / 2, R0, sp, A: sp * 1.5 };
  }, [size]);

  /* touch: a ripple starts at the ring under the finger */
  const lastPoke = useRef(0);
  const counter = useRef(0);
  // `pokeSV` is a stable shared value mutated at gesture time (not render);
  // the compiler's immutability flag is a false positive here.
  const poke = useCallback(
    // eslint-disable-next-line react-hooks/immutability
    (e, first) => {
      if (!interactive || !running) return;
      const now = Date.now();
      if (!first && now - lastPoke.current < POKE_GAP_MS) return;
      lastPoke.current = now;

      const { locationX, locationY } = e.nativeEvent;
      const x = locationX - g.c;
      const y = locationY - g.c;
      const dist = Math.hypot(x, y);
      if (dist < g.R0 - 8) return; // ignore the empty centre

      const j = Math.min(M - 1, Math.max(0, (dist - g.R0) / g.sp));
      counter.current += 1;
      // eslint-disable-next-line react-hooks/immutability
      pokeSV.value = {
        id: counter.current,
        j,
        str: first ? 0.5 : 0.16,
        w: first ? 2 : 1.5,
      };
    },
    // `pokeSV` is a stable shared value; omitting it from deps avoids a
    // false-positive "modify after render" warning while keeping the callback
    // referentially stable. (Missing dep is intentional — pokeSV is stable.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [interactive, running, g],
  );
  const onTouchStart = useCallback((e) => poke(e, true), [poke]);
  const onTouchMove = useCallback((e) => poke(e, false), [poke]);

  const breathe = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + bassView.value * 0.03 }],
  }));

  const valueSize = Math.round(size * 0.15);
  const labelSize = Math.max(12, Math.round(size * 0.047));
  const boxStyle = useMemo(() => ({ width: size, height: size }), [size]);

  return (
    <View
      style={boxStyle}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${label} ${value}. Animated concentric rings.`}
    >
      {everActive ? (
        <Svg width={size} height={size} pointerEvents="none">
          {RINGS.map((i) => (
            <Ring key={i} index={i} view={view} c={g.c} R0={g.R0} sp={g.sp} A={g.A} />
          ))}
        </Svg>
      ) : null}

      {/* centre text */}
      <View pointerEvents="none" style={styles.centre}>
        <Animated.View style={[styles.centreInner, breathe]}>
          <View style={styles.labelRow}>
            <View style={[styles.dot, { opacity: playing ? 1 : 0 }]} />
            <Text style={[styles.label, { fontSize: labelSize }]}>{label}</Text>
          </View>
          <CountValue
            value={value}
            run={everActive}
            instant={reduceMotion}
            fontSize={valueSize}
          />
        </Animated.View>
      </View>
    </View>
  );
}

export default memo(WaveVisualizer);

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  centre: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  centreInner: { alignItems: "center" },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ACCENT },
  label: { color: MUTE, fontFamily: FONT.light },
  value: {
    marginTop: 4,
    color: INK,
    fontFamily: FONT.thin,
    includeFontPadding: false,
  },
  unit: { color: MUTE, fontFamily: FONT.light, letterSpacing: 0 },
});