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
  Easing,
  PanResponder,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
  Defs,
  LinearGradient,
  Rect,
  Stop,
  Path,
} from 'react-native-svg';
import { useWelcomeBackground } from './welcomeBackground';

// ─────────────────────────────────────────────────────────────
// Responsive helpers
// ─────────────────────────────────────────────────────────────

const DESIGN_WIDTH = 390;
const DESIGN_HEIGHT = 844;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * Scales a value relative to a 390pt-wide design canvas.
 * Tablet scaling is intentionally gentler so the UI does not become oversized.
 */
const createScale = (windowWidth) => {
  const isTablet = windowWidth >= 768;
  const scale = isTablet
    ? clamp(windowWidth / DESIGN_WIDTH, 1, 1.35)
    : clamp(windowWidth / DESIGN_WIDTH, 0.85, 1.25);

  return (size) => Math.round(size * scale);
};

/**
 * Scales vertical spacing relative to a 844pt-tall design canvas.
 * Keeps the layout from becoming too tall on small phones or too sparse on tablets.
 */
const createVerticalScale = (windowHeight) => {
  const scale = clamp(windowHeight / DESIGN_HEIGHT, 0.78, 1.25);
  return (size) => Math.round(size * scale);
};

const getBreakpoint = (windowWidth) => {
  if (windowWidth >= 1024) return 'desktop-tablet';
  if (windowWidth >= 768) return 'tablet';
  if (windowWidth >= 600) return 'large-phone';
  return 'phone';
};

// ─────────────────────────────────────────────────────────────
// Equalizer data
// ─────────────────────────────────────────────────────────────

const EQ_INPUT = [0, 0.25, 0.5, 0.75, 1];
const EQ_BASE = [0.25, 0.55, 1, 0.55];

const EQ_HEIGHTS = [
  10, 16, 24, 14, 28, 20, 12, 26, 18, 30, 22, 14, 28, 16, 24, 12, 30, 20, 14,
  26, 18, 28, 12, 22, 30, 16, 24, 14, 26, 20, 12, 28, 18, 24, 14, 10,
];

const EQ_BARS = EQ_HEIGHTS.map((height, index) => {
  const key = index % 4;

  const scale = [
    EQ_BASE[key],
    EQ_BASE[(key + 1) % 4],
    EQ_BASE[(key + 2) % 4],
    EQ_BASE[(key + 3) % 4],
    EQ_BASE[key],
  ];

  const shift = scale.map(
    (value) => (height / 2) * (1 - value),
  );

  return {
    id: `eq-bar-${index}`,
    height,
    scale,
    shift,
    accent: index % 6 === 0,
  };
});

// ─────────────────────────────────────────────────────────────
// Small hooks
// ─────────────────────────────────────────────────────────────

function useAppActive() {
  const [active, setActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setActive(state === 'active');
    });

    return () => subscription.remove();
  }, []);

  return active;
}

function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let isMounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (isMounted) setReduceMotion(value);
      })
      .catch(() => {
        // Reduce Motion is unavailable on some platforms or older OS versions.
      });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

// ─────────────────────────────────────────────────────────────
// Hero
// ─────────────────────────────────────────────────────────────

const REMOTE_TIMEOUT_MS = 5000;

const Hero = memo(function Hero({
  uri,
  fallback,
  width,
  height,
}) {
  const [failedUri, setFailedUri] = useState(null);
  const [fade] = useState(() => new Animated.Value(0));
  const loadedRef = useRef(false);

  const remoteOk = Boolean(uri) && failedUri !== uri;

  const source = useMemo(
    () => (remoteOk ? { uri } : fallback),
    [remoteOk, uri, fallback],
  );

  useEffect(() => {
    fade.setValue(0);
    loadedRef.current = false;

    if (!remoteOk) return;

    const timeout = setTimeout(() => {
      if (!loadedRef.current) {
        setFailedUri(uri);
      }
    }, REMOTE_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [source, fade, remoteOk, uri]);

  const handleLoad = useCallback(() => {
    loadedRef.current = true;

    Animated.timing(fade, {
      toValue: 1,
      duration: 450,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [fade]);

  const handleError = useCallback(() => {
    if (uri) {
      setFailedUri(uri);
    }
  }, [uri]);

  return (
    <View
      pointerEvents="none"
      renderToHardwareTextureAndroid
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width,
        height,
      }}
    >
      <Animated.Image
        source={source}
        style={{
          width,
          height,
          opacity: fade,
        }}
        resizeMode="cover"
        fadeDuration={0}
        onLoad={handleLoad}
        onError={handleError}
        accessibilityIgnoresInvertColors
      />

      <Svg
        width={width}
        height={height}
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <LinearGradient
            id="welcome-hero-fade"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <Stop
              offset="0"
              stopColor="#0b0b0c"
              stopOpacity="0"
            />
            <Stop
              offset="0.36"
              stopColor="#0b0b0c"
              stopOpacity="0"
            />
            <Stop
              offset="0.64"
              stopColor="#0b0b0c"
              stopOpacity="0.6"
            />
            <Stop
              offset="0.88"
              stopColor="#0b0b0c"
              stopOpacity="1"
            />
          </LinearGradient>
        </Defs>

        <Rect
          x="0"
          y="0"
          width={width}
          height={height}
          fill="url(#welcome-hero-fade)"
        />
      </Svg>
    </View>
  );
});

// ─────────────────────────────────────────────────────────────
// Equalizer
// ─────────────────────────────────────────────────────────────

const Equalizer = memo(function Equalizer({
  progress,
  barWidth,
  rowHeight,
  horizontalGap,
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.eqRow,
        {
          height: rowHeight,
          columnGap: horizontalGap,
        },
      ]}
    >
      {EQ_BARS.map((bar) => (
        <Animated.View
          key={bar.id}
          style={[
            styles.eqBar,
            bar.accent ? styles.eqBarAccent : styles.eqBarMuted,
            {
              width: barWidth,
              height: bar.height,
              transform: [
                {
                  translateY: progress.interpolate({
                    inputRange: EQ_INPUT,
                    outputRange: bar.shift,
                  }),
                },
                {
                  scaleY: progress.interpolate({
                    inputRange: EQ_INPUT,
                    outputRange: bar.scale,
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
});

// ─────────────────────────────────────────────────────────────
// Slide to start
// ─────────────────────────────────────────────────────────────

const SlideToStart = memo(function SlideToStart({
  onComplete,
  active,
  width,
  height,
  knobSize,
  maxDrag,
  fillStartX,
  labelPadding,
}) {
  const [dragX] = useState(() => new Animated.Value(0));
  const doneRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

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
      toValue: maxDrag,
      duration: 120,
      useNativeDriver: true,
    }).start(() => {
      onCompleteRef.current?.();
    });
  }, [dragX, maxDrag]);

  const springBack = useCallback(() => {
    Animated.spring(dragX, {
      toValue: 0,
      friction: 6,
      tension: 50,
      useNativeDriver: true,
    }).start();
  }, [dragX]);

  const [panResponder] = useState(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !doneRef.current,
        onMoveShouldSetPanResponder: () => !doneRef.current,
        onPanResponderTerminationRequest: () => false,

        onPanResponderMove: (_, gesture) => {
          dragX.setValue(
            clamp(gesture.dx, 0, maxDrag),
          );
        },

        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx >= maxDrag * 0.7) {
            complete();
          } else {
            springBack();
          }
        },

        onPanResponderTerminate: springBack,
      }),
  );

  const fillX = useMemo(
    () =>
      dragX.interpolate({
        inputRange: [0, maxDrag],
        outputRange: [fillStartX, fillStartX + maxDrag],
        extrapolate: 'clamp',
      }),
    [dragX, fillStartX, maxDrag],
  );

  const labelOpacity = useMemo(
    () =>
      dragX.interpolate({
        inputRange: [0, maxDrag * 0.5],
        outputRange: [1, 0],
        extrapolate: 'clamp',
      }),
    [dragX, maxDrag],
  );

  const knobInset = (height - knobSize) / 2;

  return (
    <View
      style={[
        styles.slider,
        {
          width,
          height,
          borderRadius: height / 2,
          justifyContent: 'center',
        },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.sliderFill,
          {
            width,
            borderRadius: height / 2,
            transform: [
              {
                translateX: fillX,
              },
            ],
          },
        ]}
      />

      <Animated.Text
        pointerEvents="none"
        style={[
          styles.sliderLabel,
          {
            paddingLeft: labelPadding,
            opacity: labelOpacity,
          },
        ]}
      >
        Slide to get started
      </Animated.Text>

      <Animated.View
        {...panResponder.panHandlers}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Slide to get started"
        accessibilityHint="Double tap to continue"
        accessibilityActions={[
          {
            name: 'activate',
          },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'activate') {
            complete();
          }
        }}
        style={[
          styles.knob,
          {
            left: knobInset,
            top: knobInset,
            width: knobSize,
            height: knobSize,
            transform: [
              {
                translateX: dragX,
              },
            ],
          },
        ]}
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
  const { width: windowWidth, height: windowHeight } =
    useWindowDimensions();

  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const appActive = useAppActive();
  const reduceMotion = useReduceMotion();
  const background = useWelcomeBackground();

  const breakpoint = getBreakpoint(windowWidth);
  const isTablet = breakpoint === 'tablet' || breakpoint === 'desktop-tablet';

  const scale = useMemo(
    () => createScale(windowWidth),
    [windowWidth],
  );

  const verticalScale = useMemo(
    () => createVerticalScale(windowHeight),
    [windowHeight],
  );

  const horizontalPadding = isTablet ? 48 : 28;

  const contentWidth = isTablet
    ? Math.min(windowWidth * 0.62, 560)
    : windowWidth - horizontalPadding * 2;

  const heroHeight = Math.round(
    windowHeight * (isTablet ? 0.82 : 0.76),
  );

  const wordmarkSize = Math.min(
    isTablet ? 82 : 58,
    Math.round(contentWidth * (isTablet ? 0.16 : 0.148)),
  );

  const sliderWidth = Math.min(contentWidth, isTablet ? 420 : 334);
  const sliderHeight = isTablet ? 68 : 60;
  const knobSize = isTablet ? 56 : 50;
  const knobInset = (sliderHeight - knobSize) / 2;
  const maxDrag = sliderWidth - knobSize - knobInset * 2;

  const fillStartX = -(
    sliderWidth - (knobSize + knobInset * 2)
  );

  const eqBarWidth = isTablet ? 3 : 2;
  const eqRowHeight = isTablet ? 38 : 30;
  const eqHorizontalGap = isTablet ? 4 : 3;

  const shouldAnimate =
    isFocused && appActive && !reduceMotion;

  const [eqProgress] = useState(
    () => new Animated.Value(0),
  );

  useEffect(() => {
    if (!shouldAnimate) return;

    eqProgress.setValue(0);

    const animation = Animated.loop(
      Animated.timing(eqProgress, {
        toValue: 1,
        duration: 1600,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    animation.start();

    return () => animation.stop();
  }, [shouldAnimate, eqProgress]);

  return (
    <View style={styles.screen}>
      {background ? (
        <Hero
          uri={background.uri}
          fallback={background.fallback}
          width={windowWidth}
          height={heroHeight}
        />
      ) : null}

      <View
        pointerEvents="none"
        style={[
          styles.eyebrow,
          {
            top: insets.top + 16,
            left: horizontalPadding,
          },
        ]}
      >
        <View style={styles.eyebrowDot} />

        <Text
          allowFontScaling={false}
          style={[
            styles.eyebrowText,
            {
              fontSize: isTablet ? 12 : 10,
            },
          ]}
        >
          Music for every mood
        </Text>
      </View>

      <View
        style={[
          styles.bottomBlock,
          {
            alignItems: isTablet ? 'center' : 'flex-start',
            paddingHorizontal: horizontalPadding,
            paddingBottom:
              Math.max(insets.bottom, 16) +
              verticalScale(24),
          },
        ]}
      >
        <View
          style={{
            width: contentWidth,
            alignItems: isTablet ? 'center' : 'flex-start',
          }}
        >
          <Text
            allowFontScaling={false}
            style={[
              styles.wordmark,
              {
                fontSize: wordmarkSize,
                lineHeight: Math.round(
                  wordmarkSize * 1.05,
                ),
                letterSpacing: wordmarkSize * 0.12,
              },
            ]}
          >
            MUSIKA
          </Text>

          <Text
            allowFontScaling={false}
            style={[
              styles.tagline,
              {
                fontSize: isTablet ? 12 : 10,
                marginTop: verticalScale(12),
              },
            ]}
          >
            Make your life more live
          </Text>

          <View
            style={[
              styles.equalizerWrap,
              {
                marginTop: verticalScale(24),
              },
            ]}
          >
            <Equalizer
              progress={eqProgress}
              barWidth={eqBarWidth}
              rowHeight={eqRowHeight}
              horizontalGap={eqHorizontalGap}
            />
          </View>

          <Text
            allowFontScaling
            maxFontSizeMultiplier={1.4}
            accessibilityRole="header"
            style={[
              styles.headline,
              {
                marginTop: verticalScale(30),
                fontSize: isTablet ? 44 : 34,
              },
            ]}
          >
            Feel every beat.
          </Text>

          <Text
            allowFontScaling
            maxFontSizeMultiplier={1.4}
            style={[
              styles.subhead,
              {
                marginTop: verticalScale(8),
                fontSize: isTablet ? 17 : 14,
              },
            ]}
          >
            Millions of songs. Zero limits.
          </Text>

          <View
            style={[
              styles.sliderWrap,
              {
                marginTop: verticalScale(30),
              },
            ]}
          >
            <SlideToStart
              onComplete={onGetStarted}
              active={isFocused}
              width={sliderWidth}
              height={sliderHeight}
              knobSize={knobSize}
              maxDrag={maxDrag}
              fillStartX={fillStartX}
              labelPadding={knobSize + 12}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#0b0b0c',
  },

  eyebrow: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
  },

  eyebrowDot: {
    marginRight: 10,
    height: 7,
    width: 7,
    borderRadius: 9999,
    backgroundColor: '#ff4b2b',
  },

  eyebrowText: {
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2.8,
    color: '#141413',
  },

  bottomBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },

  wordmark: {
    fontWeight: '800',
    color: '#f4f1ec',
  },

  tagline: {
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 3.2,
    color: '#b4aea6',
  },

  equalizerWrap: {
    width: '100%',
  },

  headline: {
    fontWeight: '600',
    letterSpacing: -0.5,
    color: '#f4f1ec',
  },

  subhead: {
    color: '#b4aea6',
  },

  sliderWrap: {
    width: '100%',
    alignItems: 'flex-start',
  },

  eqRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },

  eqBar: {
    borderRadius: 9999,
  },

  eqBarAccent: {
    backgroundColor: '#ff4b2b',
  },

  eqBarMuted: {
    backgroundColor: 'rgba(244,241,236,0.4)',
  },

  slider: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2a2a2f',
    backgroundColor: '#151518',
  },

  sliderFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(255,75,43,0.9)',
  },

  sliderLabel: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2.4,
    color: '#f4f1ec',
  },

  knob: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    backgroundColor: '#f4f1ec',
  },
});