import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { View, Text, TouchableOpacity, PanResponder, Image, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Svg, {
  Defs,
  LinearGradient as SvgGradient,
  Stop,
  Path,
  Circle,
} from "react-native-svg";
import {
  Play,
  Music,
  ArrowRight,
} from "lucide-react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

const ACCENT = "#f5b81c";
const BORDER_COLORS = ["#f5b81c", "#ff2d55"];
const BEAM_H = 84;
const BEAM_FPS = 30;
const BEAM_FRAME_MS = 1000 / BEAM_FPS;

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RISE_EASING = Easing.out(Easing.poly(4));
const BREATHE_EASING = Easing.inOut(Easing.sin);

const GLOW_STROKES = [
  { sw: 10, o: 0.08 },
  { sw: 6, o: 0.18 },
  { sw: 3.2, o: 0.45 },
];

const EQ_DURATIONS = [550, 700, 450, 620];

const QUALITY_STYLES = {
  "96kHz": { color: "#f5b81c", bg: "rgba(245,184,28,0.16)" },
  "24-Bit": { color: "#ff9f0a", bg: "rgba(255,159,10,0.16)" },
  Atmos: { color: "#c58bff", bg: "rgba(191,90,242,0.18)" },
  Lossless: { color: "#2dd4bf", bg: "rgba(45,212,191,0.15)" },
  FLAC: { color: "#6cc4ff", bg: "rgba(90,200,250,0.15)" },
};
const qualityStyle = (q) =>
  QUALITY_STYLES[q] || { color: "#ffffff", bg: "rgba(255,255,255,0.12)" };

const COVER_COLORS = [
  ["#4b2fd6", "#f5a623"],
  ["#ff5e62", "#ff9966"],
  ["#1e5bff", "#35c1ff"],
  ["#0f766e", "#34d399"],
  ["#a21caf", "#f472b6"],
  ["#6b4a00", "#e6a817"],
];

export const toSeconds = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 10000 ? Math.round(n / 1000) : Math.round(n);
};

export function songToMixTrack(song, extras = {}) {
  const format = String(extras.quality || song.file_format || "").toUpperCase();
  return {
    id: song.id,
    title: extras.title || song.title || "Unknown Title",
    artist: extras.artist || song.artist || "Unknown Artist",
    quality: format || "Lossless",
    duration: toSeconds(song.duration),
    explicit: !!extras.explicit,
    colors: extras.colors || COVER_COLORS[Math.abs(Number(song.id) || 0) % COVER_COLORS.length],
    Icon: extras.Icon || Music,
    artwork: extras.artwork ?? song.artwork_uri ?? null,
  };
}

const fmt = (s) => {
  const x = Math.max(0, Math.floor(s));
  return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, "0")}`;
};

function RiseView({ delay = 0, active = true, children }) {
  const v = useSharedValue(0);
  const started = useRef(false);

  useEffect(() => {
    if (!active || started.current) return;
    started.current = true;
    v.value = withDelay(
      delay * 1000,
      withTiming(1, { duration: 600, easing: RISE_EASING }),
    );
  }, [active, delay, v]);

  const style = useAnimatedStyle(() => ({
    opacity: v.value,
    transform: [{ translateY: (1 - v.value) * 14 }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

function gauss(x, c, s) {
  "worklet";
  return Math.exp(-((x - c) ** 2) / (2 * s * s));
}

function wave(x, t) {
  "worklet";
  const c1 = 0.5 + 0.1 * Math.sin(t * 0.7);
  const a1 = 0.55 + 0.45 * Math.sin(t * 2.1) ** 2;
  let y = a1 * gauss(x, c1, 0.07) * Math.sin((x - c1) * 38 + t * 5);

  const c2 = 0.27 + 0.05 * Math.sin(t * 0.9 + 1);
  y += 0.38 * gauss(x, c2, 0.1) * Math.sin((x - c2) * 30 + t * 4);

  const c3 = 0.74 + 0.06 * Math.sin(t * 0.6);
  y += 0.45 * gauss(x, c3, 0.11) * Math.sin((x - c3) * 26 - t * 3.6);

  y += 0.08 * Math.exp(-((x - 0.5) ** 2) / 0.18) * Math.sin(x * 60 + t * 7);
  return y;
}

function yAt(x, w, t) {
  "worklet";
  return BEAM_H / 2 - wave(x / w, t) * BEAM_H * 0.42;
}

function computeBeamFrame(w, t, pos, duration) {
  "worklet";
  const mid = BEAM_H / 2;
  if (!(w > 0)) {
    return { full: `M0 ${mid}`, bright: `M0 ${mid}`, x: 0, y: mid };
  }

  const prog = Math.min(Math.max(pos / duration, 0), 1) * w;
  const hasBright = prog > 0;
  const start = `M0 ${yAt(0, w, t).toFixed(1)}`;

  let full = start;
  let bright = hasBright ? start : `M0 ${mid}`;
  let brightOpen = hasBright;

  for (let x = 3; x < w; x += 3) {
    const seg = ` L${x} ${yAt(x, w, t).toFixed(1)}`;
    full += seg;
    if (brightOpen) {
      if (x < prog) {
        bright += seg;
      } else {
        bright += ` L${prog.toFixed(1)} ${yAt(prog, w, t).toFixed(1)}`;
        brightOpen = false;
      }
    }
  }

  full += ` L${w.toFixed(1)} ${yAt(w, w, t).toFixed(1)}`;
  if (brightOpen) {
    bright += ` L${prog.toFixed(1)} ${yAt(prog, w, t).toFixed(1)}`;
  }

  return { full, bright, x: prog, y: yAt(prog, w, t) };
}

function BeamStroke({ frame, field, ...rest }) {
  const animatedProps = useAnimatedProps(() => ({ d: frame.value[field] }));
  return (
    <AnimatedPath
      animatedProps={animatedProps}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    />
  );
}

function PlayHead({ frame }) {
  const haloProps = useAnimatedProps(() => ({
    cx: frame.value.x,
    cy: frame.value.y,
  }));
  const dotProps = useAnimatedProps(() => ({
    cx: frame.value.x,
    cy: frame.value.y,
  }));
  return (
    <>
      <AnimatedCircle
        animatedProps={haloProps}
        r={8}
        fill="#78e1ff"
        opacity={0.25}
      />
      <AnimatedCircle animatedProps={dotProps} r={3.2} fill="#ffffff" />
    </>
  );
}

let beamUid = 0;

const Beam = memo(function Beam({ position, duration, onSeek, active = true }) {
  const [w, setW] = useState(0);
  const wRef = useRef(0);
  const startXRef = useRef(null);
  const fadeId = useRef(`beamFade-${++beamUid}`).current;

  const widthSV = useSharedValue(0);
  const time = useSharedValue(0);
  const acc = useSharedValue(0);

  const frameCb = useFrameCallback((info) => {
    acc.value += info.timeSincePreviousFrame ?? 0;
    if (acc.value < BEAM_FRAME_MS - 2) return;
    time.value += acc.value / 1000;
    acc.value = 0;
  }, false);

  useEffect(() => {
    frameCb.setActive(active);
  }, [active, frameCb]);

  const frame = useDerivedValue(
    () =>
      computeBeamFrame(
        widthSV.value,
        time.value,
        position.value,
        duration > 0 ? duration : 1,
      ),
    [duration],
  );

  const particles = useMemo(
    () =>
      Array.from({ length: 34 }, (_, k) => ({
        cx: (((k * 37) % 100) / 100) * w,
        cy: (((k * 53) % 100) / 100) * BEAM_H,
        r: 0.6 + (k % 3) * 0.4,
        o: 0.1 + (k % 5) * 0.07,
      })),
    [w],
  );

  const panResponder = useMemo(() => {
    const send = (x) => {
      const width = wRef.current;
      if (!width || !Number.isFinite(x)) return;
      const fraction = Math.min(Math.max(x / width, 0), 0.999);
      onSeek(fraction * duration);
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const x = e.nativeEvent.locationX;
        startXRef.current = Number.isFinite(x) ? x : null;
        if (startXRef.current !== null) send(startXRef.current);
      },
      onPanResponderMove: (_e, g) => {
        if (startXRef.current !== null) send(startXRef.current + g.dx);
      },
    });
  }, [onSeek, duration]);

  return (
    <View
      {...panResponder.panHandlers}
      onLayout={(e) => {
        const nw = e.nativeEvent.layout.width;
        wRef.current = nw;
        widthSV.value = nw;
        setW(nw);
      }}
      style={{ height: BEAM_H }}
      accessibilityRole="adjustable"
      accessibilityLabel="Track progress"
    >
      <View pointerEvents="none">
        {w > 0 && (
          <Svg width={w} height={BEAM_H}>
            <Defs>
              <SvgGradient
                id={fadeId}
                x1="0"
                y1="0"
                x2={w}
                y2="0"
                gradientUnits="userSpaceOnUse"
              >
                <Stop offset="0" stopColor="#78e1ff" stopOpacity="0" />
                <Stop offset="0.1" stopColor="#78e1ff" stopOpacity="0.95" />
                <Stop offset="0.9" stopColor="#78e1ff" stopOpacity="0.95" />
                <Stop offset="1" stopColor="#78e1ff" stopOpacity="0" />
              </SvgGradient>
            </Defs>

            {particles.map((p, i) => (
              <Circle
                key={i}
                cx={p.cx}
                cy={p.cy}
                r={p.r}
                fill="#78c8ff"
                opacity={p.o}
              />
            ))}

            <BeamStroke
              frame={frame}
              field="full"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth={1.4}
            />

            {GLOW_STROKES.map((g) => (
              <BeamStroke
                key={g.sw}
                frame={frame}
                field="bright"
                stroke={`url(#${fadeId})`}
                strokeWidth={g.sw}
                opacity={g.o}
              />
            ))}
            <BeamStroke
              frame={frame}
              field="bright"
              stroke="#f2fdff"
              strokeWidth={1.3}
            />

            <PlayHead frame={frame} />
          </Svg>
        )}
      </View>
    </View>
  );
});

const TimeRow = memo(function TimeRow({ position, duration }) {
  const [sec, setSec] = useState(0);

  useAnimatedReaction(
    () => Math.floor(position.value),
    (cur, prev) => {
      if (cur !== prev) scheduleOnRN(setSec, cur);
    },
    [],
  );

  return (
    <View className="flex-row items-center justify-between px-0.5">
      <Text className="text-xs text-white/50">{fmt(sec)}</Text>
      <Text className="text-xs text-white/50">-{fmt(duration - sec)}</Text>
    </View>
  );
});

function QualityBadge({ quality }) {
  const q = qualityStyle(quality);
  return (
    <View
      className="ml-2 rounded-full px-2 py-0.5"
      style={{ backgroundColor: q.bg, borderWidth: 1, borderColor: q.bg }}
    >
      <Text className="text-[10px] font-semibold" style={{ color: q.color }}>
        {quality}
      </Text>
    </View>
  );
}

function ExplicitTag() {
  return (
    <View className="ml-1.5 rounded bg-white/15 px-1">
      <Text className="text-[9px] font-semibold text-white/75">E</Text>
    </View>
  );
}

function Cover({ track, size = 50, radius = 15, iconSize = 22, children }) {
  const Icon = track.Icon || Music;
  const [artFailed, setArtFailed] = useState(false);
  const showArt = Boolean(track.artwork) && !artFailed;

  return (
    <LinearGradient
      colors={track.colors || COVER_COLORS[0]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <LinearGradient
        colors={["rgba(255,255,255,0.22)", "rgba(255,255,255,0)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.7, y: 0.7 }}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      {showArt ? (
        <Image
          source={{ uri: track.artwork }}
          onError={() => setArtFailed(true)}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : null}
      {children || (!showArt ? <Icon size={iconSize} color="#ffffff" strokeWidth={2} /> : null)}
    </LinearGradient>
  );
}

function EqBar({ duration, active }) {
  const v = useSharedValue(0);

  useEffect(() => {
    if (active) {
      v.value = withRepeat(
        withTiming(1, { duration, easing: BREATHE_EASING }),
        -1,
        true,
      );
    }
    return () => {
      cancelAnimation(v);
      v.value = 0;
    };
  }, [active, duration, v]);

  const style = useAnimatedStyle(() => ({ height: 6 + 20 * v.value }));

  return (
    <Animated.View
      style={[
        {
          width: 5,
          marginHorizontal: 2,
          borderRadius: 3,
          backgroundColor: ACCENT,
        },
        style,
      ]}
    />
  );
}

const EqualizerBars = memo(function EqualizerBars({ active = true }) {
  return (
    <View className="absolute inset-0 flex-row items-end justify-center pb-3">
      <LinearGradient
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.55)"]}
        start={{ x: 0, y: 0.35 }}
        end={{ x: 0, y: 1 }}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />

      {EQ_DURATIONS.map((d, i) => (
        <EqBar key={i} duration={d} active={active} />
      ))}
    </View>
  );
});

const TrackRow = memo(function TrackRow({
  track,
  index,
  firstMount,
  onSelect,
  onLongPress,
  active = true,
}) {
  return (
    <RiseView delay={firstMount ? index * 0.07 : 0} active={active}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => onSelect(index)}
        onLongPress={onLongPress}
        delayLongPress={350}
        className="flex-row items-center rounded-[20px] border border-white/5 bg-white/[0.035] py-2.5 pl-2.5 pr-3"
        accessibilityRole="button"
        accessibilityLabel={`Play ${track.title} by ${track.artist}`}
      >
        <Cover track={track} />

        <View className="ml-3 flex-1">
          <View className="flex-row items-center">
            <Text
              numberOfLines={1}
              className="shrink text-[15px] font-medium text-white"
              style={{ fontFamily: "Quicksand_500Medium" }}
            >
              {track.title}
            </Text>
            {track.explicit && <ExplicitTag />}
          </View>
          <View className="mt-1 flex-row items-center">
            <Text numberOfLines={1} className="shrink text-xs text-white/55">
              {track.artist}
            </Text>
            <QualityBadge quality={track.quality} />
          </View>
        </View>

        <Text className="mx-3 text-xs text-white/40">
          {fmt(track.duration)}
        </Text>

        <View className="h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.07]">
          <Play size={16} color="#ffffff" fill="#ffffff" strokeWidth={0} />
        </View>
      </TouchableOpacity>
    </RiseView>
  );
});

const ActiveCard = memo(function ActiveCard({
  track,
  position,
  onSeek,
  onViewDetails,
  active = true,
}) {
  return (
    <RiseView delay={0} active={active}>
        <LinearGradient
          colors={BORDER_COLORS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 26,
            padding: 1,
            shadowColor: ACCENT,
            shadowOpacity: 0.35,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 8 },
            elevation: 8,
          }}
        >
          <View className="rounded-[25px] bg-[#0f0e11] p-3.5">
            <View className="flex-row items-center">
              <Cover track={track} size={76} radius={22}>
                <EqualizerBars active={active} />
              </Cover>

              <View className="ml-3.5 flex-1">
                <View className="flex-row items-center">
                  <Text
                    numberOfLines={1}
                    className="shrink text-lg font-medium tracking-wide"
                    style={{ color: ACCENT }}
                  >
                    {track.title}
                  </Text>
                  {track.explicit && <ExplicitTag />}
                </View>
                <View className="mt-1 flex-row items-center">
                  <Text
                    numberOfLines={1}
                    className="shrink text-[13px] text-white/55"
                  >
                    {track.artist}
                  </Text>
                  <QualityBadge quality={track.quality} />
                </View>
              </View>
            </View>

            <View className="-mx-1 mt-2.5">
              <Beam
                position={position}
                duration={track.duration || 1}
                onSeek={onSeek}
                active={active}
              />
            </View>

            <TimeRow position={position} duration={track.duration || 0} />

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onViewDetails}
              style={{ marginTop: 14 }}
              accessibilityRole="button"
              accessibilityLabel="View details"
            >
              <LinearGradient
                colors={BORDER_COLORS}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  height: 46,
                  borderRadius: 15,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  numberOfLines={1}
                  className="mr-2 text-sm font-semibold tracking-wide text-[#1a1200]"
                >
                  View Details
                </Text>
                <ArrowRight size={18} color="#1a1200" strokeWidth={2.4} />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </LinearGradient>
    </RiseView>
  );
});

export const MixSongItem = memo(function MixSongItem({
  track,
  index,
  firstMount = false,
  expanded = false,
  position,
  onSelect,
  onSeek,
  onViewDetails,
  onLongPress,
  isScreenActive = true,
}) {
  if (expanded) {
    return (
      <ActiveCard
        track={track}
        position={position}
        onSeek={onSeek}
        onViewDetails={onViewDetails}
        active={isScreenActive}
      />
    );
  }

  return (
    <TrackRow
      track={track}
      index={index}
      firstMount={firstMount}
      onSelect={onSelect}
      onLongPress={onLongPress ? () => onLongPress(track, index) : undefined}
      active={isScreenActive}
    />
  );
});

export default function MixSongList({
  tracks = [],
  initialIndex = null,
  isScreenActive = true,
  onViewDetails,
  onSelectTrack,
  onSeekTrack,
  positionSeconds,
  playingId,
  onLongPress,
}) {
  const router = useRouter();
  const [active, setActive] = useState(initialIndex);
  const [firstMount, setFirstMount] = useState(true);

  const posRef = useRef(0);
  const position = useSharedValue(0);
  const controlled = positionSeconds != null;

  useEffect(() => {
    let id = requestAnimationFrame(() => setFirstMount(false));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!controlled) return;
    const next = Number(positionSeconds) || 0;
    posRef.current = next;
    position.value = next;
  }, [controlled, positionSeconds, position]);

  useEffect(() => {
    if (playingId == null) return;
    const idx = tracks.findIndex((t) => t.id === playingId);
    if (idx >= 0) setActive(idx);
  }, [playingId, tracks]);

  const select = useCallback(
    (i) => {
      if (!controlled) {
        posRef.current = 0;
        position.value = 0;
      }
      setActive(i);
      if (onSelectTrack) onSelectTrack(tracks[i], i);
    },
    [controlled, onSelectTrack, position, tracks],
  );

  useEffect(() => {
    if (controlled || !isScreenActive || active === null) return;
    const duration = tracks[active]?.duration || 0;

    const id = setInterval(() => {
      posRef.current += 0.25;

      if (duration > 0 && posRef.current >= duration) {
        posRef.current = 0;
        position.value = 0;
        setActive(null);
        return;
      }

      position.value = posRef.current;
    }, 250);

    return () => clearInterval(id);
  }, [isScreenActive, active, tracks, position, controlled]);

  const openDetails = useCallback(() => {
    if (active === null) return;
    const track = tracks[active];
    if (onViewDetails) onViewDetails(track);
    else router.push({ pathname: "/player", params: { id: track.id } });
  }, [active, tracks, onViewDetails, router]);

  const seek = useCallback(
    (seconds) => {
      if (!Number.isFinite(seconds)) return;
      posRef.current = seconds;
      position.value = seconds;
      if (onSeekTrack) onSeekTrack(seconds, tracks[active], active);
    },
    [onSeekTrack, position, tracks, active],
  );

  return (
    <View className="gap-2">
      {tracks.map((track, i) => (
        <MixSongItem
          key={track.id}
          track={track}
          index={i}
          firstMount={firstMount}
          expanded={i === active}
          position={position}
          onSelect={select}
          onSeek={seek}
          onViewDetails={openDetails}
          onLongPress={onLongPress}
          isScreenActive={isScreenActive}
        />
      ))}
    </View>
  );
}
