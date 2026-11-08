// NowPlayingScreen.jsx
// React Native + NativeWind. Paper-and-ink synced-lyrics screen with a Tune sheet.
//
// Performance architecture
// - useIsFocused: when the route is not focused, nothing is rendered (not even the
//   fonts gate). The player state lives in the outer LyricsScreen, so it survives
//   the heavy tree being unmounted and is restored when the screen is focused again.
// - Animations run on the UI thread (Reanimated). Nothing animates continuously on
//   the main screen. The word sweep is a one-shot, and the only looping animation
//   (the formant bars) only exists while the Tune sheet is open.
// - The Tune sheet mounts on open and unmounts after its close animation finishes.
// - The toast keeps its message in its own component (imperative ref), so showing a
//   toast never re-renders the screen.
// - Lyrics use a FlatList with memoized rows. Rows far from the active line receive
//   identical props, so they skip re-rendering. Only one line mounts the animated
//   word components.
// - Handlers are stable (useCallback), data and styles are module-level constants,
//   and OS "reduce motion" is respected.

import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  BackHandler,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  cancelAnimation,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useIsFocused } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
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
/* Tokens                                                                     */
/* -------------------------------------------------------------------------- */

const C = {
  paper: "#f3efe8",
  paperClear: "rgba(243,239,232,0)",
  ink: "#15130f",
  muted: "#6f695f",
  crimson: "#d4063a",
  pending: "rgba(21,19,15,0.22)",
  sheet: "#fbf9f5",
  scrim: "rgba(21,19,15,0.42)",
  toastIcon: "#ff8aa6",
};

const F = {
  sora6: "Sora_600SemiBold",
  sora7: "Sora_700Bold",
  mono: "JetBrainsMono_500Medium",
  jak4: "PlusJakartaSans_400Regular",
  jak6: "PlusJakartaSans_600SemiBold",
};

const s = StyleSheet.create({
  sora6: { fontFamily: F.sora6 },
  sora7: { fontFamily: F.sora7 },
  mono: { fontFamily: F.mono },
  jak4: { fontFamily: F.jak4 },
  jak6: { fontFamily: F.jak6 },
  fill: StyleSheet.absoluteFillObject,
  words: { columnGap: 8, justifyContent: "center" },
  activeWord: {
    fontFamily: F.sora7,
    fontSize: 31,
    lineHeight: 40,
    letterSpacing: -0.5,
    color: C.ink,
  },
  underline: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 3,
    height: 3,
    backgroundColor: C.crimson,
  },
  barFill: { height: "100%", backgroundColor: C.crimson },
  trackFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: C.crimson,
  },
  formantBar: { width: 3, borderRadius: 2, backgroundColor: C.ink },
});

/* -------------------------------------------------------------------------- */
/* Data                                                                       */
/* -------------------------------------------------------------------------- */

const TOTAL_SECONDS = 278; // 04:38
const SYLLABLE_END = 0.6; // active line ends 3/5 lit
const OPACITY_BY_DISTANCE = [1, 0.5, 0.34, 0.24, 0.18, 0.14];
const OFFSET_LIMIT = 5; // tenths of a second, so +/-0.5s

// Replace with your own cover asset.
const COVER_URI =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDaTopDe6s4OZiY5dtoWAkipkOCGempS6Bo25sK7SJ1eOu9A-e07H5bCojtdseD-W-zBnRpIu0vfkddC-XK54fBod-EKNtIXwGSAOl210SRgHeD8ZcRlaw5kzhyS5_wlFDDvAu-vTfElmoIuqSGP1o2g-BO9eU6kLtslDI9m30AWSUCYSE8JJ0BDy_D-H3BjSDmGMuYXC-Tm8Pe1d7uTLlQRkFNEDWN-OFhUYdbDYpk";

const LINES = [
  {
    id: 1,
    seconds: 102,
    text: "Echoes in the architecture",
    tr: "Koe ga tatemononai ni hibiku",
  },
  {
    id: 2,
    seconds: 118,
    text: "Submerged beneath the static pulse",
    tr: "Seidenki no kodou no shita ni shizumu",
  },
  {
    id: 3,
    seconds: 134,
    text: "We dissolve into the frequency",
    tr: "Watashitachi wa shuuhasuu no naka e tokeru",
  },
  {
    id: 4,
    seconds: 150,
    text: "Holding resonance in empty air",
    tr: "Kuuhaku no kuuki ni kyoumei wo daite",
  },
  {
    id: 5,
    seconds: 166,
    text: "Waveforms align across the dark",
    tr: "Yami wo koete hakei ga kasanariau",
  },
  {
    id: 6,
    seconds: 182,
    text: "Signal fades into the twilight calm",
    tr: "Tasogare no seijaku e shingou ga kieru",
  },
];

const STEMS = [
  { key: "full", label: "Full mix" },
  { key: "vocal", label: "Vocal focus" },
  { key: "karaoke", label: "Karaoke", badge: "-36dB" },
];

const FORMANT_BARS = [
  { h: 6, delay: 0 },
  { h: 12, delay: 120 },
  { h: 14, delay: 240 },
  { h: 10, delay: 360 },
  { h: 4, delay: 480 },
  { h: 8, delay: 200 },
  { h: 4, delay: 150 },
];

const pad = (n) => String(n).padStart(2, "0");
const fmt = (sec) => `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const formatOffset = (tenths) =>
  tenths === 0
    ? "±0.0s"
    : `${tenths > 0 ? "+" : ""}${(tenths / 10).toFixed(1)}s`;

const clamp01 = (v) => {
  "worklet";
  return Math.min(1, Math.max(0, v));
};

/* -------------------------------------------------------------------------- */
/* Toast (message state lives here, so the screen never re-renders for it)    */
/* -------------------------------------------------------------------------- */

const Toast = memo(
  forwardRef(function Toast({ top }, ref) {
    const [message, setMessage] = useState("");
    const opacity = useSharedValue(0);
    const y = useSharedValue(-8);

    useImperativeHandle(
      ref,
      () => ({
        show(text) {
          setMessage(text);
          cancelAnimation(opacity);
          cancelAnimation(y);
          opacity.value = withSequence(
            withTiming(1, { duration: 250 }),
            withDelay(1900, withTiming(0, { duration: 300 })),
          );
          y.value = withSequence(
            withTiming(0, { duration: 250 }),
            withDelay(1900, withTiming(-8, { duration: 300 })),
          );
        },
      }),
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

    return (
      <View
        pointerEvents="none"
        className="absolute inset-x-0 items-center"
        style={{ top }}
      >
        <Animated.View
          className="flex-row items-center gap-2 rounded-full bg-[#15130f] px-3.5 py-2"
          style={style}
        >
          <MaterialIcons name="auto-awesome" size={16} color={C.toastIcon} />
          <Text className="text-xs text-[#f3efe8]" style={s.jak4}>
            {message}
          </Text>
        </Animated.View>
      </View>
    );
  }),
);

/* -------------------------------------------------------------------------- */
/* Lyrics                                                                     */
/* -------------------------------------------------------------------------- */

// One word of the active line. `wave` runs 0 -> SYLLABLE_END on the UI thread:
// pending -> sung (ink) -> current word (crimson + underline).
const Word = memo(function Word({ word, index, count, wave }) {
  const textStyle = useAnimatedStyle(() => {
    const pos = wave.value * count - 1;
    const a = clamp01(pos - index + 1);
    const f = a * (1 - clamp01(pos - index));
    const base = interpolateColor(a, [0, 1], [C.pending, C.ink]);
    return { color: interpolateColor(f, [0, 1], [base, C.crimson]) };
  });

  const underlineStyle = useAnimatedStyle(() => {
    const pos = wave.value * count - 1;
    const a = clamp01(pos - index + 1);
    return { opacity: a * (1 - clamp01(pos - index)) };
  });

  return (
    <View>
      <Animated.Text style={[s.activeWord, textStyle]}>{word}</Animated.Text>
      <Animated.View style={[s.underline, underlineStyle]} />
    </View>
  );
});

const ActiveLine = memo(function ActiveLine({ line, showTr }) {
  const reduceMotion = useReducedMotion();
  const wave = useSharedValue(0);
  const words = useMemo(() => line.text.split(" "), [line.text]);

  useEffect(() => {
    cancelAnimation(wave);
    if (reduceMotion) {
      wave.value = SYLLABLE_END;
    } else {
      wave.value = 0;
      wave.value = withTiming(SYLLABLE_END, {
        duration: 1400,
        easing: Easing.out(Easing.ease),
      });
    }
    return () => cancelAnimation(wave);
  }, [line.id, reduceMotion, wave]);

  const barStyle = useAnimatedStyle(() => ({ width: `${wave.value * 100}%` }));

  return (
    <View className="items-center">
      <Text className="mb-1.5 text-[10px] tracking-[0.8px] text-[#d4063a]" style={s.mono}>
        {`${fmt(line.seconds)} · NOW SINGING`}
      </Text>

      <View className="flex-row flex-wrap" style={s.words}>
        {words.map((w, i) => (
          <Word
            key={`${line.id}-${i}`}
            word={w}
            index={i}
            count={words.length}
            wave={wave}
          />
        ))}
      </View>

      {showTr && (
        <Animated.Text
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          className="mt-3 text-center text-sm leading-5 text-[#3d382f]"
          style={s.jak4}
        >
          {line.tr}
        </Animated.Text>
      )}

      <View className="mt-4 h-0.5 w-[120px] overflow-hidden bg-[#15130f]/[0.12]">
        <Animated.View style={[s.barFill, barStyle]} />
      </View>
    </View>
  );
});

const InactiveLine = memo(function InactiveLine({ line, showTr }) {
  return (
    <View className="items-center">
      <Text className="mb-1.5 text-[10px] tracking-[0.8px] text-[#15130f]/40" style={s.mono}>
        {fmt(line.seconds)}
      </Text>
      <Text
        className="text-center text-[20px] leading-[26px] text-[#15130f]"
        style={s.sora6}
      >
        {line.text}
      </Text>
      {showTr && (
        <Text
          className="mt-1.5 text-center text-xs leading-[17px] text-[#6f695f]"
          style={s.jak4}
        >
          {line.tr}
        </Text>
      )}
    </View>
  );
});

// `distance` is clamped to 5 by the caller, so rows far from the active line get
// identical props and are skipped by memo.
const LyricRow = memo(function LyricRow({
  line,
  index,
  distance,
  showTr,
  onSelect,
}) {
  const target = OPACITY_BY_DISTANCE[distance];
  const opacity = useSharedValue(target);

  useEffect(() => {
    opacity.value = withTiming(target, { duration: 300 });
  }, [target, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const handlePress = useCallback(() => onSelect(index), [onSelect, index]);

  return (
    <Animated.View layout={LinearTransition.duration(250)} style={style}>
      <Pressable onPress={handlePress} className="py-4">
        {distance === 0 ? (
          <ActiveLine line={line} showTr={showTr} />
        ) : (
          <InactiveLine line={line} showTr={showTr} />
        )}
      </Pressable>
    </Animated.View>
  );
});

const keyExtractor = (item) => String(item.id);

/* -------------------------------------------------------------------------- */
/* Bottom controls                                                            */
/* -------------------------------------------------------------------------- */

const ScrubBar = memo(function ScrubBar({ secs, onSeekRatio }) {
  const pct = clamp((secs / TOTAL_SECONDS) * 100, 5, 100);
  const width = useSharedValue(pct);
  const trackW = useRef(1);

  useEffect(() => {
    width.value = withTiming(pct, { duration: 300 });
  }, [pct, width]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  const handleLayout = useCallback((e) => {
    trackW.current = e.nativeEvent.layout.width || 1;
  }, []);

  const handlePress = useCallback(
    (e) => onSeekRatio(e.nativeEvent.locationX / trackW.current),
    [onSeekRatio],
  );

  return (
    <View>
      <Pressable
        onLayout={handleLayout}
        onPress={handlePress}
        accessibilityRole="adjustable"
        accessibilityLabel="Seek"
        className="h-5 justify-center"
      >
        {/* children ignore touches so locationX is measured on the track itself */}
        <View
          pointerEvents="none"
          className="h-[3px] w-full rounded-sm bg-[#15130f]/[0.12]"
        >
          <Animated.View style={[s.trackFill, fillStyle]} />
        </View>
      </Pressable>

      <View className="mt-1 flex-row items-center justify-between">
        <Text className="text-[10px] tracking-[0.5px] text-[#d4063a]" style={s.mono}>
          {fmt(secs)}
        </Text>
        <View className="flex-row items-center gap-1.5">
          <View className="h-[5px] w-[5px] rounded-full bg-[#d4063a]" />
          <Text className="text-[10px] tracking-[0.5px] text-[#6f695f]" style={s.mono}>
            PHASE LOCKED
          </Text>
        </View>
        <Text className="text-[10px] tracking-[0.5px] text-[#6f695f]" style={s.mono}>
          04:38
        </Text>
      </View>
    </View>
  );
});

const TransportButton = memo(function TransportButton({
  icon,
  size,
  label,
  onPress,
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-11 w-11 items-center justify-center rounded-full active:opacity-60"
    >
      <MaterialIcons name={icon} size={size} color={C.ink} />
    </Pressable>
  );
});

const TransportBar = memo(function TransportBar({
  isPlaying,
  onPlay,
  onPrev,
  onNext,
  onRewind,
  onForward,
}) {
  return (
    <View className="flex-row items-center justify-between px-2 pb-3.5 pt-2">
      <TransportButton
        icon="skip-previous"
        size={24}
        label="Previous lyric line"
        onPress={onPrev}
      />
      <TransportButton
        icon="replay-10"
        size={26}
        label="Rewind 10 seconds"
        onPress={onRewind}
      />
      <Pressable
        onPress={onPlay}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? "Pause" : "Play"}
        className="h-[66px] w-[66px] items-center justify-center rounded-full bg-[#15130f] active:opacity-85"
      >
        <MaterialIcons
          name={isPlaying ? "pause" : "play-arrow"}
          size={34}
          color={C.paper}
        />
      </Pressable>
      <TransportButton
        icon="forward-10"
        size={26}
        label="Forward 10 seconds"
        onPress={onForward}
      />
      <TransportButton
        icon="skip-next"
        size={24}
        label="Next lyric line"
        onPress={onNext}
      />
    </View>
  );
});

const ToggleChip = memo(function ToggleChip({
  on,
  onPress,
  label,
  icon,
  text,
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      className={`h-9 w-9 items-center justify-center rounded-full active:opacity-70 ${
        on ? "bg-[#15130f]" : "bg-[#15130f]/[0.06]"
      }`}
    >
      {icon ? (
        <MaterialIcons
          name={icon}
          size={17}
          color={on ? C.paper : "rgba(21,19,15,0.7)"}
        />
      ) : (
        <Text
          className={`text-[11px] ${on ? "text-[#f3efe8]" : "text-[#15130f]/70"}`}
          style={s.mono}
        >
          {text}
        </Text>
      )}
    </Pressable>
  );
});

const UtilityRow = memo(function UtilityRow({
  tuneChanged,
  onTune,
  loopVerse,
  onLoop,
  autoScroll,
  onAutoScroll,
  showTr,
  onToggleLang,
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Pressable
        onPress={onTune}
        accessibilityRole="button"
        accessibilityLabel="Open tune settings"
        className="h-9 flex-row items-center gap-2 rounded-full border border-[#15130f]/[0.18] px-3.5 active:opacity-70"
      >
        <MaterialIcons name="tune" size={16} color={C.ink} />
        <Text className="text-[13px] text-[#15130f]" style={s.jak6}>
          Tune
        </Text>
        {tuneChanged && (
          <View className="h-1.5 w-1.5 rounded-full bg-[#d4063a]" />
        )}
      </Pressable>

      <View className="flex-row gap-2">
        <ToggleChip
          on={loopVerse}
          onPress={onLoop}
          label="Loop verse"
          icon="repeat-one"
        />
        <ToggleChip
          on={autoScroll}
          onPress={onAutoScroll}
          label="Auto-scroll lock"
          icon="vertical-align-center"
        />
        <ToggleChip
          on={showTr}
          onPress={onToggleLang}
          label="Toggle lyrics translation"
          text={showTr ? "EN" : "RO"}
        />
      </View>
    </View>
  );
});

/* -------------------------------------------------------------------------- */
/* Tune sheet (mounted only while open or animating)                          */
/* -------------------------------------------------------------------------- */

const FormantBar = memo(function FormantBar({ h, delay, reduceMotion }) {
  const o = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return undefined;
    o.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.3, {
            duration: 650,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(1, { duration: 650, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(o);
  }, [delay, o, reduceMotion]);

  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[s.formantBar, { height: h }, style]} />;
});

const Section = memo(function Section({ label, children }) {
  return (
    <View className="border-t border-[#15130f]/10 py-4">
      {label ? (
        <Text
          className="mb-2.5 text-[10px] uppercase tracking-[1.6px] text-[#6f695f]"
          style={s.mono}
        >
          {label}
        </Text>
      ) : null}
      {children}
    </View>
  );
});

const StepButton = memo(function StepButton({
  icon,
  label,
  disabled,
  onPress,
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`h-10 w-10 items-center justify-center rounded-full border border-[#15130f]/[0.18] active:opacity-60 ${
        disabled ? "opacity-35" : ""
      }`}
    >
      <MaterialIcons name={icon} size={20} color={C.ink} />
    </Pressable>
  );
});

const TuneContent = memo(function TuneContent({
  stemMode,
  offsetTenths,
  onStem,
  onOffsetStep,
  onShare,
}) {
  const reduceMotion = useReducedMotion();
  const decrease = useCallback(() => onOffsetStep(-1), [onOffsetStep]);
  const increase = useCallback(() => onOffsetStep(1), [onOffsetStep]);

  return (
    <>
      <Section>
        <View className="flex-row items-center gap-3">
          <Image
            source={{ uri: COVER_URI }}
            style={{ width: 48, height: 48, borderRadius: 10 }}
          />
          <View className="flex-1">
            <Text className="text-base text-[#15130f]" style={s.sora7} numberOfLines={1}>
              Obsidian Resonance
            </Text>
            <Text className="mt-px text-xs text-[#6f695f]" style={s.jak4}>
              Kiasmos • Erased Tapes
            </Text>
            <Text className="mt-0.5 text-[10px] text-[#8a847a]" style={s.mono}>
              Blurred EP • Stem 03 Lead Vocals
            </Text>
          </View>
          <View className="self-start rounded-full bg-[#15130f] px-2 py-[3px]">
            <Text className="text-[9px] tracking-[1.2px] text-[#f3efe8]" style={s.mono}>
              STEREO FIELD
            </Text>
          </View>
        </View>
      </Section>

      <Section label="Stem mode">
        <View className="flex-row gap-[3px] rounded-xl bg-[#15130f]/[0.06] p-[3px]">
          {STEMS.map((stem) => {
            const on = stem.key === stemMode;
            return (
              <Pressable
                key={stem.key}
                onPress={() => onStem(stem.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                className={`h-9 flex-1 flex-row items-center justify-center gap-1 rounded-[9px] ${
                  on ? "bg-[#15130f]" : ""
                }`}
              >
                <Text
                  className={`text-[12.5px] ${on ? "text-[#f3efe8]" : "text-[#6f695f]"}`}
                  style={s.jak6}
                >
                  {stem.label}
                </Text>
                {stem.badge && (
                  <Text
                    className={`text-[9px] ${on ? "text-[#f3efe8]/70" : "text-[#6f695f]/70"}`}
                    style={s.mono}
                  >
                    {stem.badge}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section label="Vocal sync offset">
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl text-[#15130f]" style={s.sora7}>
            {formatOffset(offsetTenths)}
          </Text>
          <View className="flex-row gap-2">
            <StepButton
              icon="remove"
              label="Decrease offset"
              disabled={offsetTenths <= -OFFSET_LIMIT}
              onPress={decrease}
            />
            <StepButton
              icon="add"
              label="Increase offset"
              disabled={offsetTenths >= OFFSET_LIMIT}
              onPress={increase}
            />
          </View>
        </View>
      </Section>

      <Section label="Lyric card">
        <Pressable
          onPress={onShare}
          accessibilityRole="button"
          className="h-[46px] flex-row items-center justify-center gap-2 rounded-[14px] border border-[#15130f]/20 active:opacity-70"
        >
          <MaterialIcons name="ios-share" size={18} color={C.ink} />
          <Text className="text-sm text-[#15130f]" style={s.jak6}>
            Create lyric poster
          </Text>
        </Pressable>
      </Section>

      <Section label="Signal">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-xs text-[#3d382f]" style={s.mono}>
              <Text className="text-[#d4063a]">FLAC MASTER </Text>
              96 kHz / 24-bit
            </Text>
            <Text className="mt-[3px] text-[10px] text-[#8a847a]" style={s.mono}>
              2840 kbps • Low-jitter sync
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <View className="h-4 flex-row items-end gap-[3px]">
              {FORMANT_BARS.map((b, i) => (
                <FormantBar
                  key={i}
                  h={b.h}
                  delay={b.delay}
                  reduceMotion={reduceMotion}
                />
              ))}
            </View>
            <Text className="text-[10px] text-[#3d382f]" style={s.mono}>
              432 Hz core
            </Text>
          </View>
        </View>
      </Section>

      <Section label="Credits">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-1.5">
            <MaterialIcons name="verified" size={15} color={C.ink} />
            <Text
              className="text-[10px] uppercase tracking-[0.6px] text-[#15130f]"
              style={s.mono}
            >
              Artist notation and sync verified
            </Text>
          </View>
          <Text className="text-[10px] text-[#6f695f]" style={s.mono}>
            ±4ms accuracy
          </Text>
        </View>
        <Text className="mt-2.5 text-xs leading-[19px] text-[#3d382f]" style={s.jak4}>
          Recorded at Greenhouse Studios, Reykjavík. Synthesizers tuned to
          natural room acoustics with analog tape loop phase shifting during the
          bridge segment.
        </Text>
      </Section>
    </>
  );
});

const TuneSheet = memo(function TuneSheet({
  open,
  onClose,
  stemMode,
  offsetTenths,
  onStem,
  onOffsetStep,
  onShare,
}) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const [mounted, setMounted] = useState(open);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (open) {
      // Mount the sheet when opened; the "reset state on prop change" pattern.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMounted(true);
      progress.value = withTiming(1, {
        duration: 350,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      progress.value = withTiming(
        0,
        { duration: 280, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        },
      );
    }
  }, [open, progress]);

  // Android back closes the sheet first.
  useEffect(() => {
    if (!open) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * winH }],
  }));

  if (!mounted) return null;

  return (
    <View style={s.fill} pointerEvents="box-none">
      <Animated.View
        style={[s.fill, { backgroundColor: C.scrim }, scrimStyle]}
      >
        <Pressable
          style={s.fill}
          onPress={onClose}
          accessibilityLabel="Close tune settings"
        />
      </Animated.View>

      <Animated.View
        accessibilityViewIsModal
        className="absolute inset-x-0 bottom-0 rounded-t-[28px] bg-[#fbf9f5]"
        style={[{ maxHeight: winH * 0.88 }, sheetStyle]}
      >
        <View className="items-center pt-2.5">
          <View className="h-1 w-9 rounded-sm bg-[#15130f]/[0.16]" />
        </View>

        <View className="flex-row items-center justify-between px-[22px] pb-1.5 pt-3">
          <Text className="text-[22px] text-[#15130f]" style={s.sora7}>
            Tune
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            className="active:opacity-60"
          >
            <Text className="text-sm text-[#d4063a]" style={s.jak6}>
              Done
            </Text>
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          overScrollMode="never"
          contentContainerStyle={{
            paddingHorizontal: 22,
            paddingBottom: insets.bottom + 16,
          }}
        >
          <TuneContent
            stemMode={stemMode}
            offsetTenths={offsetTenths}
            onStem={onStem}
            onOffsetStep={onOffsetStep}
            onShare={onShare}
          />
        </ScrollView>
      </Animated.View>
    </View>
  );
});

/* -------------------------------------------------------------------------- */
/* Player state (hoisted so it survives the screen being unmounted on blur)   */
/* -------------------------------------------------------------------------- */

// In the real app, `secs` and `isPlaying` should come from your audio engine /
// player store instead of local state.
function useLyricsPlayer() {
  const [isPlaying, setIsPlaying] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [offsetTenths, setOffsetTenths] = useState(0);
  const [activeIndex, setActiveIndex] = useState(2);
  const [secs, setSecs] = useState(134);
  const [showTr, setShowTr] = useState(true);
  const [stemMode, setStemMode] = useState("full");
  const [loopVerse, setLoopVerse] = useState(false);

  return {
    isPlaying,
    setIsPlaying,
    autoScroll,
    setAutoScroll,
    offsetTenths,
    setOffsetTenths,
    activeIndex,
    setActiveIndex,
    secs,
    setSecs,
    showTr,
    setShowTr,
    stemMode,
    setStemMode,
    loopVerse,
    setLoopVerse,
  };
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

function NowPlaying({
  onBack,
  isPlaying,
  setIsPlaying,
  autoScroll,
  setAutoScroll,
  offsetTenths,
  setOffsetTenths,
  activeIndex,
  setActiveIndex,
  secs,
  setSecs,
  showTr,
  setShowTr,
  stemMode,
  setStemMode,
  loopVerse,
  setLoopVerse,
}) {
  const insets = useSafeAreaInsets();

  const toastRef = useRef(null);
  const listRef = useRef(null);
  const scrollTimer = useRef(null);
  const didInitialScroll = useRef(false);

  const [listH, setListH] = useState(0);
  const [tuneOpen, setTuneOpen] = useState(false);

  const toast = useCallback((text) => toastRef.current?.show(text), []);

  useEffect(
    () => () => {
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    },
    [],
  );

  /* ---- list scrolling ---- */

  const scrollToLine = useCallback((index, animated = true) => {
    listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated });
  }, []);

  const handleScrollToIndexFailed = useCallback(
    ({ index, averageItemLength }) => {
      listRef.current?.scrollToOffset({
        offset: averageItemLength * index,
        animated: false,
      });
      setTimeout(() => scrollToLine(index), 100);
    },
    [scrollToLine],
  );

  const handleListLayout = useCallback((e) => {
    const h = Math.round(e.nativeEvent.layout.height);
    setListH((prev) => (prev === h ? prev : h));
  }, []);

  // Center the starting line once the list has been measured.
  useEffect(() => {
    if (!listH || didInitialScroll.current) return undefined;
    didInitialScroll.current = true;
    const t = setTimeout(() => scrollToLine(activeIndex, false), 60);
    return () => clearTimeout(t);
  }, [listH, activeIndex, scrollToLine]);

  const contentStyle = useMemo(
    () => ({
      paddingHorizontal: 26,
      paddingVertical: Math.max(80, listH / 2 - 40),
    }),
    [listH],
  );

  /* ---- actions ---- */

  const selectLine = useCallback(
    (i) => {
      const line = LINES[i];
      setActiveIndex(i);
      setSecs(line.seconds);
      toast(`Seeked to line [${fmt(line.seconds)}]`);

      if (scrollTimer.current) clearTimeout(scrollTimer.current);
      if (autoScroll) {
        // wait for the row layout transition so measured positions are final
        scrollTimer.current = setTimeout(() => {
          scrollToLine(i);
          scrollTimer.current = null;
        }, 300);
      }
    },
    [autoScroll, scrollToLine, setActiveIndex, setSecs, toast],
  );

  const handlePrev = useCallback(() => {
    if (activeIndex > 0) selectLine(activeIndex - 1);
  }, [activeIndex, selectLine]);

  const handleNext = useCallback(() => {
    if (activeIndex < LINES.length - 1) selectLine(activeIndex + 1);
  }, [activeIndex, selectLine]);

  const handlePlay = useCallback(() => {
    const next = !isPlaying;
    setIsPlaying(next);
    toast(next ? "Resuming synced vocal playback" : "Playback paused");
  }, [isPlaying, setIsPlaying, toast]);

  const handleRewind = useCallback(() => {
    setSecs((v) => clamp(v - 10, 0, TOTAL_SECONDS));
    toast("Rewind 10s");
  }, [setSecs, toast]);

  const handleForward = useCallback(() => {
    setSecs((v) => clamp(v + 10, 0, TOTAL_SECONDS));
    toast("Forward 10s");
  }, [setSecs, toast]);

  const handleSeekRatio = useCallback(
    (ratio) => {
      setSecs(clamp(Math.round(clamp(ratio, 0, 1) * TOTAL_SECONDS), 0, TOTAL_SECONDS));
    },
    [setSecs],
  );

  const handleStem = useCallback(
    (key) => {
      setStemMode(key);
      toast(`DSP Mode: ${key.toUpperCase()} Stem Isolation`);
    },
    [setStemMode, toast],
  );

  const handleOffsetStep = useCallback(
    (delta) => {
      const next = clamp(offsetTenths + delta, -OFFSET_LIMIT, OFFSET_LIMIT);
      if (next === offsetTenths) return;
      setOffsetTenths(next);
      toast(`Vocal offset adjusted: ${formatOffset(next)}`);
    },
    [offsetTenths, setOffsetTenths, toast],
  );

  const handleToggleLang = useCallback(() => {
    const next = !showTr;
    setShowTr(next);
    toast(next ? "Bilingual script enabled" : "Original vocal script only");
  }, [showTr, setShowTr, toast]);

  const handleToggleAutoScroll = useCallback(() => {
    const next = !autoScroll;
    setAutoScroll(next);
    toast(next ? "Auto-scroll tracking active" : "Auto-scroll unlatched");
  }, [autoScroll, setAutoScroll, toast]);

  const handleToggleLoop = useCallback(() => {
    const next = !loopVerse;
    setLoopVerse(next);
    toast(next ? "Verse loop on" : "Verse loop off");
  }, [loopVerse, setLoopVerse, toast]);

  const handleShare = useCallback(
    () => toast("Crafting 96kHz Lossless Lyric Card..."),
    [toast],
  );

  const openTune = useCallback(() => setTuneOpen(true), []);
  const closeTune = useCallback(() => setTuneOpen(false), []);

  /* ---- list rendering ---- */

  const renderItem = useCallback(
    ({ item, index }) => (
      <LyricRow
        line={item}
        index={index}
        distance={Math.min(5, Math.abs(index - activeIndex))}
        showTr={showTr}
        onSelect={selectLine}
      />
    ),
    [activeIndex, showTr, selectLine],
  );

  const extraData = useMemo(
    () => ({ activeIndex, showTr }),
    [activeIndex, showTr],
  );

  const tuneChanged = offsetTenths !== 0 || stemMode !== "full";

  return (
    <View
      className="flex-1 bg-[#f3efe8]"
      style={{ paddingTop: insets.top }}
    >
      {/* header */}
      <View className="h-[60px] flex-row items-center px-3 pt-2">
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-60"
        >
          <MaterialIcons name="arrow-back" size={24} color={C.ink} />
        </Pressable>

        <View className="flex-1 items-center">
          <Text
            numberOfLines={1}
            className="text-[15px] leading-5 text-[#15130f]"
            style={s.sora6}
          >
            Obsidian Resonance
          </Text>
          <Text className="mt-px text-[11px] text-[#6f695f]" style={s.jak4}>
            Kiasmos • Erased Tapes
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More options"
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-60"
        >
          <MaterialIcons name="more-vert" size={22} color={C.ink} />
        </Pressable>
      </View>

      {/* lyrics */}
      <View className="flex-1" onLayout={handleListLayout}>
        <FlatList
          ref={listRef}
          data={LINES}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          extraData={extraData}
          contentContainerStyle={contentStyle}
          showsVerticalScrollIndicator={false}
          overScrollMode="never"
          initialNumToRender={LINES.length}
          maxToRenderPerBatch={8}
          windowSize={9}
          onScrollToIndexFailed={handleScrollToIndexFailed}
        />
        <LinearGradient
          pointerEvents="none"
          colors={[C.paper, C.paperClear]}
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: 64 }}
        />
        <LinearGradient
          pointerEvents="none"
          colors={[C.paperClear, C.paper]}
          style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 64 }}
        />
      </View>

      {/* controls */}
      <View
        className="border-t border-[#15130f]/10 px-[22px] pt-2.5"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <ScrubBar secs={secs} onSeekRatio={handleSeekRatio} />
        <TransportBar
          isPlaying={isPlaying}
          onPlay={handlePlay}
          onPrev={handlePrev}
          onNext={handleNext}
          onRewind={handleRewind}
          onForward={handleForward}
        />
        <UtilityRow
          tuneChanged={tuneChanged}
          onTune={openTune}
          loopVerse={loopVerse}
          onLoop={handleToggleLoop}
          autoScroll={autoScroll}
          onAutoScroll={handleToggleAutoScroll}
          showTr={showTr}
          onToggleLang={handleToggleLang}
        />
      </View>

      <TuneSheet
        open={tuneOpen}
        onClose={closeTune}
        stemMode={stemMode}
        offsetTenths={offsetTenths}
        onStem={handleStem}
        onOffsetStep={handleOffsetStep}
        onShare={handleShare}
      />

      {/* last in the tree so it draws above everything, including the sheet */}
      <Toast ref={toastRef} top={insets.top + 64} />
    </View>
  );
}

/**
 * Expo Router exposes useIsFocused() for route focus. While another route is on top,
 * nothing here renders. The player state lives in this wrapper, so it is kept
 * across blur and focus.
 */
const noop = () => {};

export default function LyricsScreen({ onBack = noop }) {
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

  const player = useLyricsPlayer();

  if (!fontsLoaded || !isFocused) return null;

  return <NowPlaying {...player} onBack={onBack} />;
}