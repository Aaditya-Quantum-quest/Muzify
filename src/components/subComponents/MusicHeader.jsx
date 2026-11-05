import React, { useEffect, useMemo, memo } from "react";
import { View, Text, TouchableOpacity } from "react-native";

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  interpolate,
  interpolateColor,
  cancelAnimation,
} from "react-native-reanimated";
import { Search, Settings } from "lucide-react-native";

/* ---------- fonts ---------- */
const WORDMARK_FONT = "PlaywriteITTrad_400Regular";
const WORD_FONT = WORDMARK_FONT;

/* ---------- animation config ---------- */
const ITEM_H = 72; // height of one word row in the swipe slot
const WORD_SIZE = 44;
const HOLD = 1.8; // seconds each word stays on screen
const SWIPE = 0.8; // seconds for the swipe-up
const DOT_LIFT = 20; // lifts the dot to sit on the word's baseline
const RED = "#ff2d55";

const HUE_COLORS = [
  "#c49a65",
  "#5ac8fa",
  "#bf5af2",
  "#30d158",
  "#ff9f0a",
  "#c49a65",
];
const PILL_COLORS = [RED, "#5ac8fa", "#bf5af2", "#30d158", RED];

/* ---------- helpers ---------- */
// Reanimated's interpolateColor is worklet-safe and handles hex strings
// natively, so the color cycle runs on the UI thread with no JS bridge hop.
const hueRange = HUE_COLORS.map((_, i) => i / (HUE_COLORS.length - 1));
const pillRange = PILL_COLORS.map((_, i) => i / (PILL_COLORS.length - 1));

function useLinearLoop(duration, active) {
  const v = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      cancelAnimation(v);
      return;
    }

    v.value = withRepeat(
      withTiming(1, {
        duration: duration * 1000,
        easing: Easing.linear,
      }),
      -1,
      false,
    );

    return () => cancelAnimation(v);
  }, [active, duration, v]);

  return v;
}

function useBreathe(duration, active) {
  const v = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      cancelAnimation(v);
      return;
    }

    v.value = withRepeat(
      withTiming(1, {
        duration: duration * 1000,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );

    return () => cancelAnimation(v);
  }, [active, duration, v]);

  return v;
}

// 0 -> 1 -> 2 ... -> count-1, holding on each step, then loops.
// The last item repeats the first word, so the loop restarts without a visible jump.
function useSmoothSwipe(count, active) {
  const v = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      cancelAnimation(v);
      return;
    }

    const segments = [];

    for (let i = 0; i < count; i += 1) {
      segments.push(
        withTiming(i, {
          duration: HOLD * 1000,
          easing: Easing.out(Easing.quad),
        }),
      );

      if (i < count - 1) {
        segments.push(
          withTiming(i + 1, {
            duration: SWIPE * 1000,
            easing: Easing.bezier(0.4, 0, 0.2, 1),
          }),
        );
      }
    }

    segments.push(withTiming(0, { duration: 0 }));

    v.value = withRepeat(withSequence(...segments), -1, false);

    return () => cancelAnimation(v);
  }, [active, count, v]);

  return v;
}

/* ---------- small pieces ---------- */
function GlowDot({ glow }) {
  const style = useAnimatedStyle(() => {
    const g = glow.value;
    const opacity = interpolate(g, [0, 1], [0.7, 0.12]);
    const scale = interpolate(g, [0, 1], [1.4, 3.6]);
    return { opacity, transform: [{ scale }] };
  });

  return (
    <View
      className="ml-3 items-center justify-center self-end"
      style={{ width: 10, height: 10, marginBottom: DOT_LIFT }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: RED,
          },
          { transformOrigin: "center" },
          style,
        ]}
      />
      <View
        style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: RED }}
      />
    </View>
  );
}

function WordRow({ word, glow }) {
  return (
    <View className="flex-row" style={{ height: ITEM_H }}>
      <Text
        numberOfLines={1}
        className="text-white"
        style={{
          fontFamily: "Quicksand_400Regular",
          fontSize: 45,
          lineHeight: ITEM_H,
          letterSpacing: 4,
          textAlignVertical: "center",
          fontWeight: "500",
        }}
      >
        {word}
      </Text>
      <GlowDot glow={glow} />
    </View>
  );
}

function GlowPill({ label, glow, pillColorStyle }) {
  const ring1 = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 1], [0.05, 0.16]),
  }));
  const ring2 = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 1], [0.12, 0.34]),
  }));

  return (
    <View className="items-center justify-center">
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: -6,
            bottom: -6,
            left: -6,
            right: -6,
            borderRadius: 999,
            borderWidth: 3,
          },
          ring1,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: -3,
            bottom: -3,
            left: -3,
            right: -3,
            borderRadius: 999,
            borderWidth: 2,
          },
          ring2,
        ]}
      />
      <Animated.View
        style={[
          {
            borderWidth: 1,
            borderRadius: 999,
            paddingHorizontal: 12,
            paddingVertical: 6,
          },
          pillColorStyle,
        ]}
      >
        <Text className="text-[10px] uppercase tracking-widest text-white/60">
          {label}
        </Text>
      </Animated.View>
    </View>
  );
}

/* ---------- main component ---------- */
function MusicHeader({
  active = true,
  heading = "N MUSIC",
  subTitle = "DSD 11.2MHz · Native Stream",
  tagline = "Bit-Perfect",
  title = "GoodMusic",
  words = ["Today", "Tomorrow", "Forever"],
  description = "Curated acoustic spaces, pristine waveforms & calibrated daily sessions.",
  C = { fg: "#FFFFFF" },
  goArtists = () => {},
}) {
  const list = useMemo(() => [...words, words[0]], [words]);

  const hue = useLinearLoop(14, active);
  const pillHue = useLinearLoop(5, active);
  const glow = useBreathe(0.9, active);
  const swipe = useSmoothSwipe(list.length, active);

  const subColorStyle = useAnimatedStyle(() => ({
    color: interpolateColor(hue.value, hueRange, HUE_COLORS),
  }));

  const pillColorStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(pillHue.value, pillRange, PILL_COLORS),
  }));

  const slotStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: swipe.value * -ITEM_H }],
  }));

  return (
    <View className="w-full">
      {/* Top Navigation */}
      <View className="mt-4 flex-row items-center justify-between">
        <Text
          className="text-4xl tracking-[4px] "
          style={{
            color: C.fg,
            textTransform: "none",
            fontFamily: "Quicksand_400Regular",
          }}
        >
          {heading}
        </Text>

        <View className="flex-row items-center">
          <TouchableOpacity
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Search"
          >
            <Search size={24} color={C.fg} strokeWidth={1.8} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={goArtists}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="ml-5"
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Settings size={24} color={C.fg} strokeWidth={1.8} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Music Header */}
      <View className="mt-3 w-full">
        {/* Subtitle and Tagline */}
        <View className="mb-2 flex-row flex-wrap items-center gap-3">
          <Animated.Text
            style={[
              {
                fontSize: 12,
                fontWeight: "600",
                letterSpacing: 2,
                textTransform: "uppercase",
              },
              subColorStyle,
            ]}
          >
            {subTitle}
          </Animated.Text>
          <GlowPill
            label={tagline}
            glow={glow}
            pillColorStyle={pillColorStyle}
          />
        </View>

        {/* Hero Heading */}
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          className="text-6xl leading-[54px] tracking-[2px] mt-2 text-white capitalize"
          style={{ fontFamily: "Quicksand_500Medium" }}
        >
          {title}
        </Text>

        {/* Swipe-up word slot */}
        <View style={{ height: ITEM_H, overflow: "hidden", marginTop: -4 }}>
          <Animated.View style={slotStyle}>
            {list.map((word, i) => (
              <WordRow
                key={`${word}-${i}`}
                word={word}
                glow={glow}
                style={{ fontWeight: "400" }}
              />
            ))}
          </Animated.View>
        </View>

        {/* Description */}
        <Text className="mt-1 max-w-[380px] leading-5 tracking-wider text-white/60">
          {description}
        </Text>
      </View>
    </View>
  );
}

export default memo(MusicHeader);
