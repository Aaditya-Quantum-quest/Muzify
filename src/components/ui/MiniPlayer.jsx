import { useRef, useState , useCallback } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";

const FallbackIcon = () => null;

const HIDE_DISTANCE = 32;
const SHOW_DISTANCE = 10;

import { usePlayer } from '../../context/player-context';

export default function MiniPlayerBar({
  sidePad = 16,
  insets = { top: 0, bottom: 0, left: 0, right: 0 },
  router = { push: () => {} },
  AvatarArt = null,
  IconShuffle = FallbackIcon,
  IconPlay = FallbackIcon,
  IconPause = FallbackIcon,
}) {
  // Pull playback state from PlayerContext.
  const {
    track,
    playing,
    togglePlay,
    shuffle,
    toggleShuffle,
      } = usePlayer();

  const current = {
    title: track?.title ?? 'No track',
    by: track?.artist ?? '',
    songs: 0, // Not used in mini bar; kept for compatibility.
    colors: ["#555", "#222", "#fff", "?", "#111"],
  };

  const C = { text: "#fff", mut: "#888", lime: "#7CFC00" };
  const shuffled = shuffle;
  const setShuffled = toggleShuffle;
  const setPlaying = togglePlay;

  const [hidden, setHidden] = useState(false);

  const hiddenRef = useRef(false);
  const animatingRef = useRef(false);
  const progress = useRef(new Animated.Value(0)).current;

  // 0 = visible, 1 = hidden.
 const changeVisibility = useCallback((nextHidden) => {
  if (animatingRef.current) return;
  if (hiddenRef.current === nextHidden) return;

  animatingRef.current = true;
  hiddenRef.current = nextHidden;

  setHidden(nextHidden);

  Animated.timing(progress, {
    toValue: nextHidden ? 1 : 0,
    duration: 220,
    useNativeDriver: true,
  }).start(({ finished }) => {
    animatingRef.current = false;

    if (!finished) {
      hiddenRef.current = false;
    }
  });
}, [progress]);

  // eslint-disable-next-line react-hooks/refs
  const [panResponder] = useState(() =>
    PanResponder.create({
      // Preserve normal taps on song info and playback controls.
      onStartShouldSetPanResponder: () => false,

      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        !animatingRef.current &&
        dy < -6 &&
        Math.abs(dy) > Math.abs(dx) * 1.2,

      onMoveShouldSetPanResponderCapture: (_, { dx, dy }) =>
        !animatingRef.current &&
        dy < -6 &&
        Math.abs(dy) > Math.abs(dx) * 1.2,

      onPanResponderRelease: (_, { dy, vy }) => {
        if (animatingRef.current) return;

        if (hiddenRef.current) {
          if (dy <= -SHOW_DISTANCE) {
            changeVisibility(false);
          }
        } else if (
          dy <= -HIDE_DISTANCE ||
          (dy < -10 && vy < -0.5)
        ) {
          changeVisibility(true);
        }
      },

      onPanResponderTerminationRequest: () => true,
    })
  );

  // eslint-disable-next-line react-hooks/refs
  const playerTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -24],
  });

  // eslint-disable-next-line react-hooks/refs
  const playerOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  return (
    <View
      className="absolute inset-x-0 bottom-20 items-center"
      style={{
        paddingHorizontal: sidePad - 4,
        paddingBottom: 14 + insets.bottom,
      }}
      pointerEvents="box-none"
    >
      {/* Floating mini-player */}
      <Animated.View
        {...panResponder.panHandlers}
        pointerEvents={hidden ? "none" : "auto"}
        accessibilityElementsHidden={hidden}
        importantForAccessibility={
          hidden ? "no-hide-descendants" : "auto"
        }
        className="w-full max-w-[398px] flex-row items-center gap-3 rounded-full border px-2 py-[7px] mb-4"
        style={{
          opacity: playerOpacity,
          transform: [{ translateY: playerTranslateY }],
          backgroundColor: "rgba(15,15,18,.82)",
          borderColor: "rgba(255,255,255,.1)",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 18 },
          shadowOpacity: 0.55,
          shadowRadius: 28,
          elevation: 20,
        }}
      >
        {/* Song information */}
        <TouchableOpacity
          className="min-w-0 flex-1 flex-row items-center gap-3"
          onPress={() => router.push("/player")}
          activeOpacity={0.8}
        >
          <View className="h-11 w-11 overflow-hidden rounded-full">
            {AvatarArt ? (
              <AvatarArt colors={current.colors} />
            ) : (
              <View />
            )}
          </View>

          <View className="min-w-0 flex-1">
            <Text
              numberOfLines={1}
              className="text-base font-bold"
              style={{
                color: C.text,
                textTransform: "capitalize",
              }}
            >
              {current.title}
            </Text>

            <Text
              numberOfLines={1}
              className="mt-1 text-xs"
              style={{
                color: C.mut,
                textTransform: "capitalize",
              }}
            >
              {current.by} · {current.songs} Songs
            </Text>
          </View>
        </TouchableOpacity>

        {/* Shuffle */}
        <TouchableOpacity
          onPress={() => setShuffled((s) => !s)}
          accessibilityRole="button"
          accessibilityLabel="Shuffle"
          accessibilityState={{ selected: shuffled }}
          className="h-10 w-10 items-center justify-center rounded-full"
        >
          <IconShuffle />
        </TouchableOpacity>

        {/* Play progress ring */}
        <View className="relative h-[52px] w-[52px] items-center justify-center">
          <Svg
            width={52}
            height={52}
            viewBox="0 0 52 52"
            style={{ transform: [{ rotate: "-90deg" }] }}
          >
            <Circle
              cx={26}
              cy={26}
              r={24}
              fill="none"
              stroke="rgba(255,255,255,.16)"
              strokeWidth={3}
            />

            <Circle
              cx={26}
              cy={26}
              r={24}
              fill="none"
              stroke={C.lime}
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={150.8}
              strokeDashoffset={150.8 * 0.65}
            />
          </Svg>

          <TouchableOpacity
            className="absolute inset-1.5 items-center justify-center rounded-full bg-white/10"
            onPress={() => setPlaying((p) => !p)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={playing ? "Pause" : "Play"}
          >
            {playing ? <IconPause /> : <IconPlay />}
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Small reveal handle shown only while hidden */}
      {hidden && (
        <View
          {...panResponder.panHandlers}
          style={{
            position: "absolute",
            bottom: 14 + insets.bottom + 16,
            alignSelf: "center",
            width: 88,
            height: 44,
          }}
        >
          <Pressable
            onPress={() => changeVisibility(false)}
            accessibilityRole="button"
            accessibilityLabel="Show mini-player"
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 22,
              backgroundColor: "rgba(15,15,18,.82)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,.1)",
            }}
          >
            <View
              style={{
                width: 34,
                height: 4,
                borderRadius: 2,
                backgroundColor: C.mut,
              }}
            />
          </Pressable>
        </View>
      )}
    </View>
  );
}