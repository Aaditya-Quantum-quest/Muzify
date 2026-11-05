import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { View, Text } from "react-native";
import Svg, {
  Path,
  Circle,
  G,
  Defs,
  ClipPath,
  RadialGradient,
  Stop,
} from "react-native-svg";

// USE THIS

// import WaveVisualizer from "../../components/subComponents/WaveVisualizer";

// <WaveVisualizer playing={isPlaying} size={300} label="Total hours" value="12,340h" />

/**
 * WaveVisualizer
 * A ring of "water" that behaves like real waves: every point is a spring
 * joined to its two neighbours, so a push travels around the full 360 degrees,
 * bounces back and slowly dies out. Three rings with different wave speeds
 * are stacked and painted with a rotating red / cream / blue gradient.
 *
 * Props
 *  - playing      boolean  song is playing -> beat-driven waves (default false)
 *  - level        number   OPTIONAL real audio level 0..1. When given, the
 *                          waves follow it instead of the built-in beat.
 *  - bpm          number   tempo of the built-in beat (default 110)
 *  - energy       number   overall wave strength, 1 = normal (default 1)
 *  - size         number   width/height in px (default 300)
 *  - label        string   small text in the centre
 *  - value        string   big text in the centre
 *  - interactive  boolean  touch / drag pushes the water (default true)
 */

/* ───────────── physics constants ───────────── */

const N = 180; // points around the ring
const TAU = Math.PI * 2;
const WEDGES = 48; // colour slices used to fake a conic gradient

// c = wave speed, k = pull back to rest, d = damping
const LAYERS = [
  {
    c: 0.36,
    k: 0.0035,
    d: 0.016,
    amp: 1.0,
    rot: 0.0,
    rs: 0.1,
    shift: 0.0,
    op: 0.9,
  },
  {
    c: 0.28,
    k: 0.0055,
    d: 0.021,
    amp: 0.8,
    rot: 2.1,
    rs: -0.07,
    shift: 0.12,
    op: 0.65,
  },
  {
    c: 0.2,
    k: 0.0085,
    d: 0.028,
    amp: 0.62,
    rot: 4.2,
    rs: 0.05,
    shift: 0.27,
    op: 0.5,
  },
];

const PALETTE = [
  [0, [224, 69, 58]],
  [0.1, [239, 122, 78]],
  [0.2, [246, 217, 168]],
  [0.34, [255, 241, 214]],
  [0.45, [201, 182, 239]],
  [0.56, [111, 120, 234]],
  [0.68, [59, 42, 140]],
  [0.8, [36, 21, 64]],
  [0.9, [122, 36, 48]],
  [1, [224, 69, 58]],
];

const colorAt = (t) => {
  const u = ((t % 1) + 1) % 1;
  for (let i = 1; i < PALETTE.length; i++) {
    const [p1, c1] = PALETTE[i];
    if (u <= p1) {
      const [p0, c0] = PALETTE[i - 1];
      const f = (u - p0) / (p1 - p0 || 1);
      const ch = (k) => Math.round(c0[k] + (c1[k] - c0[k]) * f);
      return `rgb(${ch(0)},${ch(1)},${ch(2)})`;
    }
  }
  return "rgb(224,69,58)";
};

const mod = (i) => ((i % N) + N) % N;

const createEngine = () => ({
  layers: LAYERS.map(() => ({
    h: new Float32Array(N),
    v: new Float32Array(N),
  })),
  t: 0,
  beatT: 0,
  bar: 0,
  bass: 0,
  prevLevel: 0,
});

// gaussian push at an angle (radians, 0 = top, clockwise)
const push = (eng, angle, strength, width) => {
  const centre = Math.round(((((angle / TAU) % 1) + 1) % 1) * N);
  const reach = Math.ceil(width * 3);

  eng.layers.forEach((l, li) => {
    const scale = LAYERS[li].amp;
    for (let k = -reach; k <= reach; k++) {
      const i = mod(centre + k);
      l.v[i] += strength * scale * Math.exp(-(k * k) / (2 * width * width));
    }
  });
};

// lifts the whole ring at once (the "bass" breathing)
const swell = (eng, strength) => {
  eng.layers.forEach((l, li) => {
    for (let i = 0; i < N; i++) l.v[i] += strength * LAYERS[li].amp;
  });
};

const stepPhysics = (eng) => {
  eng.layers.forEach((l, li) => {
    const { c, k, d } = LAYERS[li];
    const { h, v } = l;

    for (let i = 0; i < N; i++) {
      const lap = h[mod(i - 1)] + h[mod(i + 1)] - 2 * h[i];
      v[i] += c * lap - k * h[i] - d * v[i];
    }
    for (let i = 0; i < N; i++) {
      h[i] += v[i];
      if (h[i] > 3) h[i] = 3;
      else if (h[i] < -3) h[i] = -3;
    }
  });
};

/* ───────────── drive: built-in beat / real audio / calm sea ───────────── */

const rand = (a = 1) => Math.random() * a;

const simulateBeat = (eng, dt, bpm, e) => {
  const eighth = 60 / bpm / 2;
  eng.beatT += dt;

  while (eng.beatT >= eighth) {
    eng.beatT -= eighth;
    eng.bar = (eng.bar + 1) % 16;

    const onBeat = eng.bar % 2 === 0;
    const beat = eng.bar / 2;

    if (
      onBeat &&
      (beat % 4 === 0 ||
        (beat % 4 === 2 && Math.random() < 0.4) ||
        (beat % 4 === 3 && Math.random() < 0.3))
    ) {
      swell(eng, 0.02 * e);
      push(eng, rand(TAU), 0.4 * e, 6);
      eng.bass = 1;
    }

    if (onBeat && (beat % 4 === 1 || (beat % 4 === 3 && eng.bar % 4 === 2))) {
      push(
        eng,
        Math.PI * (Math.random() < 0.5 ? 0.5 : 1.5) + rand(0.6),
        0.3 * e,
        5,
      );
    }

    if (!onBeat || Math.random() < 0.5) {
      for (let k = 0; k < 2; k++) push(eng, rand(TAU), 0.1 * e, 2.5);
    }

    if (eng.bar === 0 && Math.random() < 0.5) push(eng, rand(TAU), 0.6 * e, 10);
  }
};

const followLevel = (eng, dt, level, e) => {
  const rise = level - eng.prevLevel;
  eng.prevLevel = level;

  // sudden jump in loudness = a beat
  if (rise > 0.08) {
    swell(eng, 0.03 * level * e);
    push(eng, rand(TAU), (0.25 + 0.6 * level) * e, 6);
    eng.bass = Math.min(1, level * 1.2);
  }

  // continuous shimmer that grows with loudness
  if (Math.random() < dt * 24 * level)
    push(eng, rand(TAU), 0.1 * level * e, 2.5);
};

const calmSea = (eng, dt, e) => {
  const f = dt * 60;
  for (let s = 0; s < 2; s++) {
    push(eng, eng.t * (0.25 + s * 0.17) + s * 2.4, 0.012 * e * f, 7 + s * 3);
  }
  if (Math.random() < dt * 0.5) push(eng, rand(TAU), 0.09 * e, 7);
};

/* ───────────── drawing helpers ───────────── */

const blobPath = (h, R0, A, amp, c) => {
  const pts = new Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const r = R0 + h[i] * A * amp;
    pts[i] = [c + r * Math.sin(a), c - r * Math.cos(a)];
  }

  const f = (n) => n.toFixed(1);
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];

  const s = mid(pts[N - 1], pts[0]);
  let d = `M${f(s[0])},${f(s[1])}`;

  for (let i = 0; i < N; i++) {
    const p = pts[i];
    const e = mid(p, pts[(i + 1) % N]);
    d += `Q${f(p[0])},${f(p[1])} ${f(e[0])},${f(e[1])}`;
  }

  return `${d}Z`;
};

// static colour slices (memoised, so they are NOT rebuilt every frame)
const Wedges = memo(function Wedges({ size, shift }) {
  const c = size / 2;
  const R = size * 0.62;

  const pt = (a) =>
    `${(c + R * Math.sin(a)).toFixed(1)},${(c - R * Math.cos(a)).toFixed(1)}`;

  return (
    <>
      {Array.from({ length: WEDGES }, (_, k) => {
        const a0 = (k / WEDGES) * TAU - 0.01; // tiny overlap hides seams
        const a1 = ((k + 1) / WEDGES) * TAU + 0.01;

        return (
          <Path
            key={k}
            d={`M${c},${c}L${pt(a0)}A${R},${R} 0 0 1 ${pt(a1)}Z`}
            fill={colorAt((k + 0.5) / WEDGES + shift)}
          />
        );
      })}
    </>
  );
});

/* ───────────── component ───────────── */

export default function WaveVisualizer({
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
  const engine = useRef(null);
  useEffect(() => {
    if (!engine.current) engine.current = createEngine();
  }, []);

  const [uid] = useState(() => Math.random().toString(36).slice(2, 7));

  // latest props, read inside the animation loop. Updated in an effect so the
  // ref is never written during render (React forbids ref writes in render).
  const live = useRef({
    playing,
    level,
    bpm,
    energy,
    size,
  });

  useEffect(() => {
    live.current = {
      playing,
      level,
      bpm,
      energy,
      size,
    };
  }, [playing, level, bpm, energy, size]);
  // Render state is a snapshot pushed from the rAF loop, so the engine ref
  // is never read during render (React forbids ref reads in render).
  const [snap, setSnap] = useState({
    t: 0,
    bass: 0,
    paths: LAYERS.map(() => ""),
  });

  useEffect(() => {
    // Don't run any animation when the component is inactive.
    if (!active) {
      return undefined;
    }

    let raf = null;

    let last = 0;
    let lastUpdate = 0;

    const FRAME_INTERVAL = 1000 / 30;

    const loop = (timestamp) => {
      if (last === 0) {
        last = timestamp;
      }

      const elapsed = timestamp - lastUpdate;

      // Only perform expensive work at approximately 30 FPS.
      if (elapsed >= FRAME_INTERVAL) {
        const dt = Math.min(
          0.05,
          lastUpdate === 0 ? 1 / 30 : (timestamp - last) / 1000,
        );

        last = timestamp;
        lastUpdate = timestamp;

        const eng = engine.current;
        const p = live.current;

        const c = p.size / 2;
        const R0 = p.size * 0.33;
        const A = p.size * 0.042;

        eng.t += dt;

        if (p.playing) {
          if (typeof p.level === "number") {
            followLevel(eng, dt, p.level, p.energy);
          } else {
            simulateBeat(eng, dt, p.bpm, p.energy);
          }
        } else {
          calmSea(eng, dt, p.energy);
        }

        // Preserve the original water physics.
        stepPhysics(eng);
        stepPhysics(eng);

        eng.bass *= 0.9;

        // Generate SVG paths only when an update is needed.
        const paths = LAYERS.map((layer, i) =>
          blobPath(eng.layers[i].h, R0 * (1 - i * 0.035), A, layer.amp, c),
        );

        setSnap({
          t: eng.t,
          bass: eng.bass,
          paths,
        });
      }

      // Schedule the next frame.
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);

    // Cancel the animation when inactive or unmounted.
    return () => {
      if (raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
    };
  }, [active]);

  /* touch: push the water where the finger is */
  const poke = useCallback(
    (e, firstTouch) => {
      if (!interactive) return;

      const { locationX, locationY } = e.nativeEvent;
      const x = locationX - size / 2;
      const y = locationY - size / 2;

      if (Math.hypot(x, y) < size * 0.18) return; // ignore the centre disc

      const a = Math.atan2(x, -y);
      const eng = engine.current;
      const en = live.current.energy;

      push(eng, a, 0.18 * en, 5);
      if (firstTouch) {
        push(eng, a, 0.55 * en, 7);
        swell(eng, 0.01 * en);
      }
    },
    [interactive, size],
  );

  const c = size / 2;

  const discR = size * 0.255 * (1 + snap.bass * 0.025 * energy);
  const textScale = 1 + snap.bass * 0.04;

  const wedgeGroups = useMemo(
    () => LAYERS.map((L, i) => <Wedges key={i} size={size} shift={L.shift} />),
    [size],
  );

  const paths = snap.paths;
  const layerAngles = [2, 1, 0].map((i) => {
    const L = LAYERS[i];
    return ((L.rot + snap.t * L.rs) * 180) / Math.PI;
  });

  return (
    <View
      style={{ width: size, height: size }}
      onStartShouldSetResponder={() => interactive}
      onMoveShouldSetResponder={() => interactive}
      onResponderGrant={(e) => poke(e, true)}
      onResponderMove={(e) => poke(e, false)}
    >
      <Svg width={size} height={size} pointerEvents="none">
        <Defs>
          <RadialGradient id={`${uid}glow`} cx="50%" cy="50%" r="50%">
            <Stop offset="0.6" stopColor="#ec6f8e" stopOpacity={0.22} />
            <Stop offset="1" stopColor="#ec6f8e" stopOpacity={0} />
          </RadialGradient>

          {paths.map((d, i) => (
            <ClipPath key={i} id={`${uid}clip${i}`}>
              <Path d={d} />
            </ClipPath>
          ))}
        </Defs>

        {/* soft outer glow */}
        <Circle cx={c} cy={c} r={size * 0.5} fill={`url(#${uid}glow)`} />

        {/* back layer first, main layer on top */}
        {[2, 1, 0].map((i) => (
          <G key={i} clipPath={`url(#${uid}clip${i})`} opacity={LAYERS[i].op}>
            <G
              transform={[
                { translateX: c },
                { translateY: c },
                { rotate: `${layerAngles[i]}deg` },
                { translateX: -c },
                { translateY: -c },
              ]}
            >
              {wedgeGroups[i]}
            </G>
          </G>
        ))}

        {/* centre disc */}
        <Circle
          cx={c}
          cy={c}
          r={discR}
          fill="#1a0a10"
          stroke="rgba(255,220,200,0.12)"
          strokeWidth={1.5}
        />
      </Svg>

      {/* centre text */}
      <View
        pointerEvents="none"
        className="absolute inset-0 items-center justify-center"
      >
        <View
          className="items-center"
          style={{ transform: [{ scale: textScale }] }}
        >
          <Text
            className="text-[#b98b98]"
            style={{ fontSize: Math.max(11, size * 0.045) }}
          >
            {label}
          </Text>
          <Text
            className="mt-1 font-semibold text-[#f2f2f5]"
            style={{ fontSize: size * 0.13 }}
          >
            {value}
          </Text>
        </View>
      </View>
    </View>
  );
}
