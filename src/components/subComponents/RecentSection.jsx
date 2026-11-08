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
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useRouter, useIsFocused } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import {
  Check,
  ChevronRight,
  Clock,
  Moon,
  Music,
  Pause,
  Play,
  Plus,
  Star,
  Sun,
  Target,
  Zap,
} from "lucide-react-native";

/* ------------------------------------------------------------------ */
/* Constants (module scope: allocated once)                            */
/* ------------------------------------------------------------------ */

const FONT = {
  light: "Outfit_300Light",
  regular: "Outfit_400Regular",
  semi: "Outfit_600SemiBold",
};
const ACCENT = "#ff2d55";
const HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 };
const DEFAULT_COLORS = ["#6a4fd8", "#1a1240"];
const G_START = { x: 0, y: 0 };
const G_END = { x: 0.6, y: 1 };
const G_DIAG_END = { x: 1, y: 1 };

// Card sizes
const R_W = 164;
const R_H = 206;
const R_GAP = 14;
const N_W = 296;
const N_H = 158;
const N_GAP = 14;
const MIX_H = 236;
const MIX_COLLAPSED = 48;
const MIX_GAP = 8;

const RECENT_SCRIM = ["rgba(11,12,17,0)", "rgba(11,12,17,0.92)", "#0b0c11"];
const RECENT_SCRIM_AT = [0.38, 0.78, 1];
const MIX_SCRIM = ["rgba(8,9,14,0)", "rgba(8,9,14,0.7)"];
const MIX_SCRIM_AT = [0.48, 1];
const MIX_TIMING = { duration: 520, easing: Easing.bezier(0.3, 0.7, 0.2, 1) };
const BAR_PHASES = [0, 0.33, 0.66];

const MIX_ICONS = { Morning: Sun, Focus: Target, Evening: Moon, Weekend: Star };

const LIGHT = {
  fg: "#14161c",
  mute: "#757a86",
  card: "rgba(255,255,255,0.8)",
  line: "rgba(20,22,28,0.09)",
};
const DARK = {
  fg: "#f3f2ee",
  mute: "#8b909c",
  card: "rgba(255,255,255,0.07)",
  line: "rgba(255,255,255,0.10)",
};

/* ---------- demo data (pass your own via props) ---------- */
export const RECENT = [
  { id: 1, title: "Midnight Echoes", songs: 14, kind: "hills", gradient: ["#8a6cf0", "#2a1d6e"], progress: 0.62 },
  { id: 2, title: "Ocean Breeze", songs: 11, kind: "waves", gradient: ["#5a9ae0", "#1d3a6e"] },
  { id: 3, title: "Sunset Boulevard", songs: 9, kind: "sun", gradient: ["#f0a526", "#b4491a"], progress: 0.35 },
  { id: 4, title: "Forest Walk", songs: 16, kind: "hills", gradient: ["#5fd896", "#14573a"] },
];

export const NEW_SONGS = [
  { id: 1, title: "Fresh Finds", songs: 7, kind: "disc", gradient: ["#ec6f8e", "#a43a66"] },
  { id: 2, title: "New In Pop", songs: 12, kind: "bars", gradient: ["#e8921a", "#b4491a"] },
  { id: 3, title: "Indie Drops", songs: 9, kind: "waves", gradient: ["#4f8fd8", "#2a4f9a"] },
  { id: 4, title: "Weekly Radar", songs: 15, kind: "disc", gradient: ["#7a5ff0", "#3d2a9e"] },
];

export const TODAY_MIX = [
  { id: 1, title: "Morning Boost", songs: 18, tag: "Morning", kind: "sun", gradient: ["#f4b63a", "#d9532e"] },
  { id: 2, title: "Focus Flow", songs: 22, tag: "Focus", kind: "hills", gradient: ["#5fd896", "#14573a"] },
  { id: 3, title: "Evening Wind Down", songs: 13, tag: "Evening", kind: "waves", gradient: ["#7a5ff0", "#2a1d6e"] },
  { id: 4, title: "Weekend Vibes", songs: 25, tag: "Weekend", kind: "bars", gradient: ["#ec6f8e", "#8e2a55"] },
];

/* ---------- scene shapes (static elements, built once) ---------- */
const SCENES = {
  hills: (
    <>
      <Circle cx="140" cy="62" r="22" fill="#fff" fillOpacity={0.28} />
      <Path d="M0 150L40 100L70 130L110 78L150 125L200 92V200H0Z" fill="#000" fillOpacity={0.22} />
      <Path d="M0 176L50 140L90 164L140 128L200 170V200H0Z" fill="#000" fillOpacity={0.38} />
      <Path d="M0 196Q100 164 200 196V200H0Z" fill="#000" fillOpacity={0.55} />
    </>
  ),
  sun: (
    <>
      <Circle cx="100" cy="92" r="48" fill="#fff" fillOpacity={0.3} />
      <Circle cx="100" cy="92" r="30" fill="#fff" fillOpacity={0.25} />
      <Path d="M0 128H200V200H0Z" fill="#000" fillOpacity={0.2} />
      <Path d="M0 150H200M0 168H200M0 184H200" stroke="#fff" strokeOpacity={0.16} strokeWidth={3} />
    </>
  ),
  waves: (
    <G fill="none" stroke="#fff" strokeOpacity={0.26} strokeWidth={3}>
      <Path d="M-10 90Q25 66 60 90T130 90T210 90" />
      <Path d="M-10 118Q25 94 60 118T130 118T210 118" />
      <Path d="M-10 146Q25 122 60 146T130 146T210 146" />
      <Path d="M-10 174Q25 150 60 174T130 174T210 174" />
    </G>
  ),
  disc: (
    <>
      <G fill="none" stroke="#fff" strokeOpacity={0.22} strokeWidth={2}>
        <Circle cx="100" cy="100" r="78" />
        <Circle cx="100" cy="100" r="58" />
        <Circle cx="100" cy="100" r="38" />
      </G>
      <Circle cx="100" cy="100" r="14" fill="#fff" fillOpacity={0.4} />
    </>
  ),
  bars: (
    <G fill="#fff" fillOpacity={0.3}>
      <Rect x="34" y="96" width="16" height="70" rx="8" />
      <Rect x="62" y="62" width="16" height="104" rx="8" />
      <Rect x="90" y="80" width="16" height="86" rx="8" />
      <Rect x="118" y="44" width="16" height="122" rx="8" />
      <Rect x="146" y="88" width="16" height="78" rx="8" />
    </G>
  ),
};

/* ------------------------------------------------------------------ */
/* Helpers + hooks                                                     */
/* ------------------------------------------------------------------ */

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

const toSource = (image) => {
  if (!image) return null;
  if (typeof image === "number") return image;
  if (typeof image === "string") return { uri: image };
  if (typeof image === "object" && image.uri) return image;
  return null;
};

const haptic = () => {
  try {
    Haptics.selectionAsync().catch(() => {});
  } catch {
    // unsupported device
  }
};

const sameItems = (a, b) => {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (x === y) continue;
    if (
      !x || !y ||
      x.id !== y.id || x.title !== y.title || x.songs !== y.songs ||
      x.progress !== y.progress || x.tag !== y.tag || x.kind !== y.kind ||
      x.image !== y.image ||
      x.gradient?.[0] !== y.gradient?.[0] || x.gradient?.[1] !== y.gradient?.[1]
    ) {
      return false;
    }
  }
  return true;
};

// Single gate: screen focused + app foregrounded + isScreenActive prop.
function useIsActive(flag = true) {
  const focused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setAppActive(s === "active"));
    return () => sub.remove();
  }, []);
  return flag && focused && appActive;
}

// Latest-value ref: keeps child callbacks stable. The ref is written after
// paint, never during render (see EquilizerScreen).
function useLatest(value) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

// Parents often pass fresh arrays each render; keep the same array while content is equal.
// The ref is only a render-cache — read/written after paint, never during render.
function useStableList(list) {
  const ref = useRef(list);
  // eslint-disable-next-line react-hooks/refs
  if (!sameItems(ref.current, list)) {
    // eslint-disable-next-line react-hooks/refs
    ref.current = list;
  }
  // eslint-disable-next-line react-hooks/refs
  return ref.current;
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

/* ------------------------------------------------------------------ */
/* Shared visual pieces                                                */
/* ------------------------------------------------------------------ */

const Scene = memo(function Scene({ kind = "disc", colors = DEFAULT_COLORS, image }) {
  const source = useMemo(() => toSource(image), [image]);
  if (source) {
    return <Image source={source} style={StyleSheet.absoluteFill} resizeMode="cover" />;
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={colors} start={G_START} end={G_END} style={StyleSheet.absoluteFill} />
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 200 200"
        preserveAspectRatio="xMidYMid slice"
      >
        {SCENES[kind] ?? SCENES.disc}
      </Svg>
    </View>
  );
});

// Equaliser: one shared clock, UI thread, stops when inactive.
const Bar = memo(function Bar({ clock, phase }) {
  const style = useAnimatedStyle(() => ({
    transform: [
      { scaleY: 0.25 + 0.75 * (0.5 + 0.5 * Math.sin((clock.value + phase) * Math.PI * 2)) },
    ],
  }));
  return <Animated.View style={[styles.bar, style]} />;
});

const Bars = memo(function Bars({ active }) {
  const clock = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(clock);
    if (!active) return;
    clock.value = 0;
    clock.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(clock);
  }, [active, clock]);
  return (
    <View style={styles.bars}>
      {BAR_PHASES.map((p) => (
        <Bar key={p} clock={clock} phase={p} />
      ))}
    </View>
  );
});

const SectionHeading = memo(function SectionHeading({ Icon, title, label, onPress, t }) {
  return (
    <View style={styles.head}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`See all ${title.toLowerCase()}`}
        style={styles.titleBtn}
      >
        <View style={[styles.ico, { backgroundColor: t.card, borderColor: t.line }]}>
          <Icon size={19} color={t.fg} strokeWidth={1.5} />
        </View>
        <Text style={[styles.title, { color: t.fg }]}>{title}</Text>
        <ChevronRight size={18} color={t.mute} strokeWidth={1.8} />
      </Pressable>
      <Text style={[styles.label, { color: t.mute }]}>{label}</Text>
    </View>
  );
});

/* ------------------------------------------------------------------ */
/* RECENT: memory cards                                                */
/* ------------------------------------------------------------------ */

const RecentCard = memo(function RecentCard({ item, playing, animate, onToggle }) {
  const handlePress = useCallback(() => onToggle(item), [onToggle, item]);
  const pct = item.progress > 0 ? Math.round(item.progress * 100) : 0;

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${item.songs} songs`}
      accessibilityState={{ selected: playing }}
      style={({ pressed }) => [styles.rc, pressed && styles.pressed]}
    >
      <View style={styles.rcClip}>
        <Scene kind={item.kind} colors={item.gradient} image={item.image} />
        <LinearGradient
          colors={RECENT_SCRIM}
          locations={RECENT_SCRIM_AT}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <View style={styles.rcTagWrap} pointerEvents="none">
          <View style={styles.tag}>
            {playing ? <Bars active={animate} /> : null}
            <Text style={styles.tagText}>
              {playing ? "Playing" : pct ? `${pct}% played` : "Replay"}
            </Text>
          </View>
        </View>

        <Text numberOfLines={1} style={styles.rcTitle}>
          {item.title}
        </Text>
        <Text style={styles.rcSub}>{item.songs} songs</Text>

        {pct ? (
          <View style={styles.rcBar}>
            <View style={[styles.rcBarFill, { width: `${pct}%` }]} />
          </View>
        ) : null}

        {playing ? <View pointerEvents="none" style={[styles.ring, { borderRadius: 30 }]} /> : null}
      </View>
    </Pressable>
  );
});

const RecentSection = memo(function RecentSection({
  items, playingKey, animate, onToggle, onHeadingPress, bleed, t,
}) {
  const renderItem = useCallback(
    ({ item }) => (
      <RecentCard
        item={item}
        playing={playingKey === `recent-${item.id}`}
        animate={animate}
        onToggle={onToggle}
      />
    ),
    [playingKey, animate, onToggle],
  );
  const keyExtractor = useCallback((it) => String(it.id), []);
  const sep = useCallback(() => <View style={{ width: R_GAP }} />, []);
  const layout = useCallback(
    (_, i) => ({ length: R_W + R_GAP, offset: (R_W + R_GAP) * i, index: i }),
    [],
  );
  const listStyle = useMemo(() => ({ marginHorizontal: -bleed, flexGrow: 0 }), [bleed]);
  const content = useMemo(
    () => ({ paddingHorizontal: bleed, paddingTop: 6, paddingBottom: 18 }),
    [bleed],
  );

  return (
    <View style={styles.section}>
      <SectionHeading Icon={Clock} title="Recent" label="Replay" onPress={onHeadingPress} t={t} />
      <FlatList
        horizontal
        data={items}
        extraData={playingKey}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ItemSeparatorComponent={sep}
        getItemLayout={layout}
        showsHorizontalScrollIndicator={false}
        snapToInterval={R_W + R_GAP}
        snapToAlignment="start"
        decelerationRate="fast"
        style={listStyle}
        contentContainerStyle={content}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
        removeClippedSubviews={Platform.OS === "android"}
      />
    </View>
  );
});

/* ------------------------------------------------------------------ */
/* NEW SONGS: widget cards                                             */
/* ------------------------------------------------------------------ */

const NewCard = memo(function NewCard({ item, playing, saved, pulse, onToggle, onSave, onQueue }) {
  const dot = useAnimatedStyle(() => ({ opacity: 1 - 0.7 * pulse.value }));
  const colors = item.gradient ?? DEFAULT_COLORS;

  const handlePlay = useCallback(() => onToggle(item), [onToggle, item]);
  const handleSave = useCallback(() => onSave(item), [onSave, item]);
  const handleQueue = useCallback(() => onQueue(item), [onQueue, item]);

  return (
    <View style={styles.nShadow}>
      <LinearGradient colors={colors} start={G_START} end={G_DIAG_END} style={styles.nc}>
        <View style={styles.nTop}>
          <View style={styles.thumb}>
            <Scene kind={item.kind} colors={colors} image={item.image} />
          </View>
          <View style={styles.nText}>
            <Text numberOfLines={1} style={styles.nTitle}>{item.title}</Text>
            <Text style={styles.nMeta}>{item.songs} songs</Text>
            <View style={styles.nNew}>
              <Animated.View style={[styles.nDot, dot]} />
              <Text style={styles.nMeta}>Just added</Text>
            </View>
          </View>
        </View>

        <View style={styles.nBottom}>
          <Pressable
            onPress={handleSave}
            accessibilityRole="button"
            accessibilityState={{ selected: saved }}
            accessibilityLabel={saved ? `Remove ${item.title} from library` : `Save ${item.title}`}
            style={[styles.pill, saved && styles.pillOn]}
          >
            {saved ? <Check size={15} color="#fff" strokeWidth={2} /> : null}
            <Text style={styles.pillText}>{saved ? "Saved" : "Save"}</Text>
          </Pressable>

          <View style={styles.split}>
            <Pressable
              onPress={handleQueue}
              accessibilityRole="button"
              accessibilityLabel={`Add ${item.title} to queue`}
              style={({ pressed }) => [styles.splitBtn, styles.splitL, pressed && styles.splitPressed]}
            >
              <Plus size={19} color="#fff" strokeWidth={2} />
            </Pressable>
            <Pressable
              onPress={handlePlay}
              accessibilityRole="button"
              accessibilityLabel={`${playing ? "Pause" : "Play"} ${item.title}`}
              style={({ pressed }) => [
                styles.splitBtn,
                styles.splitR,
                playing && styles.splitOn,
                pressed && styles.splitPressed,
              ]}
            >
              {playing ? (
                <Pause size={18} color="#14161c" fill="#14161c" strokeWidth={0} />
              ) : (
                <Play size={18} color="#fff" fill="#fff" strokeWidth={0} />
              )}
            </Pressable>
          </View>
        </View>

        {playing ? <View pointerEvents="none" style={[styles.ring, { borderRadius: 30 }]} /> : null}
      </LinearGradient>
    </View>
  );
});

const NewSongsSection = memo(function NewSongsSection({
  items, playingKey, animate, onToggle, onSave, onQueue, onHeadingPress, bleed, t,
}) {
  // One shared pulse drives the "Just added" dot on every card; stops when inactive.
  const pulse = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(pulse);
    pulse.value = 0;
    if (!animate) return;
    pulse.value = withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [animate, pulse]);

  const [saved, setSaved] = useState({});
  const savedRef = useLatest(saved);
  const toggleSave = useCallback(
    (item) => {
      const next = !savedRef.current[item.id];
      haptic();
      setSaved((p) => ({ ...p, [item.id]: next }));
      onSave?.(item, next);
    },
    [savedRef, onSave],
  );

  const renderItem = useCallback(
    ({ item }) => (
      <NewCard
        item={item}
        playing={playingKey === `new-${item.id}`}
        saved={!!saved[item.id]}
        pulse={pulse}
        onToggle={onToggle}
        onSave={toggleSave}
        onQueue={onQueue}
      />
    ),
    [playingKey, saved, pulse, onToggle, toggleSave, onQueue],
  );
  const keyExtractor = useCallback((it) => String(it.id), []);
  const sep = useCallback(() => <View style={{ width: N_GAP }} />, []);
  const layout = useCallback(
    (_, i) => ({ length: N_W + N_GAP, offset: (N_W + N_GAP) * i, index: i }),
    [],
  );
  const listStyle = useMemo(() => ({ marginHorizontal: -bleed, flexGrow: 0 }), [bleed]);
  const content = useMemo(
    () => ({ paddingHorizontal: bleed, paddingTop: 6, paddingBottom: 18 }),
    [bleed],
  );

  return (
    <View style={styles.section}>
      <SectionHeading Icon={Zap} title="New songs" label="Just in" onPress={onHeadingPress} t={t} />
      <FlatList
        horizontal
        data={items}
        extraData={saved}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ItemSeparatorComponent={sep}
        getItemLayout={layout}
        showsHorizontalScrollIndicator={false}
        snapToInterval={N_W + N_GAP}
        snapToAlignment="start"
        decelerationRate="fast"
        style={listStyle}
        contentContainerStyle={content}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={3}
        removeClippedSubviews={Platform.OS === "android"}
      />
    </View>
  );
});

/* ------------------------------------------------------------------ */
/* TODAY'S MIX: expanding panels                                       */
/* Widths are driven by ONE shared value on the UI thread. The artwork */
/* inside each panel has a fixed size, so it never re-layouts.         */
/* ------------------------------------------------------------------ */

const MixPanel = memo(function MixPanel({
  item, index, selPos, expanded, playing, expandedW, onPanelPress, onPlayPress,
}) {
  const colors = item.gradient ?? DEFAULT_COLORS;
  const Glyph = MIX_ICONS[item.tag] ?? Music;

  const sizeStyle = useAnimatedStyle(() => {
    const k = Math.max(0, 1 - Math.abs(index - selPos.value));
    return { width: MIX_COLLAPSED + (expandedW - MIX_COLLAPSED) * k };
  }, [expandedW]);

  const fadeStyle = useAnimatedStyle(() => {
    const k = Math.max(0, 1 - Math.abs(index - selPos.value));
    return { opacity: Math.min(1, Math.max(0, (k - 0.55) / 0.45)) };
  });

  const handlePanel = useCallback(() => onPanelPress(index), [onPanelPress, index]);
  const handlePlay = useCallback(() => onPlayPress(index), [onPlayPress, index]);

  return (
    <Animated.View style={[styles.panel, sizeStyle]}>
      {/* fixed-size artwork, centered, clipped by the panel */}
      <View style={[styles.panelArt, { width: expandedW, marginLeft: -expandedW / 2 }]} pointerEvents="none">
        <Scene kind={item.kind} colors={colors} image={item.image} />
        <LinearGradient
          colors={MIX_SCRIM}
          locations={MIX_SCRIM_AT}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <Pressable
        onPress={handlePanel}
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${item.songs} songs`}
        accessibilityState={{ selected: expanded }}
      />

      <View style={styles.panelIcon} pointerEvents="none">
        <Glyph size={19} color={colors[1]} strokeWidth={1.8} />
      </View>

      <Animated.View
        style={[styles.panelText, { width: Math.max(0, expandedW - 120) }, fadeStyle]}
        pointerEvents="none"
      >
        <Text numberOfLines={1} style={styles.panelTitle}>{item.title}</Text>
        <Text numberOfLines={1} style={styles.panelSub}>
          {playing ? "Playing now" : `${item.songs} songs${item.tag ? `, ${item.tag}` : ""}`}
        </Text>
      </Animated.View>

      <Animated.View
        style={[styles.panelPlayWrap, fadeStyle]}
        pointerEvents={expanded ? "auto" : "none"}
      >
        <Pressable
          onPress={handlePlay}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={`${playing ? "Pause" : "Play"} ${item.title}`}
          style={styles.panelPlay}
        >
          {playing ? (
            <Pause size={16} color="#14161c" fill="#14161c" strokeWidth={0} />
          ) : (
            <Play size={16} color="#14161c" fill="#14161c" strokeWidth={0} />
          )}
        </Pressable>
      </Animated.View>

      {playing ? <View pointerEvents="none" style={[styles.ring, { borderRadius: 28 }]} /> : null}
    </Animated.View>
  );
});

const TodayMixSection = memo(function TodayMixSection({
  items, playingKey, active, reduceMotion, onToggle, onHeadingPress, t,
}) {
  const count = items.length;
  const [sel, setSel] = useState(0);
  const [rowW, setRowW] = useState(0);
  const selRef = useRef(0);
  const selPos = useSharedValue(0);
  const itemsRef = useLatest(items);

  const select = useCallback(
    (i) => {
      const next = clamp(i, 0, itemsRef.current.length - 1);
      if (next === selRef.current) return;
      selRef.current = next;
      setSel(next);
      haptic();
      // `selPos` is a stable shared value, not an effect dependency; the
      // compiler flags it because select is referenced inside an effect.
      // eslint-disable-next-line react-hooks/immutability
      selPos.value = reduceMotion ? next : withTiming(next, MIX_TIMING);
    },
    [itemsRef, reduceMotion, selPos],
  );

  // keep selection valid if the list shrinks
  useEffect(() => {
    if (selRef.current > count - 1 && count > 0) select(count - 1);
  }, [count, select]);

  const onPanelPress = useCallback(
    (i) => {
      if (i !== selRef.current) select(i);
      else onToggle(itemsRef.current[i]);
    },
    [select, onToggle, itemsRef],
  );
  const onPlayPress = useCallback(
    (i) => onToggle(itemsRef.current[i]),
    [onToggle, itemsRef],
  );

  const step = useCallback((dir) => select(selRef.current + dir), [select]);

  // swipe across the row to move between mixes. Built once; `step` reads live
  // refs at gesture time, never during render (see EquilizerScreen).
  const [pan] = useState(
    // eslint-disable-next-line react-hooks/refs
    () =>
      Gesture.Pan()
        .enabled(active)
        .activeOffsetX([-20, 20])
        .failOffsetY([-12, 12])
        .onEnd((e) => {
          if (Math.abs(e.translationX) > 48) runOnJS(step)(e.translationX < 0 ? 1 : -1);
        }),
  );

  const onLayout = useCallback((e) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setRowW((cur) => (cur === w ? cur : w));
  }, []);

  const expandedW = Math.max(
    MIX_COLLAPSED,
    rowW - (count - 1) * (MIX_COLLAPSED + MIX_GAP),
  );

  return (
    <View style={styles.section}>
      <SectionHeading Icon={Sun} title="Today’s mix" label="For today" onPress={onHeadingPress} t={t} />
      <GestureDetector gesture={pan}>
        <View style={styles.mixRow} onLayout={onLayout}>
          {rowW > 0 &&
            items.map((item, i) => (
              <MixPanel
                key={String(item.id)}
                item={item}
                index={i}
                selPos={selPos}
                expanded={i === sel}
                playing={playingKey === `mix-${item.id}`}
                expandedW={expandedW}
                onPanelPress={onPanelPress}
                onPlayPress={onPlayPress}
              />
            ))}
        </View>
      </GestureDetector>
    </View>
  );
});

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */
/**
 * <RecentGrid
 *   isScreenActive={isVisible}
 *   recent={RECENT} newSongs={NEW_SONGS} todayMix={TODAY_MIX}
 *   onPressItem={(section, item) => ...}   // section: "recent" | "new" | "mix"
 *   onPressHeading={(section) => ...}      // defaults to /library
 *   onSave={(item, saved) => ...}
 *   onAddToQueue={(item) => ...}
 *   bleed={20}                             // parent's horizontal padding, lets rails reach the edges
 * />
 */
function RecentGrid({
  recent = RECENT,
  newSongs = NEW_SONGS,
  todayMix = TODAY_MIX,
  onPressItem,
  onPressHeading,
  onSave,
  onAddToQueue,
  initialPlaying = "recent-1",
  bleed = 0,
  isScreenActive = true,
}) {
  const router = useRouter();
  const active = useIsActive(isScreenActive);
  const reduceMotion = useReducedMotion();
  const animate = active && !reduceMotion;
  const t = useColorScheme() === "dark" ? DARK : LIGHT;

  // Lazy mount: nothing heavy renders until visible at least once. State, not a
  // ref — the placeholder branch reads it during render, so it must trigger a
  // re-render the moment the grid becomes visible.
  const [everActive, setEverActive] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (active) setEverActive(true);
  }, [active]);

  // Stable data, frozen while off-screen.
  const stableRecent = useStableList(recent);
  const stableNew = useStableList(newSongs);
  const stableMix = useStableList(todayMix);
  const live = useWhileActive(
    { recent: stableRecent, newSongs: stableNew, todayMix: stableMix },
    active,
  );

  const [playingKey, setPlayingKey] = useState(initialPlaying);
  const pressRef = useLatest(onPressItem);
  const headingRef = useLatest(onPressHeading);
  const queueRef = useLatest(onAddToQueue);

  // One thing plays at a time; tapping the playing item again pauses it.
  const makeToggle = useCallback(
    (section) => (item) => {
      const key = `${section}-${item.id}`;
      haptic();
      setPlayingKey((cur) => (cur === key ? null : key));
      pressRef.current?.(section, item);
    },
    [pressRef],
  );
  const toggleRecent = useMemo(() => makeToggle("recent"), [makeToggle]);
  const toggleNew = useMemo(() => makeToggle("new"), [makeToggle]);
  const toggleMix = useMemo(() => makeToggle("mix"), [makeToggle]);

  const makeHeading = useCallback(
    (section) => () => {
      if (headingRef.current) headingRef.current(section);
      else router.push("/library");
    },
    [headingRef, router],
  );
  const headRecent = useMemo(() => makeHeading("recent"), [makeHeading]);
  const headNew = useMemo(() => makeHeading("new"), [makeHeading]);
  const headMix = useMemo(() => makeHeading("mix"), [makeHeading]);

  const onQueue = useCallback((item) => {
    haptic();
    queueRef.current?.(item);
  }, [queueRef]);

  if (!everActive) {
    // placeholder height so the layout doesn't jump when the sections mount
    return <View style={styles.placeholder} />;
  }

  return (
    <View style={styles.root}>
      {live.recent?.length ? (
        <RecentSection
          items={live.recent}
          playingKey={playingKey}
          animate={animate}
          onToggle={toggleRecent}
          onHeadingPress={headRecent}
          bleed={bleed}
          t={t}
        />
      ) : null}
      {live.newSongs?.length ? (
        <NewSongsSection
          items={live.newSongs}
          playingKey={playingKey}
          animate={animate}
          onToggle={toggleNew}
          onSave={onSave}
          onQueue={onQueue}
          onHeadingPress={headNew}
          bleed={bleed}
          t={t}
        />
      ) : null}
      {live.todayMix?.length ? (
        <TodayMixSection
          items={live.todayMix}
          playingKey={playingKey}
          active={active}
          reduceMotion={reduceMotion}
          onToggle={toggleMix}
          onHeadingPress={headMix}
          t={t}
        />
      ) : null}
    </View>
  );
}

export default memo(RecentGrid);

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  root: { width: "100%" },
  placeholder: { width: "100%", height: 900 },
  section: { marginTop: 36 },
  pressed: { transform: [{ scale: 0.97 }] },

  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  titleBtn: { flexDirection: "row", alignItems: "center", gap: 12 },
  ico: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: FONT.semi, fontSize: 28, letterSpacing: -0.8 },
  label: { fontFamily: FONT.light, fontSize: 14 },

  ring: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: ACCENT,
  },
  bars: { height: 11, flexDirection: "row", alignItems: "flex-end", gap: 2 },
  bar: { width: 3, height: 11, borderRadius: 2, backgroundColor: "#fff", transformOrigin: "bottom" },
  tag: {
    height: 26,
    paddingHorizontal: 11,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.3)",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  tagText: { color: "#fff", fontFamily: FONT.regular, fontSize: 12 },

  /* recent */
  rc: {
    width: R_W,
    height: R_H,
    borderRadius: 30,
    backgroundColor: "#14151b",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  rcClip: { flex: 1, borderRadius: 30, overflow: "hidden" },
  rcTagWrap: { position: "absolute", top: 14, left: 0, right: 0, alignItems: "center" },
  rcTitle: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 40,
    textAlign: "center",
    color: "#fff",
    fontFamily: FONT.light,
    fontSize: 22,
    letterSpacing: -0.4,
  },
  rcSub: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 18,
    textAlign: "center",
    color: "rgba(255,255,255,0.72)",
    fontFamily: FONT.light,
    fontSize: 12,
  },
  rcBar: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 10,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.22)",
    overflow: "hidden",
  },
  rcBarFill: { height: "100%", borderRadius: 2, backgroundColor: ACCENT },

  /* new songs */
  nShadow: {
    width: N_W,
    height: N_H,
    borderRadius: 30,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  nc: {
    flex: 1,
    borderRadius: 30,
    padding: 16,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  nTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  nText: { flex: 1, minWidth: 0, gap: 2 },
  nTitle: {
    color: "#fff",
    fontFamily: FONT.semi,
    fontSize: 22,
    letterSpacing: -0.4,
    textShadowColor: "rgba(0,0,0,0.25)",
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  nMeta: { color: "rgba(255,255,255,0.88)", fontFamily: FONT.light, fontSize: 14 },
  nNew: { flexDirection: "row", alignItems: "center", gap: 7 },
  nDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  nBottom: { flexDirection: "row", gap: 10 },
  pill: {
    height: 48,
    paddingHorizontal: 20,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.4)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  pillOn: { backgroundColor: "rgba(255,255,255,0.22)" },
  pillText: { color: "#fff", fontFamily: FONT.regular, fontSize: 15 },
  split: { flex: 1, flexDirection: "row", gap: 3 },
  splitBtn: {
    flex: 1,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.24)",
  },
  splitL: {
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
    borderTopRightRadius: 7,
    borderBottomRightRadius: 7,
  },
  splitR: {
    borderTopLeftRadius: 7,
    borderBottomLeftRadius: 7,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
  },
  splitOn: { backgroundColor: "#fff" },
  splitPressed: { backgroundColor: "rgba(255,255,255,0.34)", transform: [{ scale: 0.96 }] },

  /* today's mix */
  mixRow: { flexDirection: "row", gap: MIX_GAP, height: MIX_H },
  panel: {
    height: MIX_H,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#1a1d26",
  },
  panelArt: { position: "absolute", top: 0, left: "50%", height: MIX_H },
  panelIcon: {
    position: "absolute",
    left: 7,
    bottom: 7,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  panelText: { position: "absolute", left: 58, bottom: 9 },
  panelTitle: {
    color: "#fff",
    fontFamily: FONT.semi,
    fontSize: 21,
    letterSpacing: -0.4,
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  panelSub: { color: "rgba(255,255,255,0.85)", fontFamily: FONT.light, fontSize: 13 },
  panelPlayWrap: { position: "absolute", right: 10, bottom: 10 },
  panelPlay: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});