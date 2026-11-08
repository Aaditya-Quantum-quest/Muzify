import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useIsFocused } from "expo-router";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import {
  AudioLines,
  ChevronRight,
  Clock,
  Flame,
  Headphones,
  Heart,
  Pause,
  Play,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Waves,
} from "lucide-react-native";

/*
 * Performance notes
 * - useIsFocused: spin + equalizer stop the moment the screen loses focus.
 * - Only the playing record animates, and only while it is scrolled into view
 *   (FlatList viewability) and the OS "reduce motion" setting is off.
 * - Animations run on the UI thread (Reanimated); the JS thread does no work per frame.
 * - Static vinyl artwork (grooves, label, sheen) is memoized and never re-rendered;
 *   only the transform of the wrapper changes.
 * - MixItem is memo'd and receives primitives + stable callbacks, so a play/pause
 *   re-renders at most two items.
 * - Fixed-size FlatList items: getItemLayout, small window, clipped subviews.
 * - Module-level constants for data, styles and configs keep references stable.
 */

// Copy the real values for these two from your original screen file.
// WORDMARK_FONT: your custom font family name (undefined = system font)
// FG_COLOR: the value that used to be C.fg
const WORDMARK_FONT = undefined;
const FG_COLOR = "#ffffff";

const DISC = 176;
const CARD_GAP = 20;
const ITEM_STRIDE = DISC + CARD_GAP;
const SIDE_PAD = 20;
const SPIN_MS = 5000;

const INK = "#14100a";
const DISC_BASE = "#15120f";
// Fill of the play button while playing. Set this to your screen background.
const PLAY_ACTIVE_BG = "#0c0a08";

const GROOVES = [92, 85, 78, 71, 64, 57, 50];
const EQ_DELAYS = [0, 200, 400, 100];

const MIXES = [
  {
    id: "weekly-featured",
    accent: "#e0aa4a",
    Icon: AudioLines,
    badge: "Sonic Aura",
    chip: "28 tracks",
    eyebrow: "Weekly featured",
    title: "Soundtrack of the week",
    subtitle: "Ambient beats, lush neoclassical and minimal…",
    FooterIcon: Clock,
    footer: "1 hr 42 min",
  },
  {
    id: "daily-mix",
    accent: "#e46a35",
    Icon: Waves,
    badge: "Adaptive",
    chip: "Updated daily",
    eyebrow: "Personalised",
    title: "Daily mix, made for you",
    subtitle: "Tailored to your mood and time of day",
    FooterIcon: SlidersHorizontal,
    footer: "Adaptive",
  },
  {
    id: "liked-songs",
    accent: "#ea7aa3",
    Icon: Heart,
    badge: "Heartbeats",
    chip: "Your favourites",
    eyebrow: "Your collection",
    title: "Songs you love",
    subtitle: "Every favourite track, all in one place",
    FooterIcon: Heart,
    footer: "Liked tracks",
  },
  {
    id: "recently-added",
    accent: "#5cc4b0",
    Icon: Sparkles,
    badge: "Fresh drops",
    chip: "Recently added",
    eyebrow: "Fresh collection",
    title: "New to your library",
    subtitle: "The latest tracks added to your collection",
    FooterIcon: Clock,
    footer: "Latest additions",
  },
  {
    id: "hyped-songs",
    accent: "#a98cf0",
    Icon: Flame,
    badge: "High voltage",
    chip: "Trending now",
    eyebrow: "Your hype zone",
    title: "Feel the hype",
    subtitle: "Your most exciting tracks for high-energy moments",
    FooterIcon: TrendingUp,
    footer: "On repeat",
  },
  {
    id: "most-played",
    accent: "#6ba6f2",
    Icon: Headphones,
    badge: "Heavy rotation",
    chip: "Top tracks",
    eyebrow: "Your top rotation",
    title: "Your all-time repeats",
    subtitle: "The tracks you keep coming back to, again and again",
    FooterIcon: Headphones,
    footer: "Most played",
  },
];

const s = StyleSheet.create({
  eqBar: { width: 2.5, borderRadius: 1 },
  fill: StyleSheet.absoluteFillObject,
  rim: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: DISC / 2,
    borderWidth: 1,
  },
  labelIcon: { position: "absolute", left: DISC / 2 - 8, top: DISC / 2 - 24 },
  meta: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
});

const LIST_CONTENT_STYLE = { paddingLeft: SIDE_PAD };
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 30 };
const keyExtractor = (item) => item.id;
const getItemLayout = (_, index) => ({
  length: ITEM_STRIDE,
  offset: SIDE_PAD + ITEM_STRIDE * index,
  index,
});

/* ----------------------------- equalizer ----------------------------- */

const EqBar = memo(function EqBar({ color, delay, animate }) {
  const height = useSharedValue(6);

  useEffect(() => {
    if (animate) {
      height.value = withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(12, { duration: 450 }),
            withTiming(3, { duration: 450 }),
          ),
          -1,
          false,
        ),
      );
    } else {
      cancelAnimation(height);
      height.value = withTiming(6, { duration: 150 });
    }
    return () => cancelAnimation(height);
  }, [animate, delay, height]);

  const animatedStyle = useAnimatedStyle(() => ({ height: height.value }));

  return (
    <Animated.View
      style={[s.eqBar, { backgroundColor: color }, animatedStyle]}
    />
  );
});

const EqualizerBars = memo(function EqualizerBars({ color, animate }) {
  const reduceMotion = useReducedMotion();
  const run = animate && !reduceMotion;
  return (
    <View className="h-3 flex-row items-end gap-0.5">
      {EQ_DELAYS.map((delay, i) => (
        <EqBar key={i} color={color} delay={delay} animate={run} />
      ))}
    </View>
  );
});

/* ------------------------------- record ------------------------------- */

// Static artwork. Memoized so it never re-renders while the record spins.
const DiscArt = memo(function DiscArt({ accent, Icon }) {
  return (
    <>
      <Svg width={DISC} height={DISC} viewBox="0 0 200 200">
        <Circle cx={100} cy={100} r={99} fill={DISC_BASE} />
        <Circle
          cx={100}
          cy={100}
          r={98}
          fill="none"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth={1}
        />
        {GROOVES.map((r) => (
          <Circle
            key={r}
            cx={100}
            cy={100}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={1}
          />
        ))}
        <Circle cx={100} cy={100} r={36} fill={accent} />
        <Circle
          cx={100}
          cy={100}
          r={31}
          fill="none"
          stroke="rgba(20,16,10,0.3)"
          strokeWidth={1}
        />
        <Circle cx={100} cy={100} r={3.5} fill={DISC_BASE} />
      </Svg>
      <View style={s.labelIcon}>
        <Icon size={16} color={INK} strokeWidth={2} />
      </View>
    </>
  );
});

// The light reflection stays fixed while the vinyl spins underneath it.
const Sheen = memo(function Sheen() {
  return (
    <View style={s.fill} pointerEvents="none">
      <Svg width={DISC} height={DISC} viewBox="0 0 200 200">
        <Path
          d="M100 100 L157.4 18.1 A100 100 0 0 1 186.6 50 Z"
          fill="rgba(255,255,255,0.07)"
        />
        <Path
          d="M100 100 L42.6 181.9 A100 100 0 0 1 13.4 150 Z"
          fill="rgba(255,255,255,0.07)"
        />
      </Svg>
    </View>
  );
});

const SpinningDisc = memo(function SpinningDisc({ accent, Icon, animate }) {
  const rotation = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const run = animate && !reduceMotion;

  useEffect(() => {
    if (run) {
      // Resume from the current angle instead of snapping back to 0.
      rotation.value = rotation.value % 360;
      rotation.value = withRepeat(
        withTiming(rotation.value + 360, {
          duration: SPIN_MS,
          easing: Easing.linear,
        }),
        -1,
        false,
      );
    } else {
      cancelAnimation(rotation);
    }
    return () => cancelAnimation(rotation);
  }, [run, rotation]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View
      style={[s.fill, spinStyle]}
      renderToHardwareTextureAndroid={run}
      shouldRasterizeIOS={run}
    >
      <DiscArt accent={accent} Icon={Icon} />
    </Animated.View>
  );
});

/* ------------------------------- item -------------------------------- */

const MixItem = memo(function MixItem({ mix, active, animate, onTogglePlay }) {
  const {
    id,
    accent,
    Icon,
    badge,
    chip,
    eyebrow,
    title,
    subtitle,
    FooterIcon,
    footer,
  } = mix;

  const handlePress = useCallback(() => onTogglePlay(id), [onTogglePlay, id]);

  return (
    <View className="w-[196px] pr-5">
      {/* badge */}
      <View className="mb-3 h-4 flex-row items-center gap-[7px]">
        {active ? (
          <EqualizerBars color={accent} animate={animate} />
        ) : (
          <Icon size={14} color={accent} strokeWidth={2} />
        )}
        <Text
          numberOfLines={1}
          className="text-[11px] uppercase tracking-[1.4px]"
          style={{ color: accent, fontFamily: WORDMARK_FONT }}
        >
          {badge}
        </Text>
      </View>

      {/* record */}
      <View className="mb-4 h-[176px] w-[176px]">
        <SpinningDisc accent={accent} Icon={Icon} animate={animate} />
        <Sheen />
        <View
          pointerEvents="none"
          style={[s.rim, { borderColor: active ? accent : "transparent" }]}
        />
        <Pressable
          onPress={handlePress}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`${active ? "Pause" : "Play"} ${title}`}
          className="absolute bottom-0 right-0 h-[46px] w-[46px] items-center justify-center rounded-full border active:opacity-80"
          style={{
            backgroundColor: active ? PLAY_ACTIVE_BG : accent,
            borderColor: accent,
          }}
        >
          {active ? (
            <Pause size={18} color={accent} strokeWidth={2} />
          ) : (
            <Play
              size={18}
              color={INK}
              strokeWidth={2}
              style={{ marginLeft: 2 }}
            />
          )}
        </Pressable>
      </View>

      {/* text block (fixed minimum heights keep the meta rows aligned) */}
      <Text
        numberOfLines={1}
        className="mb-1.5 text-[11px] uppercase tracking-[2px]"
        style={{ color: accent, fontFamily: WORDMARK_FONT }}
      >
        {eyebrow}
      </Text>
      <Text
        numberOfLines={2}
        className="min-h-[50px] text-[22px] leading-[25px] text-[#f6efe4]"
        style={{ fontFamily: "Quicksand_500Medium" }}
      >
        {title}
      </Text>
      <Text
        numberOfLines={2}
        className="mt-1.5 min-h-[34px] text-xs leading-[17px] text-[#9a8f80]"
      >
        {subtitle}
      </Text>

      {/* meta */}
      <View
        className="mt-2.5 min-h-[42px] flex-row items-start gap-1.5 pt-2.5"
        style={s.meta}
      >
        <FooterIcon
          size={14}
          color={accent}
          strokeWidth={2}
          style={{ marginTop: 1 }}
        />
        <Text
          numberOfLines={2}
          className="flex-1 text-xs leading-4 text-[#b3a794]"
          style={{ fontFamily: WORDMARK_FONT }}
        >
          {`${chip} · ${footer}`}
        </Text>
      </View>
    </View>
  );
});

/* ------------------------------ section ------------------------------ */

const InspiredForYou = memo(function InspiredForYou() {
  const router = useRouter();
  const isFocused = useIsFocused();

  const [playingId, setPlayingId] = useState(null);
  const [playingVisible, setPlayingVisible] = useState(true);
  const playingRef = useRef(null);

  const handleSeeAll = useCallback(() => {
    router.push("/library");
  }, [router]);

  const handleTogglePlay = useCallback((id) => {
    const next = playingRef.current === id ? null : id;
    playingRef.current = next;
    setPlayingId(next);
    setPlayingVisible(true);
    // Hook your player in here, e.g. next ? startMix(next) : pauseMix()
  }, []);

  // FlatList needs a stable reference here, hence the ref.
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    const playing = playingRef.current;
    if (playing == null) return;
    setPlayingVisible(viewableItems.some((v) => v.item.id === playing));
  }).current;

  const renderItem = useCallback(
    ({ item }) => {
      const active = item.id === playingId;
      return (
        <MixItem
          mix={item}
          active={active}
          animate={active && isFocused && playingVisible}
          onTogglePlay={handleTogglePlay}
        />
      );
    },
    [playingId, isFocused, playingVisible, handleTogglePlay],
  );

  return (
    <>
      <View className="mb-5 ml-0.5 mt-7 flex-row items-baseline justify-between">
        <Text
          className="text-[22px] tracking-[0.3px]"
          style={{ color: FG_COLOR, fontFamily: "Quicksand_500Medium" }}
        >
          Inspired for you
        </Text>

        <Pressable
          onPress={handleSeeAll}
          hitSlop={10}
          accessibilityRole="link"
          accessibilityLabel="See all in library"
          className="flex-row items-center gap-0.5 active:opacity-60"
        >
          <Text className="text-[13px] text-[#a89c8b]">See all</Text>
          <ChevronRight size={14} color="#a89c8b" strokeWidth={2} />
        </Pressable>
      </View>

      <FlatList
        horizontal
        data={MIXES}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        className="-mx-5 grow-0"
        contentContainerStyle={LIST_CONTENT_STYLE}
        showsHorizontalScrollIndicator={false}
        snapToInterval={ITEM_STRIDE}
        snapToAlignment="start"
        decelerationRate="fast"
        overScrollMode="never"
        initialNumToRender={3}
        maxToRenderPerBatch={2}
        windowSize={3}
        removeClippedSubviews
        viewabilityConfig={VIEWABILITY_CONFIG}
        onViewableItemsChanged={onViewableItemsChanged}
      />
    </>
  );
});

export default InspiredForYou;