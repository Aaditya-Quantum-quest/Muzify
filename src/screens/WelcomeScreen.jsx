import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useIsFocused } from 'expo-router';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Dimensions,
  Easing,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop, Path } from 'react-native-svg';
import { useWelcomeBackground } from './welcomeBackground';

// ─────────────────────────────────────────────────────────────
// Static layout constants (computed once, never per render)
// ─────────────────────────────────────────────────────────────
const { width: SW, height: SH } = Dimensions.get('window');

const HERO_H = Math.round(SH * 0.76);

const WORDMARK_SIZE = Math.min(58, Math.round(SW * 0.148));

const SLIDER_W = Math.min(SW - 56, 334);
const SLIDER_H = 60;
const KNOB = 50;
const KNOB_INSET = (SLIDER_H - KNOB) / 2;
const MAX_DRAG = SLIDER_W - KNOB - KNOB_INSET * 2;
// Fill is a full-width bar shifted left, so only translateX animates (native driver friendly)
const FILL_X0 = -(SLIDER_W - (KNOB + KNOB_INSET * 2));

// Equalizer: every bar's keyframes are precomputed once at module level
const EQ_INPUT = [0, 0.25, 0.5, 0.75, 1];
const EQ_BASE = [0.25, 0.55, 1, 0.55];
const EQ_HEIGHTS = [
  10, 16, 24, 14, 28, 20, 12, 26, 18, 30, 22, 14, 28, 16, 24, 12, 30, 20, 14,
  26, 18, 28, 12, 22, 30, 16, 24, 14, 26, 20, 12, 28, 18, 24, 14, 10,
];
const EQ_BARS = EQ_HEIGHTS.map((h, i) => {
  const k = i % 4;
  const scale = [
    EQ_BASE[k],
    EQ_BASE[(k + 1) % 4],
    EQ_BASE[(k + 2) % 4],
    EQ_BASE[(k + 3) % 4],
    EQ_BASE[k],
  ];
  // Keeps bars anchored to the bottom while scaling from their center
  const shift = scale.map((s) => (h / 2) * (1 - s));
  return { h, scale, shift, accent: i % 6 === 0 };
});

// ─────────────────────────────────────────────────────────────
// Small hooks
// ─────────────────────────────────────────────────────────────
function useAppActive() {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) =>
      setActive(s === 'active')
    );
    return () => sub.remove();
  }, []);
  return active;
}

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => mounted && setReduce(v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

// ─────────────────────────────────────────────────────────────
// Hero layer: rotating image + one gradient fade.
// Only re-renders when the picture itself changes.
// Remote (Google Drive) image fades in; if it errors or is too slow,
// the bundled fallback is used instead.
// ─────────────────────────────────────────────────────────────
const REMOTE_TIMEOUT_MS = 5000;

const Hero = memo(function Hero({ uri, fallback }) {
  const [failedUri, setFailedUri] = useState(null);
  const [fade] = useState(() => new Animated.Value(0));
  const loadedRef = useRef(false);

  const remoteOk = !!uri && failedUri !== uri;
  const source = useMemo(
    () => (remoteOk ? { uri } : fallback),
    [remoteOk, uri, fallback]
  );

  // New picture: restart fade, and give the remote image a deadline
  useEffect(() => {
    fade.setValue(0);
    loadedRef.current = false;
    if (!remoteOk) return;
    const t = setTimeout(() => {
      if (!loadedRef.current) setFailedUri(uri);
    }, REMOTE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [source, fade, remoteOk, uri]);

  const onLoad = useCallback(() => {
    loadedRef.current = true;
    Animated.timing(fade, {
      toValue: 1,
      duration: 450,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [fade]);

  const onError = useCallback(() => {
    if (uri) setFailedUri(uri);
  }, [uri]);

  return (
    <View
      pointerEvents="none"
      renderToHardwareTextureAndroid
      style={{ position: 'absolute', top: 0, left: 0, width: SW, height: HERO_H }}
    >
      <Animated.Image
        source={source}
        style={{ width: SW, height: HERO_H, opacity: fade }}
        resizeMode="cover"
        fadeDuration={0}
        onLoad={onLoad}
        onError={onError}
        accessibilityIgnoresInvertColors
      />
      <Svg width={SW} height={HERO_H} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="mk-fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0b0b0c" stopOpacity="0" />
            <Stop offset="0.36" stopColor="#0b0b0c" stopOpacity="0" />
            <Stop offset="0.64" stopColor="#0b0b0c" stopOpacity="0.6" />
            <Stop offset="0.88" stopColor="#0b0b0c" stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={SW} height={HERO_H} fill="url(#mk-fade)" />
      </Svg>
    </View>
  );
});

// ─────────────────────────────────────────────────────────────
// Equalizer: ONE shared native-driven value drives all 36 bars
// (transform only, so nothing runs on the JS thread or triggers layout)
// ─────────────────────────────────────────────────────────────
const Equalizer = memo(function Equalizer({ progress }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="h-[30px] flex-row items-end justify-between"
    >
      {EQ_BARS.map((b, i) => (
        <Animated.View
          key={i}
          className={`w-[2px] rounded-full ${
            b.accent ? 'bg-[#ff4b2b]' : 'bg-[#f4f1ec]/40'
          }`}
          style={{
            height: b.h,
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: EQ_INPUT,
                  outputRange: b.shift,
                }),
              },
              {
                scaleY: progress.interpolate({
                  inputRange: EQ_INPUT,
                  outputRange: b.scale,
                }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
});

// ─────────────────────────────────────────────────────────────
// Slide to get started (fully native-driven)
// ─────────────────────────────────────────────────────────────
const SlideToStart = memo(function SlideToStart({ onComplete, active }) {
  const [dragX] = useState(() => new Animated.Value(0));
  const doneRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Reset whenever the screen comes back into focus
  useEffect(() => {
    if (active) {
      doneRef.current = false;
      dragX.setValue(0);
    }
  }, [active, dragX]);

  const complete = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    Animated.timing(dragX, {
      toValue: MAX_DRAG,
      duration: 120,
      useNativeDriver: true,
    }).start(() => onCompleteRef.current?.());
  }, [dragX]);

  const springBack = useCallback(() => {
    Animated.spring(dragX, {
      toValue: 0,
      friction: 6,
      tension: 50,
      useNativeDriver: true,
    }).start();
  }, [dragX]);

  // Built once and reads doneRef at gesture time, never during render — so the
  // handlers stay referentially stable across renders (see EquilizerScreen).
  const [panResponder] = useState(
    // eslint-disable-next-line react-hooks/refs
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !doneRef.current,
        onMoveShouldSetPanResponder: () => !doneRef.current,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, g) =>
          dragX.setValue(Math.max(0, Math.min(g.dx, MAX_DRAG))),
        onPanResponderRelease: (_, g) => {
          if (g.dx >= MAX_DRAG * 0.7) complete();
          else springBack();
        },
        onPanResponderTerminate: springBack,
      }),
  );

  const fillX = useMemo(
    () =>
      dragX.interpolate({
        inputRange: [0, MAX_DRAG],
        outputRange: [FILL_X0, FILL_X0 + MAX_DRAG],
        extrapolate: 'clamp',
      }),
    [dragX]
  );

  const labelOpacity = useMemo(
    () =>
      dragX.interpolate({
        inputRange: [0, MAX_DRAG * 0.5],
        outputRange: [1, 0],
        extrapolate: 'clamp',
      }),
    [dragX]
  );

  return (
    <View
      className="overflow-hidden border border-[#2a2a2f] bg-[#151518]"
      style={{
        width: SLIDER_W,
        height: SLIDER_H,
        borderRadius: SLIDER_H / 2,
        justifyContent: 'center',
      }}
    >
      {/* Accent fill (translateX only, no width animation) */}
      <Animated.View
        pointerEvents="none"
        className="absolute inset-y-0 left-0 bg-[#ff4b2b]/90"
        style={{
          width: SLIDER_W,
          borderRadius: SLIDER_H / 2,
          transform: [{ translateX: fillX }],
        }}
      />

      <Animated.Text
        pointerEvents="none"
        className="pl-[44px] text-center text-[11px] font-semibold uppercase tracking-[2.4px] text-[#f4f1ec]"
        style={{ opacity: labelOpacity }}
      >
        Slide to get started
      </Animated.Text>

      {/* Knob */}
      <Animated.View
        {...panResponder.panHandlers}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Slide to get started"
        accessibilityHint="Double tap to continue"
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'activate') complete();
        }}
        className="absolute items-center justify-center rounded-full bg-[#f4f1ec]"
        style={{
          left: KNOB_INSET,
          top: KNOB_INSET,
          width: KNOB,
          height: KNOB,
          transform: [{ translateX: dragX }],
        }}
      >
        <Svg
          width={20}
          height={20}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#0b0b0c"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M5 12h14M13 6l6 6-6 6" />
        </Svg>
      </Animated.View>
    </View>
  );
});

// ─────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────
export default function WelcomeScreen({ onGetStarted }) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const appActive = useAppActive();
  const reduceMotion = useReduceMotion();
  const bg = useWelcomeBackground(); // rotates every launch after 1h+ away

  // Animate only while the screen is focused AND the app is in the foreground
  const shouldAnimate = isFocused && appActive && !reduceMotion;

  const [eqProgress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!shouldAnimate) return;
    eqProgress.setValue(0);
    const loop = Animated.loop(
      Animated.timing(eqProgress, {
        toValue: 1,
        duration: 1600,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [shouldAnimate, eqProgress]);

  return (
    <View className="flex-1 overflow-hidden bg-[#0b0b0c]">
      {bg ? <Hero uri={bg.uri} fallback={bg.fallback} /> : null}

      {/* Eyebrow */}
      <View
        pointerEvents="none"
        className="absolute left-7 flex-row items-center"
        style={{ top: insets.top + 16 }}
      >
        <View className="mr-2.5 h-[7px] w-[7px] rounded-full bg-[#ff4b2b]" />
        <Text className="text-[10px] font-semibold uppercase tracking-[2.8px] text-[#141413]">
          Music for every mood
        </Text>
      </View>

      {/* Bottom block */}
      <View
        className="absolute inset-x-0 bottom-0 px-7"
        style={{ paddingBottom: Math.max(insets.bottom, 16) + 24 }}
      >
        <Text
          allowFontScaling={false}
          className="font-extrabold text-[#f4f1ec]"
          style={{
            fontSize: WORDMARK_SIZE,
            lineHeight: Math.round(WORDMARK_SIZE * 1.05),
            letterSpacing: WORDMARK_SIZE * 0.12,
          }}
        >
          MUSIKA
        </Text>
        <Text className="mt-3 text-[10px] font-medium uppercase tracking-[3.2px] text-[#b4aea6]">
          Make your life more live
        </Text>

        <View className="mt-6">
          <Equalizer progress={eqProgress} />
        </View>

        <Text
          accessibilityRole="header"
          className="mt-[30px] text-[34px] font-semibold tracking-tight text-[#f4f1ec]"
        >
          Feel every beat.
        </Text>
        <Text className="mt-2 text-[14px] text-[#b4aea6]">
          Millions of songs. Zero limits.
        </Text>

        <View className="mt-[30px]">
          <SlideToStart onComplete={onGetStarted} active={isFocused} />
        </View>
      </View>
    </View>
  );
}