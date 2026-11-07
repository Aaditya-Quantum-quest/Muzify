// NowPlayingScreen.jsx

// React Native + NativeWind port of the "Now Playing / Synced Lyrics" screen.

// Self-contained: colors and typography live in this file and are applied through `style`.

// NativeWind classes are only used for layout (default Tailwind scale, no theme config needed).

//

// Animation architecture:
// Reanimated drives looping, timeline, spring, progress, lyric and toast animations
// on the UI thread. The heavy screen tree mounts only while this route is focused.

// react-hooks/immutability is a false positive here: useSharedValue refs are
// designed to be mutated inside event handlers/effects, not replaced.
/* eslint-disable react-hooks/immutability */
import React, { useCallback, useEffect, useRef, useState } from "react";

import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";

import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  ZoomIn,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  cancelAnimation,
} from "react-native-reanimated";

import { useIsFocused } from "expo-router";

import { cssInterop } from "nativewind";

import { BlurView } from "expo-blur";

import { LinearGradient } from "expo-linear-gradient";

import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  useFonts,
  Sora_600SemiBold,
  Sora_700Bold,
} from "@expo-google-fonts/sora";

import {
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
} from "@expo-google-fonts/jetbrains-mono";

import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
} from "@expo-google-fonts/plus-jakarta-sans";

/* -------------------------------------------------------------------------- */

/* Colors (from colors.js, only the tokens this screen uses)                  */

/* -------------------------------------------------------------------------- */

const colors = {
  primary: "#ffc174",

  primaryContainer: "#f59e0b",

  primaryFixed: "#ffddb8",

  secondaryContainer: "#de0541",

  tertiary: "#ffc32d",

  surface: "#131316",

  surfaceBright: "#39393c",

  surfaceContainerLowest: "#0e0e11",

  surfaceContainerLow: "#1b1b1e",

  surfaceContainer: "#1f1f22",

  surfaceContainerHigh: "#2a2a2d",

  surfaceContainerHighest: "#353438",

  onSurface: "#e5e1e6",

  onSurfaceVariant: "#d8c3ad",

  onPrimary: "#472a00",

  outline: "#a08e7a",

  // the same tokens with the Tailwind opacity modifiers pre-applied (e.g. bg-surface/80)

  surface80: "rgba(19,19,22,0.8)",

  surfaceContainerLow70: "rgba(27,27,30,0.7)",

  surfaceContainerHigh90: "rgba(42,42,45,0.9)",

  primary10: "rgba(255,193,116,0.1)",
};

/* -------------------------------------------------------------------------- */

/* Typography presets (font family + size + line height + tracking)           */

/* -------------------------------------------------------------------------- */

const type = {
  headlineMd: {
    fontFamily: "Sora_600SemiBold",

    fontSize: 22,

    lineHeight: 28,

    letterSpacing: -0.22,
  },

  headlineSm: { fontFamily: "Sora_600SemiBold", fontSize: 18, lineHeight: 24 },

  displayMobile: {
    fontFamily: "Sora_700Bold",

    fontSize: 32,

    lineHeight: 40,

    letterSpacing: -0.64,
  },

  labelTechnical: {
    fontFamily: "JetBrainsMono_500Medium",

    fontSize: 12,

    lineHeight: 16,

    letterSpacing: 0.48,
  },

  labelTechnicalSemi: {
    fontFamily: "JetBrainsMono_600SemiBold",

    fontSize: 12,

    lineHeight: 16,

    letterSpacing: 0.48,
  },

  labelCodeSm: {
    fontFamily: "JetBrainsMono_500Medium",

    fontSize: 10,

    lineHeight: 14,

    letterSpacing: 0.6,
  },

  labelAction: {
    fontFamily: "PlusJakartaSans_600SemiBold",

    fontSize: 13,

    lineHeight: 18,

    letterSpacing: 0.13,
  },

  bodyMd: {
    fontFamily: "PlusJakartaSans_400Regular",

    fontSize: 14,

    lineHeight: 20,
  },

  bodyMdMedium: {
    fontFamily: "PlusJakartaSans_500Medium",

    fontSize: 14,

    lineHeight: 20,
  },

  bodySm: {
    fontFamily: "PlusJakartaSans_400Regular",

    fontSize: 12,

    lineHeight: 16,
  },
};

/* -------------------------------------------------------------------------- */

/* Data                                                                       */

/* -------------------------------------------------------------------------- */

const TOTAL_SECONDS = 278; // 04:38

const SYLLABLE_END = 0.6; // active line ends 3/5 lit, same as the w-3/5 bar in the markup

const IMG = {
  logo: "https://lh3.googleusercontent.com/aida/AEtjO1XrA980I8qrMTFOI_bQ3M8NDa_Lixi0_040t7RV8fjjl3n7hrlhtljIAgqNIsN3tYLKvTTMhiT6tE6RnDXn1tnLxBjvq20ZsjGHTsiPhh0eXfbWUDlZ8RB-OdyNH0DtHvqWenO7WJmjo6lq6fihfyrNWPvWNbP8cLfNy2ImW4SXEhR1Hym06YFmfKrfoQNOSCMJvvwEMs_NVLLnDujDt9yLBqVGFm_7ugElTljmDZDs",

  profile:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuBMayXr0t_AfPd9R_ZFeOmleAs4y_q81iYXyUcMenXi-4hwpBZuqToqn1ORjhCoTVuv_eCrBelP1V6MhwAQx9uR4xJZgJ7R5vpFueERtEO2hUmc5iWHXgxbv1bC0wkYBrttFIkumM5R0TrGqUsJEd9NCtyg-2OLQTxggxDeUrKdOB-ssHfKbYEIfMcJ8abgAaZ6hRYFAknA4fJdbiMexubmXatLJRwBIa76Su5LpEE8",

  cover:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuDaTopDe6s4OZiY5dtoWAkipkOCGempS6Bo25sK7SJ1eOu9A-e07H5bCojtdseD-W-zBnRpIu0vfkddC-XK54fBod-EKNtIXwGSAOl210SRgHeD8ZcRlaw5kzhyS5_wlFDDvAu-vTfElmoIuqSGP1o2g-BO9eU6kLtslDI9m30AWSUCYSE8JJ0BDy_D-H3BjSDmGMuYXC-Tm8Pe1d7uTLlQRkFNEDWN-OFhUYdbDYpk",
};

const LINES = [
  {
    id: 1,

    seconds: 102,

    text: "Echoes in the architecture",

    tr: "Koe ga tatemononai ni hibiku",

    base: 0.35,

    color: colors.onSurfaceVariant,
  },

  {
    id: 2,

    seconds: 118,

    text: "Submerged beneath the static pulse",

    tr: "Seidenki no kodou no shita ni shizumu",

    base: 0.5,

    color: colors.onSurfaceVariant,
  },

  {
    id: 3,

    seconds: 134,

    text: "We dissolve into the frequency",

    tr: "Watashitachi wa shuuhasuu no naka e tokeru",

    base: 1,

    color: colors.onSurface,
  },

  {
    id: 4,

    seconds: 150,

    text: "Holding resonance in empty air",

    tr: "Kuuhaku no kuuki ni kyoumei wo daite",

    base: 0.75,

    color: colors.onSurface,
  },

  {
    id: 5,

    seconds: 166,

    text: "Waveforms align across the dark",

    tr: "Yami wo koete hakei ga kasanariau",

    base: 0.6,

    color: colors.onSurfaceVariant,
  },

  {
    id: 6,

    seconds: 182,

    text: "Signal fades into the twilight calm",

    tr: "Tasogare no seijaku e shingou ga kieru",

    base: 0.4,

    color: colors.outline,
  },
];

const STEMS = [
  { key: "full", label: "Full Mix" },

  { key: "vocal", label: "Vocal Focus" },

  { key: "karaoke", label: "Karaoke", badge: "-36dB" },
];

const FORMANT_BARS = [
  { h: 6, color: "rgba(255,193,116,0.4)", delay: 0 },

  { h: 12, color: "rgba(255,193,116,0.7)", delay: 120 },

  { h: 14, color: colors.primary, delay: 240 },

  { h: 10, color: "rgba(255,193,116,0.9)", delay: 360 },

  { h: 4, color: "rgba(255,193,116,0.5)", delay: 480 },

  { h: 8, color: "rgba(255,179,181,0.8)", delay: 200 },

  { h: 4, color: "rgba(255,193,116,0.3)", delay: 150 },
];

const pad = (n) => String(n).padStart(2, "0");

const fmt = (s) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;

const glow = (color, opacity, radius) => ({
  shadowColor: color,

  shadowOpacity: opacity,

  shadowRadius: radius,

  shadowOffset: { width: 0, height: 0 },
});

/* -------------------------------------------------------------------------- */

/* Animation primitives                                                       */

/* -------------------------------------------------------------------------- */

// Pressable with a Reanimated press-scale (Tailwind `active:scale-95`)

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

cssInterop(AnimatedPressable, { className: "style" });

function PressableScale({
  to = 0.95,

  onPress,

  className,

  style,

  children,

  ...rest
}) {
  const s = useSharedValue(1);

  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));

  return (
    <AnimatedPressable
      onPressIn={() => {
        s.value = withSpring(to, { damping: 15, stiffness: 300 });
      }}

      onPressOut={() => {
        s.value = withSpring(1, { damping: 15, stiffness: 300 });
      }}

      onPress={onPress}

      className={className}

      style={[anim, style]}

      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}

// UI-thread pulse used by the aura and formant bars

function usePulse(delay = 0) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.48, {
            duration: 650,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(1, {
            duration: 650,
            easing: Easing.inOut(Easing.ease),
          }),
        ),
        -1,
        false,
      ),
    );

    return () => cancelAnimation(opacity);
  }, [delay, opacity]);

  return useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));
}

// Native-driven ping: scale 1 -> 2, opacity 1 -> 0.
function usePing() {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: 750,
          easing: Easing.out(Easing.ease),
        }),
        withTiming(0, { duration: 0 }),
        withDelay(250, withTiming(0, { duration: 0 })),
      ),
      -1,
      false,
    );

    return () => cancelAnimation(progress);
  }, [progress]);

  return useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ scale: 1 + progress.value }],
  }));
}

// `animate-spin` (native-driven, UI thread)

function useSpin(durationMs = 8000) {
  const r = useSharedValue(0);

  useEffect(() => {
    r.value = withRepeat(
      withTiming(360, { duration: durationMs, easing: Easing.linear }),

      -1,

      false,
    );
  }, [durationMs, r]);

  return useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
}

// Toast motion is entirely UI-thread driven; repeated calls restart the sequence.
function useToast() {
  const opacity = useSharedValue(0);
  const y = useSharedValue(8);
  const [message, setMessage] = useState("");

  const show = useCallback(
    (text) => {
      setMessage(text);

      cancelAnimation(opacity);
      cancelAnimation(y);

      opacity.value = withSequence(
        withTiming(1, {
          duration: 300,
          easing: Easing.out(Easing.ease),
        }),
        withDelay(
          1900,
          withTiming(0, {
            duration: 300,
            easing: Easing.in(Easing.ease),
          }),
        ),
      );

      y.value = withSequence(
        withTiming(0, {
          duration: 300,
          easing: Easing.out(Easing.ease),
        }),
        withDelay(
          1900,
          withTiming(8, {
            duration: 300,
            easing: Easing.in(Easing.ease),
          }),
        ),
      );
    },
    [opacity, y],
  );

  useEffect(
    () => () => {
      cancelAnimation(opacity);
      cancelAnimation(y);
    },
    [opacity, y],
  );

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }));

  return { message, show, style };
}

/* -------------------------------------------------------------------------- */

/* Small visual pieces                                                        */

/* -------------------------------------------------------------------------- */

function PingDot({ size = 8, color = colors.primary, withGlow = false }) {
  const ping = usePing();

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        style={[
          {
            width: size,

            height: size,

            borderRadius: size / 2,

            backgroundColor: color,
          },

          withGlow && glow(colors.primaryContainer, 1, 4),

          ping,
        ]}
      />
    </View>
  );
}

function PulseDot({ size = 6 }) {
  const pulse = usePulse();

  return (
    <Animated.View
      style={[
        {
          width: size,

          height: size,

          borderRadius: size / 2,

          backgroundColor: colors.primary,
        },

        pulse,
      ]}
    />
  );
}

function FormantBar({ h, color, delay }) {
  const pulse = usePulse(delay);

  return (
    <Animated.View
      style={[
        { width: 4, height: h, borderRadius: 9999, backgroundColor: color },

        pulse,
      ]}
    />
  );
}

// radial-gradient stand-in for the blurred ambient blobs (RN has no CSS blur)

function Aura({ size, color, peak = 0.14, id, style }) {
  return (
    <Animated.View
      pointerEvents="none"

      style={[{ position: "absolute", width: size, height: size }, style]}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={peak} />

            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

function IconButton({
  onPress,

  size = 32,

  radius = 8,

  bg = colors.surfaceContainerHigh,

  children,

  label,
}) {
  return (
    <PressableScale
      accessibilityLabel={label}

      onPress={onPress}

      className="items-center justify-center"

      style={{
        width: size,

        height: size,

        borderRadius: radius,

        backgroundColor: bg,
      }}
    >
      {children}
    </PressableScale>
  );
}

/* -------------------------------------------------------------------------- */

/* Header                                                                     */

/* -------------------------------------------------------------------------- */

function Header({ onBack }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="absolute top-0 inset-x-0 z-50"

      style={[{ paddingTop: insets.top, elevation: 4 }, glow("#000", 0.35, 4)]}
    >
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />

      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface80 }]}
      />

      <View className="h-16 px-5 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2 flex-1">
          <PressableScale
            accessibilityLabel="Go back"

            onPress={onBack}

            className="w-11 h-11 -ml-1 items-center justify-center rounded-full"
          >
            <MaterialIcons
              name="arrow-back"

              size={24}

              color={colors.onSurface}
            />
          </PressableScale>

          {/* width is a guess for the logo's aspect ratio – adjust to your asset */}

          <Image
            source={{ uri: IMG.logo }}

            style={{ height: 28, width: 84 }}

            resizeMode="contain"
          />

          <Text
            numberOfLines={1}

            className="shrink"

            style={[type.headlineSm, { color: colors.onSurface }]}
          >
            Now Playing
          </Text>
        </View>

        <View className="flex-row items-center gap-1">
          <PressableScale
            accessibilityLabel="More Options"

            className="w-11 h-11 items-center justify-center rounded-full"
          >
            <MaterialIcons
              name="more-vert"

              size={22}

              color={colors.onSurfaceVariant}
            />
          </PressableScale>

          <PressableScale
            accessibilityLabel="Profile"

            className="w-11 h-11 items-center justify-center rounded-full"
          >
            <Image
              source={{ uri: IMG.profile }}

              style={{ width: 32, height: 32, borderRadius: 16 }}
            />
          </PressableScale>
        </View>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */

/* Sections                                                                   */

/* -------------------------------------------------------------------------- */

function TelemetryStrip({ onStem, onToggleLang, langLabel, onShare }) {
  const spin = useSpin(8000);

  return (
    <View className="px-4 mt-1">
      <View
        className="flex-row items-center justify-between rounded-xl px-4 py-1"

        style={{ backgroundColor: colors.surfaceContainerLow }}
      >
        <View className="flex-row items-center gap-1 flex-1">
          <Animated.View style={spin}>
            <MaterialIcons name="graphic-eq" size={18} color={colors.primary} />
          </Animated.View>

          <View className="flex-1">
            <View className="flex-row items-center gap-1">
              <Text
                style={[type.labelTechnicalSemi, { color: colors.primary }]}
              >
                FLAC MASTER
              </Text>

              <Text
                style={[
                  type.labelCodeSm,

                  {
                    color: colors.onSurfaceVariant,

                    backgroundColor: colors.surfaceContainerHighest,

                    paddingHorizontal: 6,

                    paddingVertical: 2,

                    borderRadius: 4,

                    overflow: "hidden",
                  },
                ]}
              >
                96kHz / 24-bit
              </Text>
            </View>

            <Text
              numberOfLines={1}

              style={[type.labelCodeSm, { color: colors.onSurfaceVariant }]}
            >
              Bitrate: 2840 kbps • Low-Jitter Sync
            </Text>
          </View>
        </View>

        <View className="flex-row items-center gap-1">
          <IconButton label="Vocal Isolation Stem Mode" onPress={onStem}>
            <MaterialCommunityIcons
              name="microphone-variant"

              size={17}

              color={colors.onSurface}
            />
          </IconButton>

          <IconButton label="Toggle Lyrics Translation" onPress={onToggleLang}>
            <Text
              style={[type.labelTechnical, { color: colors.onSurfaceVariant }]}
            >
              {langLabel}
            </Text>
          </IconButton>

          <IconButton label="Generate Lyrics Poster" onPress={onShare}>
            <MaterialIcons
              name="ios-share"

              size={17}

              color={colors.onSurface}
            />
          </IconButton>
        </View>
      </View>
    </View>
  );
}

function TrackCard({ secs, onSeekRatio }) {
  const pct = Math.min(100, Math.max(5, (secs / TOTAL_SECONDS) * 100));

  const w = useSharedValue(pct);

  const [trackW, setTrackW] = useState(1);

  useEffect(() => {
    w.value = withTiming(pct, { duration: 300 });
  }, [pct, w]);

  const fill = useAnimatedStyle(() => ({ width: `${w.value}%` }));

  return (
    <View className="px-4 mt-2">
      <View
        className="rounded-xl p-4 gap-2"

        style={[
          { backgroundColor: colors.surfaceContainer, elevation: 4 },

          glow("#000", 0.3, 6),
        ]}
      >
        <View className="flex-row items-center gap-4">
          <View
            className="w-14 h-14 overflow-hidden"

            style={{
              borderRadius: 8,

              backgroundColor: colors.surfaceContainerLowest,
            }}
          >
            <Image
              source={{ uri: IMG.cover }}

              style={StyleSheet.absoluteFill}

              resizeMode="cover"
            />

            <LinearGradient
              colors={["rgba(14,14,17,0.8)", "transparent"]}

              start={{ x: 0.5, y: 1 }}

              end={{ x: 0.5, y: 0.4 }}

              style={StyleSheet.absoluteFill}
            />

            <View className="absolute bottom-1 right-1">
              <PingDot size={10} withGlow />
            </View>
          </View>

          <View className="flex-1">
            <View className="flex-row items-center justify-between gap-1">
              <Text
                numberOfLines={1}

                className="flex-1"

                style={[type.headlineSm, { color: colors.onSurface }]}
              >
                Obsidian Resonance
              </Text>

              <Text style={[type.labelTechnical, { color: colors.primary }]}>
                STEREO FIELD
              </Text>
            </View>

            <Text
              numberOfLines={1}

              style={[type.bodySm, { color: colors.onSurfaceVariant }]}
            >
              Kiasmos • Erased Tapes
            </Text>

            <Text
              numberOfLines={1}

              style={[type.labelCodeSm, { color: colors.outline }]}
            >
              Blurred EP • Stem 03 Lead Vocals
            </Text>
          </View>
        </View>

        <View className="gap-1 mt-1">
          <Pressable
            onLayout={(e) => setTrackW(e.nativeEvent.layout.width || 1)}

            onPress={(e) => onSeekRatio(e.nativeEvent.locationX / trackW)}

            hitSlop={8}

            className="w-full overflow-hidden"

            style={{
              height: 10,

              borderRadius: 9999,

              backgroundColor: colors.surfaceContainerLowest,
            }}
          >
            <Animated.View style={[{ height: "100%" }, fill]}>
              <LinearGradient
                colors={[
                  colors.primary,

                  colors.primaryContainer,

                  colors.secondaryContainer,
                ]}

                start={{ x: 0, y: 0 }}

                end={{ x: 1, y: 0 }}

                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </Pressable>

          <View className="flex-row items-center justify-between">
            <Text style={[type.labelTechnicalSemi, { color: colors.primary }]}>
              {fmt(secs)}
            </Text>

            <View className="flex-row items-center gap-1">
              <PulseDot size={6} />

              <Text
                style={[
                  type.labelTechnical,

                  { color: colors.outline, fontSize: 10 },
                ]}
              >
                PHASE LOCKED
              </Text>
            </View>

            <Text
              style={[type.labelTechnical, { color: colors.onSurfaceVariant }]}
            >
              04:38
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function StemSelector({ mode, onChange }) {
  const [w, setW] = useState(0);

  const x = useSharedValue(4);

  const measured = useRef(false);

  const idx = STEMS.findIndex((s) => s.key === mode);

  const pillW = w ? (w - 8 - 8) / 3 : 0;

  useEffect(() => {
    if (!w) return;

    const target = 4 + idx * (pillW + 4);

    if (!measured.current) {
      x.value = target; // no slide on first layout

      measured.current = true;
    } else {
      x.value = withSpring(target, { damping: 18, stiffness: 220 });
    }
  }, [idx, pillW, w, x]);

  const pill = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  return (
    <View className="px-4 mt-2">
      <View
        onLayout={(e) => setW(e.nativeEvent.layout.width)}

        className="p-1 rounded-xl flex-row items-center gap-1"

        style={{ backgroundColor: colors.surfaceContainerLowest }}
      >
        <Animated.View
          style={[
            {
              position: "absolute",

              top: 4,

              bottom: 4,

              left: 0,

              width: pillW,

              borderRadius: 8,

              backgroundColor: colors.surfaceContainerHigh,

              elevation: 1,
            },

            glow("#000", 0.2, 2),

            pill,
          ]}
        />

        {STEMS.map((s) => {
          const active = s.key === mode;

          return (
            <Pressable
              key={s.key}

              onPress={() => onChange(s.key)}

              className="flex-1 flex-row items-center justify-center gap-1"

              style={{ paddingVertical: 6 }}
            >
              <Text
                style={[
                  type.labelAction,

                  { color: active ? colors.primary : colors.onSurfaceVariant },
                ]}
              >
                {s.label}
              </Text>

              {s.badge && (
                <Text
                  style={[
                    type.labelCodeSm,

                    {
                      fontSize: 9,

                      color: colors.outline,

                      backgroundColor: colors.surfaceContainer,

                      paddingHorizontal: 4,

                      borderRadius: 4,

                      overflow: "hidden",
                    },
                  ]}
                >
                  {s.badge}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function FormantCard() {
  return (
    <View className="px-4 mt-1">
      <View
        className="rounded-xl px-4 py-1 flex-row items-center justify-between"

        style={{ backgroundColor: colors.surfaceContainerLow70 }}
      >
        <View className="flex-row items-center gap-2">
          <Text
            style={[
              type.labelCodeSm,

              { color: colors.onSurfaceVariant, textTransform: "uppercase" },
            ]}
          >
            Acoustic Formant
          </Text>

          <View
            className="flex-row items-end gap-0.5"

            style={{ height: 14, width: 80 }}
          >
            {FORMANT_BARS.map((b, i) => (
              <FormantBar key={i} {...b} />
            ))}
          </View>
        </View>

        <View className="flex-row items-center gap-1">
          <MaterialIcons name="tune" size={14} color={colors.primary} />

          <Text style={[type.labelCodeSm, { color: colors.primary }]}>
            432 Hz Core
          </Text>
        </View>
      </View>
    </View>
  );
}

/* ----------------------------- Lyrics ----------------------------------- */

// One word of the active line. Reanimated drives `wave` 0 -> SYLLABLE_END; this maps it to

// pending -> lit -> "glowing front word" (primaryFixed + stronger halo).

function Syllable({ word, index, count, wave }) {
  const pendingAlpha = index === Math.floor(SYLLABLE_END * count) ? 0.9 : 0.4;

  const pending = `rgba(229,225,230,${pendingAlpha})`;

  const style = useAnimatedStyle(() => {
    const pos = wave.value * count - 1;

    const a = Math.min(1, Math.max(0, pos - index + 1)); // lit amount

    const f = a * (1 - Math.min(1, Math.max(0, pos - index))); // "front word" amount

    const base = interpolateColor(a, [0, 1], [pending, colors.primary]);

    return {
      color: interpolateColor(f, [0, 1], [base, colors.primaryFixed]),

      textShadowColor: `rgba(255,193,116,${0.85 * a})`,

      textShadowRadius: 12 * a + 5 * f,
    };
  });

  return (
    <Animated.Text
      style={[
        type.displayMobile,

        { lineHeight: 44, textShadowOffset: { width: 0, height: 0 } },

        style,
      ]}
    >
      {word}
    </Animated.Text>
  );
}

function ActiveLineCard({ line, showTr }) {
  const wave = useSharedValue(0);

  const words = line.text.split(" ");

  useEffect(() => {
    wave.value = 0;

    wave.value = withTiming(SYLLABLE_END, {
      duration: 1400,

      easing: Easing.out(Easing.ease),
    });

    return () => cancelAnimation(wave);
  }, [line.id, wave]);

  const bar = useAnimatedStyle(() => ({ width: `${wave.value * 100}%` }));

  return (
    <View
      className="p-4 gap-1"

      style={[
        { backgroundColor: colors.surfaceContainerHigh90, borderRadius: 16 },

        glow(colors.primaryContainer, 0.3, 18),
      ]}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <PingDot size={8} />

          <Text style={[type.labelTechnicalSemi, { color: colors.primary }]}>
            NOW SINGING
          </Text>
        </View>

        <Text
          style={[
            type.labelCodeSm,

            {
              color: colors.primary,

              backgroundColor: colors.primary10,

              paddingHorizontal: 8,

              paddingVertical: 2,

              borderRadius: 9999,

              overflow: "hidden",
            },
          ]}
        >
          {fmt(line.seconds)}
        </Text>
      </View>

      <View
        className="flex-row flex-wrap mt-1"

        style={{ columnGap: 8, rowGap: 4 }}
      >
        {words.map((w, i) => (
          <Syllable
            key={`${line.id}-${i}`}

            word={w}

            index={i}

            count={words.length}

            wave={wave}
          />
        ))}
      </View>

      {showTr && (
        <Animated.View
          entering={FadeIn.duration(200)}

          exiting={FadeOut.duration(150)}

          className="flex-row items-center gap-2 mt-1"
        >
          <MaterialIcons name="translate" size={15} color={colors.tertiary} />

          <Text
            className="flex-1"

            style={[type.bodyMdMedium, { color: colors.onSurfaceVariant }]}
          >
            {line.tr}
          </Text>
        </Animated.View>
      )}

      <View
        className="w-full overflow-hidden mt-1"

        style={{
          height: 6,

          borderRadius: 9999,

          backgroundColor: colors.surfaceContainerLowest,
        }}
      >
        <Animated.View
          style={[
            { height: "100%", borderRadius: 9999, overflow: "hidden" },

            bar,
          ]}
        >
          <LinearGradient
            colors={[
              colors.primary,

              colors.tertiary,

              colors.secondaryContainer,
            ]}

            start={{ x: 0, y: 0 }}

            end={{ x: 1, y: 0 }}

            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
    </View>
  );
}

function InactiveLine({ line, showTr }) {
  return (
    <View className="gap-1 py-1">
      <View className="flex-row items-center gap-2">
        <Text style={[type.labelCodeSm, { color: colors.outline }]}>
          {fmt(line.seconds)}
        </Text>

        <Text
          className="flex-1"

          style={[type.headlineMd, { color: line.color }]}
        >
          {line.text}
        </Text>
      </View>

      {showTr && (
        <Animated.Text
          entering={FadeIn.duration(200)}

          exiting={FadeOut.duration(150)}

          style={[type.bodySm, { color: colors.outline, paddingLeft: 36 }]}
        >
          {line.tr}
        </Animated.Text>
      )}
    </View>
  );
}

function LyricRow({ line, isActive, opacity, showTr, onPress, onLayout }) {
  const o = useSharedValue(opacity);

  useEffect(() => {
    o.value = withTiming(opacity, { duration: 300 });
  }, [opacity, o]);

  const style = useAnimatedStyle(() => ({ opacity: o.value }));

  return (
    <Animated.View
      layout={LinearTransition.duration(250)}

      style={style}

      onLayout={onLayout}
    >
      <Pressable onPress={onPress}>
        {isActive ? (
          <ActiveLineCard line={line} showTr={showTr} />
        ) : (
          <InactiveLine line={line} showTr={showTr} />
        )}
      </Pressable>
    </Animated.View>
  );
}

function CuratorCard() {
  return (
    <View className="px-4 mt-6">
      <View
        className="rounded-xl p-4 gap-1"

        style={{ backgroundColor: colors.surfaceContainerLow }}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-1">
            <MaterialIcons name="verified" size={18} color={colors.primary} />

            <Text
              style={[
                type.labelTechnical,

                { color: colors.primary, textTransform: "uppercase" },
              ]}
            >
              Artist Notation &amp; Sync Verified
            </Text>
          </View>

          <Text style={[type.labelCodeSm, { color: colors.outline }]}>
            ±4ms accuracy
          </Text>
        </View>

        <Text
          style={[
            type.bodySm,

            { color: colors.onSurfaceVariant, lineHeight: 20 },
          ]}
        >
          Recorded at Greenhouse Studios, Reykjavík. Synthesizers tuned to
          natural room acoustics with analog tape loop phase shifting during the
          bridge segment.
        </Text>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */

/* Transport dock                                                             */

/* -------------------------------------------------------------------------- */

function TransportDock({
  isPlaying,

  onPlay,

  onPrev,

  onNext,

  onRewind,

  onForward,

  offsetLabel,

  onOffset,

  autoScroll,

  onAutoScroll,

  loopVerse,

  onLoop,

  onHeight,
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      onLayout={(e) => onHeight(e.nativeEvent.layout.height)}

      className="absolute inset-x-0 bottom-0 px-4 pt-1"

      style={{ paddingBottom: insets.bottom + 8 }}
    >
      <View
        style={[
          { borderRadius: 16, elevation: 16 },

          glow("#000", 0.65, 16),

          { shadowOffset: { width: 0, height: 8 } },
        ]}
      >
        <View
          style={[
            StyleSheet.absoluteFill,

            { borderRadius: 16, overflow: "hidden" },
          ]}
        >
          <BlurView
            intensity={40}

            tint="dark"

            style={StyleSheet.absoluteFill}
          />

          <View
            style={[
              StyleSheet.absoluteFill,

              { backgroundColor: colors.surfaceContainerHigh90 },
            ]}
          />
        </View>

        <View className="p-4 gap-2">
          {/* utility row */}

          <View className="flex-row items-center justify-between pb-1">
            <PressableScale
              onPress={onOffset}

              to={0.96}

              className="flex-row items-center gap-1 py-1"

              style={{
                backgroundColor: colors.surfaceContainer,

                paddingHorizontal: 10,

                borderRadius: 9999,
              }}
            >
              <MaterialIcons
                name="tune"

                size={14}

                color={colors.onSurfaceVariant}
              />

              <Text
                style={[type.labelCodeSm, { color: colors.onSurfaceVariant }]}
              >
                {offsetLabel}
              </Text>
            </PressableScale>

            <View className="flex-row items-center gap-2">
              <PressableScale
                onPress={onAutoScroll}

                to={0.96}

                className="flex-row items-center gap-1 py-1"

                style={{
                  backgroundColor: autoScroll
                    ? colors.primary10
                    : colors.surfaceContainer,

                  paddingHorizontal: 10,

                  borderRadius: 9999,
                }}
              >
                <MaterialIcons
                  name="vertical-align-center"

                  size={14}

                  color={autoScroll ? colors.primary : colors.outline}
                />

                <Text
                  style={[
                    type.labelCodeSm,

                    { color: autoScroll ? colors.primary : colors.outline },
                  ]}
                >
                  {autoScroll ? "Auto-Lock On" : "Free Scroll"}
                </Text>
              </PressableScale>

              <IconButton
                label="Loop Verse"

                size={28}

                radius={14}

                bg={colors.surfaceContainer}

                onPress={onLoop}
              >
                <MaterialIcons
                  name="repeat-one"

                  size={15}

                  color={loopVerse ? colors.primary : colors.onSurfaceVariant}
                />
              </IconButton>
            </View>
          </View>

          {/* primary transport */}

          <View className="flex-row items-center justify-between px-2">
            <PressableScale
              accessibilityLabel="Previous Lyric Line"

              onPress={onPrev}

              className="w-10 h-10 rounded-full items-center justify-center"
            >
              <MaterialIcons
                name="skip-previous"

                size={24}

                color={colors.onSurfaceVariant}
              />
            </PressableScale>

            <PressableScale
              accessibilityLabel="Rewind 10 Seconds"

              onPress={onRewind}

              className="w-10 h-10 rounded-full items-center justify-center"
            >
              <MaterialIcons
                name="replay-10"

                size={20}

                color={colors.onSurfaceVariant}
              />
            </PressableScale>

            <PressableScale
              accessibilityLabel="Play or Pause"

              onPress={onPlay}

              className="w-14 h-14 rounded-full items-center justify-center"

              style={[
                { backgroundColor: colors.primary },

                isPlaying ? glow(colors.primaryContainer, 0.45, 12) : null,
              ]}
            >
              <Animated.View
                key={isPlaying ? "pause" : "play"}

                entering={ZoomIn.duration(150)}
              >
                <MaterialIcons
                  name={isPlaying ? "pause" : "play-arrow"}

                  size={32}

                  color={colors.onPrimary}
                />
              </Animated.View>
            </PressableScale>

            <PressableScale
              accessibilityLabel="Forward 10 Seconds"

              onPress={onForward}

              className="w-10 h-10 rounded-full items-center justify-center"
            >
              <MaterialIcons
                name="forward-10"

                size={20}

                color={colors.onSurfaceVariant}
              />
            </PressableScale>

            <PressableScale
              accessibilityLabel="Next Lyric Line"

              onPress={onNext}

              className="w-10 h-10 rounded-full items-center justify-center"
            >
              <MaterialIcons
                name="skip-next"

                size={24}

                color={colors.onSurfaceVariant}
              />
            </PressableScale>
          </View>
        </View>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */

/* Screen                                                                     */

/* -------------------------------------------------------------------------- */

function NowPlaying({ onBack }) {
  const insets = useSafeAreaInsets();

  const toast = useToast();

  const [isPlaying, setIsPlaying] = useState(true);

  const [autoScroll, setAutoScroll] = useState(true);

  const [offsetTenths, setOffsetTenths] = useState(null); // null = untouched ("±0.0s")

  const [activeIndex, setActiveIndex] = useState(2);

  const [hasSeeked, setHasSeeked] = useState(false);

  const [secs, setSecs] = useState(134);

  const [showTr, setShowTr] = useState(true);

  const [stemMode, setStemMode] = useState("full");

  const [loopVerse, setLoopVerse] = useState(false);

  const [dockH, setDockH] = useState(170);

  const auraPulse = usePulse(); // animate-pulse on the top aura blob

  // auto-scroll bookkeeping

  const scrollRef = useRef(null);

  const viewportH = useRef(0);

  const lyricsY = useRef(0);

  const rowLayouts = useRef({});
  const scrollTimer = useRef(null);

  useEffect(() => {
    return () => {
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    };
  }, []);

  const scrollToLine = useCallback((i) => {
    const r = rowLayouts.current[i];

    if (!r) return;

    const y = lyricsY.current + r.y + r.height / 2 - viewportH.current / 2;

    scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: true });
  }, []);

  const clampSecs = (s) => Math.max(0, Math.min(TOTAL_SECONDS, s));

  const selectLine = useCallback(
    (i) => {
      const line = LINES[i];

      setActiveIndex(i);

      setHasSeeked(true);

      setSecs(line.seconds);

      toast.show(`Seeked to line [${fmt(line.seconds)}]`);

      // wait for the layout transition so measured positions are final

      if (scrollTimer.current) clearTimeout(scrollTimer.current);
      if (autoScroll) {
        scrollTimer.current = setTimeout(() => {
          scrollToLine(i);
          scrollTimer.current = null;
        }, 300);
      }
    },

    [autoScroll, scrollToLine, toast],
  );

  const togglePlay = () => {
    setIsPlaying((p) => {
      toast.show(p ? "Playback paused" : "Resuming synced vocal playback");

      return !p;
    });
  };

  const changeStem = (key) => {
    setStemMode(key);

    toast.show(`DSP Mode: ${key.toUpperCase()} Stem Isolation`);
  };

  const cycleStemFromMic = () => {
    const next =
      STEMS[(STEMS.findIndex((s) => s.key === stemMode) + 1) % STEMS.length]
        .key;

    changeStem(next);
  };

  const toggleLang = () => {
    setShowTr((v) => {
      toast.show(v ? "Original vocal script only" : "Bilingual script enabled");

      return !v;
    });
  };

  const toggleAutoScroll = () => {
    setAutoScroll((v) => {
      toast.show(v ? "Auto-scroll unlatched" : "Auto-scroll tracking active");

      return !v;
    });
  };

  const cycleOffset = () => {
    const next =
      offsetTenths === null ? 1 : offsetTenths >= 5 ? -4 : offsetTenths + 1;

    setOffsetTenths(next);

    toast.show(
      `Vocal offset adjusted: ${next >= 0 ? "+" : ""}${(next / 10).toFixed(1)}s`,
    );
  };

  const offsetLabel =
    offsetTenths === null
      ? "Sync ±0.0s"
      : `Sync ${offsetTenths >= 0 ? "+" : ""}${(offsetTenths / 10).toFixed(1)}s`;

  const toggleLoop = () => {
    setLoopVerse((v) => {
      toast.show(v ? "Verse loop off" : "Verse loop on");

      return !v;
    });
  };

  const prev = () => activeIndex > 0 && selectLine(activeIndex - 1);

  const next = () =>
    activeIndex < LINES.length - 1 && selectLine(activeIndex + 1);

  const rewind = () => {
    setSecs((s) => clampSecs(s - 10));

    toast.show("Rewind 10s");
  };

  const forward = () => {
    setSecs((s) => clampSecs(s + 10));

    toast.show("Forward 10s");
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.surface }}>
      <ScrollView
        ref={scrollRef}

        onLayout={(e) => (viewportH.current = e.nativeEvent.layout.height)}

        showsVerticalScrollIndicator={false}

        contentContainerStyle={{
          paddingTop: insets.top + 64,

          paddingBottom: dockH + 32,
        }}
      >
        {/* ambient audio aura */}

        <View
          pointerEvents="none"

          className="absolute inset-x-0 top-0 overflow-hidden"

          style={{ height: 540 }}
        >
          <Aura
            id="aura-a"

            size={480}

            color={colors.primary}

            peak={0.14}

            style={[{ top: -128, left: "50%", marginLeft: -240 }, auraPulse]}
          />

          <Aura
            id="aura-b"

            size={288}

            color={colors.secondaryContainer}

            peak={0.12}

            style={{ top: 128, right: -40 }}
          />
        </View>

        <TelemetryStrip
          langLabel={showTr ? "EN" : "RO"}

          onStem={cycleStemFromMic}

          onToggleLang={toggleLang}

          onShare={() => toast.show("Crafting 96kHz Lossless Lyric Card...")}
        />

        <TrackCard
          secs={secs}

          onSeekRatio={(r) =>
            setSecs(
              clampSecs(
                Math.round(Math.min(1, Math.max(0, r)) * TOTAL_SECONDS),
              ),
            )
          }
        />

        <StemSelector mode={stemMode} onChange={changeStem} />

        <FormantCard />

        {/* synchronized lyric stream */}

        <View
          onLayout={(e) => (lyricsY.current = e.nativeEvent.layout.y)}

          className="px-4 mt-4 gap-6"

          style={{ minHeight: 460 }}
        >
          {LINES.map((line, i) => (
            <LyricRow
              key={line.id}

              line={line}

              isActive={i === activeIndex}

              opacity={i === activeIndex ? 1 : hasSeeked ? 0.5 : line.base}

              showTr={showTr}

              onPress={() => selectLine(i)}

              onLayout={(e) => (rowLayouts.current[i] = e.nativeEvent.layout)}
            />
          ))}
        </View>

        <CuratorCard />
      </ScrollView>

      <Header onBack={onBack} />

      <TransportDock
        isPlaying={isPlaying}

        onPlay={togglePlay}

        onPrev={prev}

        onNext={next}

        onRewind={rewind}

        onForward={forward}

        offsetLabel={offsetLabel}

        onOffset={cycleOffset}

        autoScroll={autoScroll}

        onAutoScroll={toggleAutoScroll}

        loopVerse={loopVerse}

        onLoop={toggleLoop}

        onHeight={setDockH}
      />

      {/* toast sits just above the dock */}

      <View
        pointerEvents="none"

        className="absolute inset-x-0 items-center z-50"

        style={{ bottom: dockH + 12 }}
      >
        <Animated.View
          className="flex-row items-center gap-2 px-4 py-2"

          style={[
            {
              backgroundColor: colors.surfaceBright,

              borderRadius: 9999,

              elevation: 12,
            },

            glow("#000", 0.4, 12),

            toast.style,
          ]}
        >
          <MaterialIcons name="auto-awesome" size={18} color={colors.primary} />

          <Text style={[type.bodySm, { color: colors.onSurface }]}>
            {toast.message}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

/**
 * Expo Router screens expose useIsFocused() for route focus.
 * Returning null unmounts the
 * expensive NowPlaying tree when another route is on top.
 */
export default function LyricsScreen({ onBack = () => {} }) {
  const isFocused = useIsFocused();

  const [fontsLoaded] = useFonts({
    Sora_600SemiBold,
    Sora_700Bold,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
  });

  if (!fontsLoaded || !isFocused) return null;

  return <NowPlaying onBack={onBack} />;
}
