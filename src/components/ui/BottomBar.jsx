import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Platform,
  PanResponder,
  Easing as RNEasing,
  Animated as RNAnimated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

/* ───────────── theme ───────────── */
const AMBER = "#e49f33";
const PINK = "#ec6f8e";// same as your screens, fills the strip behind the bar
const BAR_BG = "#17171b";
const BAR_BORDER = "#26262c";
const INACTIVE = "#d6d4de";
const ON_AMBER = "#2a1500";

/* ───────────── layout (compact) ───────────── */
const TAB_W = 52; // width of each tab and the active pill
const TAB_H = 38; // tab height and active pill height
const PAD = 4; // bar inner padding
const ICON = 20;
const BAR_HEIGHT = TAB_H + PAD * 2 + 2; // tabs + padding + both borders

/* ───────────── swipe behaviour ───────────── */
const SWIPE_DISTANCE = 24; // px of vertical travel before the bar reacts
const SCROLL_THRESHOLD = 6; // px of scroll delta ignored as jitter

/* ───────────── scroll hook (optional) ─────────────
   Lets any screen hide / show the bar from its scroll direction.
   Usage:
     const onScroll = useHideTabBarOnScroll();
     <FlatList onScroll={onScroll} scrollEventThrottle={16} ... />
   Scrolling down (finger swipes up) hides it, scrolling up shows it. */
const visibilityListeners = new Set();

const emitHidden = (hidden) => {
  visibilityListeners.forEach((listener) => listener(hidden));
};

export function useHideTabBarOnScroll() {
  const lastY = useRef(0);

  return useCallback((event) => {
    const y = event.nativeEvent.contentOffset.y;
    const delta = y - lastY.current;
    lastY.current = y;

    if (y <= 0) {
      emitHidden(false); // always visible at the top
      return;
    }
    if (Math.abs(delta) < SCROLL_THRESHOLD) return;

    emitHidden(delta > 0);
  }, []);
}

/* ───────────── icons (outline only) ───────────── */
const ICONS = {
  home: "home-outline",
  index: "home-outline",
  search: "search-outline",
  library: "musical-notes-outline",
  statistics: "pie-chart-outline",
  profile: "person-circle-outline",
  settings: "settings-outline",
};

/* ───────────── single tab (no animation) ───────────── */
function TabItem({
  focused,
  iconName,
  badge,
  onPress,
  onLongPress,
  accessibilityLabel,
  testID,
}) {
  const showBadge = badge != null && badge !== false;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={{
        width: TAB_W,
        height: TAB_H,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View>
        <Ionicons
          name={iconName}
          size={ICON}
          color={focused ? ON_AMBER : INACTIVE}
        />

        {showBadge ? (
          <View
            style={{
              position: "absolute",
              top: -4,
              right: -6,
              minWidth: 16,
              height: 16,
              paddingHorizontal: 4,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: PINK,
              borderWidth: 1.5,
              borderColor: focused ? AMBER : BAR_BG,
            }}
          >
            {typeof badge === "number" || typeof badge === "string" ? (
              <Text
                style={{
                  color: "#fff",
                  fontSize: 9,
                  fontWeight: "800",
                  includeFontPadding: false,
                  lineHeight: 11,
                }}
              >
                {badge}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/* ───────────── tab bar ───────────── */
export default function BottomBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();
  const [hidden, setHidden] = useState(false);

  const hiddenRef = useRef(false);
  const gestureHandledRef = useRef(false);
  // 0 = bar fully visible, 1 = bar slid off the bottom of the screen
  const visibility = useRef(new RNAnimated.Value(0)).current;

  const indicatorX = useSharedValue(0);
  const placed = useRef(false);

  const bottomPadding = Math.max(insets.bottom, 16);
  const count = state.routes.length;

  // The bar is fixed-size now: it only be as wide as its tabs.
  const tabW = TAB_W;
  const barWidth = count * TAB_W + PAD * 2 + 2; // tabs + padding + both borders

  // Distance needed to push the bar (and its shadow) fully below the screen.
  const hideDistance = BAR_HEIGHT + bottomPadding + 24;

  const changeVisibility = useCallback(
    (nextHidden) => {
      if (hiddenRef.current === nextHidden) return;

      hiddenRef.current = nextHidden;
      setHidden(nextHidden);

      // Interrupt any running animation so quick swipes never get dropped.
      visibility.stopAnimation();

      if (nextHidden) {
        // swipe up → bar slides down and out
        RNAnimated.timing(visibility, {
          toValue: 1,
          duration: 260,
          easing: RNEasing.out(RNEasing.cubic),
          useNativeDriver: true,
        }).start();
      } else {
        // swipe down → bar springs back up into place
        RNAnimated.spring(visibility, {
          toValue: 0,
          speed: 14,
          bounciness: 6,
          useNativeDriver: true,
        }).start();
      }
    },
    [visibility],
  );

  // Let screens hide / show the bar from their scroll direction.
  useEffect(() => {
    visibilityListeners.add(changeVisibility);
    return () => visibilityListeners.delete(changeVisibility);
  }, [changeVisibility]);

  // eslint-disable-next-line react-hooks/refs
  const [panResponder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,

      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) * 1.2,

      onMoveShouldSetPanResponderCapture: (_, { dx, dy }) =>
        Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) * 1.2,

      onPanResponderGrant: () => {
        gestureHandledRef.current = false;
      },

      // React as soon as the finger travels far enough, so the bar
      // starts sliding mid-swipe instead of waiting for release.
      onPanResponderMove: (_, { dy }) => {
        if (gestureHandledRef.current) return;

        if (hiddenRef.current) {
          // Hidden: a swipe on the handle in either direction brings it back.
          if (Math.abs(dy) >= SWIPE_DISTANCE) {
            gestureHandledRef.current = true;
            changeVisibility(false);
          }
        } else if (dy <= -SWIPE_DISTANCE) {
          // Visible: swiping up hides it.
          gestureHandledRef.current = true;
          changeVisibility(true);
        }
      },

      onPanResponderTerminationRequest: () => true,
    })
  );

  useEffect(() => {
    const target = PAD + state.index * tabW;

    if (!placed.current) {
      indicatorX.value = target;
      placed.current = true;
    } else {
      indicatorX.value = withTiming(target, {
        duration: 280,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
      });
    }
  }, [state.index, tabW, indicatorX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));

  // eslint-disable-next-line react-hooks/refs
  const barTranslateY = visibility.interpolate({
    inputRange: [0, 1],
    outputRange: [0, hideDistance],
  });

  // The reveal handle fades and rises in during the second half of the slide.
  // eslint-disable-next-line react-hooks/refs
  const handleOpacity = visibility.interpolate({
    inputRange: [0.5, 1],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  // eslint-disable-next-line react-hooks/refs
  const handleTranslateY = visibility.interpolate({
    inputRange: [0.5, 1],
    outputRange: [16, 0],
    extrapolate: "clamp",
  });

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: bottomPadding,
        backgroundColor: "transparent",
        alignItems: "center",
      }}
    >
      {/* Floating navigation bar */}
      <RNAnimated.View
        {...panResponder.panHandlers}
        pointerEvents={hidden ? "none" : "auto"}
        accessibilityElementsHidden={hidden}
        importantForAccessibility={
          hidden ? "no-hide-descendants" : "auto"
        }
        style={{
          width: barWidth,
          flexDirection: "row",
          alignItems: "center",
          padding: PAD,
          borderRadius: BAR_HEIGHT / 2,
          backgroundColor: BAR_BG,
          borderWidth: 1,
          borderColor: BAR_BORDER,

          transform: [{ translateY: barTranslateY }],

          ...Platform.select({
            ios: {
              shadowColor: "#000",
              shadowOpacity: 0.4,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 6 },
            },
            android: {
              elevation: 8,
            },
          }),
        }}
      >
        {/* Sliding amber indicator (pill) */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              left: 0,
              top: PAD,
              width: TAB_W,
              height: TAB_H,
              borderRadius: TAB_H / 2,
              backgroundColor: AMBER,
            },
            indicatorStyle,
          ]}
        />

        {/* Navigation buttons */}
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key];

          const label =
            typeof options.tabBarLabel === "string"
              ? options.tabBarLabel
              : (options.title ?? route.name);

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          return (
            <TabItem
              key={route.key}
              focused={focused}
              iconName={ICONS[route.name] ?? "ellipse-outline"}
              badge={options.tabBarBadge}
              onPress={onPress}
              onLongPress={onLongPress}
              accessibilityLabel={
                options.tabBarAccessibilityLabel ?? label
              }
              testID={options.tabBarButtonTestID}
            />
          );
        })}
      </RNAnimated.View>

      {/* Reveal handle (tap, or swipe, to bring the bar back) */}
      <RNAnimated.View
        {...panResponder.panHandlers}
        pointerEvents={hidden ? "auto" : "none"}
        style={{
          position: "absolute",
          bottom: bottomPadding,
          alignSelf: "center",
          width: 64,
          height: 32,
          opacity: handleOpacity,
          transform: [{ translateY: handleTranslateY }],
        }}
      >
        <Pressable
          onPress={() => changeVisibility(false)}
          accessibilityRole="button"
          accessibilityLabel="Show bottom navigation"
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 16,
            backgroundColor: BAR_BG,
            borderWidth: 1,
            borderColor: BAR_BORDER,
          }}
        >
          <View
            style={{
              width: 26,
              height: 3,
              borderRadius: 2,
              backgroundColor: AMBER,
            }}
          />
        </Pressable>
      </RNAnimated.View>
    </View>
  );
}