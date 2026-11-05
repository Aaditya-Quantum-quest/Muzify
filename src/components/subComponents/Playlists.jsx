import React, { useCallback, useEffect, memo, useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ListMusic, Music, Play, Pause } from "lucide-react-native";

/* ---------- constants ---------- */
const WORDMARK_FONT = "PlaywriteITTrad_400Regular";
// Serif italic for card titles. @expo-google-fonts/playfair-display is not
// installed, so fall back to the platform serif (Georgia on iOS, serif on Android).
const TITLE_FONT = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "serif",
});

const CARD_W = 158;
const CARD_H = 206;
const GAP = 14;
const STEP = CARD_W + GAP;
const RADIUS = 32;
const BORDER = 2.5;
const BORDER_COLORS = ["#f5b81c", "#ff2d55"];

export const DEFAULT_PLAYLISTS = [
  {
    id: "top-pop",
    title: "Top-Pop Culture",
    songs: 24,
    gradient: ["#c2457a", "#3a1d6e"],
  },
  {
    id: "chill-one",
    title: "Chill Place One",
    songs: 18,
    gradient: ["#2f6f9a", "#14243d"],
  },
  {
    id: "warm-piano",
    title: "Warm Piano Hours",
    songs: 31,
    gradient: ["#dea962", "#7a3b1a"],
  },
  {
    id: "night-drive",
    title: "Night Drive FM",
    songs: 22,
    gradient: ["#6a4fd8", "#1a1240"],
  },
  {
    id: "rooftop",
    title: "Rooftop Sessions",
    songs: 16,
    gradient: ["#4fd88a", "#0f4a32"],
  },
];

/* ---------- little equalizer for the "Playing" chip ---------- */
function Bars({ active = true }) {
  const bars = useMemo(() => [0, 1, 2].map(() => new Animated.Value(0)), []);

  useEffect(() => {
    if (!active) return;

    const loops = bars.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, {
            toValue: 1,
            duration: 300 + i * 120,
            useNativeDriver: false,
          }),
          Animated.timing(v, {
            toValue: 0,
            duration: 300 + i * 120,
            useNativeDriver: false,
          }),
        ]),
      ),
    );

    loops.forEach((loop) => loop.start());

    return () => {
      loops.forEach((loop) => loop.stop());
    };
  }, [active, bars]);

  return (
    <View className="h-3 flex-row items-end" style={{ gap: 2 }}>
      {bars.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            width: 3,
            borderRadius: 2,
            backgroundColor: "#fff",
            height: v.interpolate({
              inputRange: [0, 1],
              outputRange: [3, 12],
            }),
          }}
        />
      ))}
    </View>
  );
}

/* ---------- one card ---------- */
const Card = memo(function Card({
  item,
  index,
  scrollX,
  playing,
  onPress,
  isScreenActive = true,}) {
  // card shrinks and dims as it scrolls away from the snapped position
  const range = [(index - 1) * STEP, index * STEP, (index + 1) * STEP];
  const scale = scrollX.interpolate({
    inputRange: range,
    outputRange: [0.93, 1, 0.93],
    extrapolate: "clamp",
  });
  const opacity = scrollX.interpolate({
    inputRange: range,
    outputRange: [0.78, 1, 0.78],
    extrapolate: "clamp",
  });

  return (
    <Animated.View style={{ opacity, transform: [{ scale }] }}>
      <Pressable onPress={onPress}>
        {/* outer gradient doubles as the border when this card is playing */}
        <LinearGradient
          colors={playing ? BORDER_COLORS : ["transparent", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: CARD_W,
            height: CARD_H,
            borderRadius: RADIUS,
            padding: BORDER,
            shadowColor: playing ? "#f5b81c" : "#000",
            shadowOpacity: playing ? 0.45 : 0.4,
            shadowRadius: playing ? 18 : 12,
            shadowOffset: { width: 0, height: 10 },
            elevation: playing ? 10 : 6,
          }}
        >
          <View
            style={{
              flex: 1,
              borderRadius: RADIUS - BORDER,
              overflow: "hidden",
            }}
          >
            {/* artwork: photo if given, otherwise gradient */}
            {item.image ? (
              <Image
                source={item.image}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
            ) : (
              <LinearGradient
                colors={item.gradient ?? ["#6a4fd8", "#1a1240"]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            )}

            {/* decorative rings, top right */}
            {[150, 112, 74].map((size) => (
              <View
                key={size}
                className="absolute rounded-full border border-white/10"
                style={{
                  width: size,
                  height: size,
                  top: -34 + (150 - size) / 2,
                  right: -34 + (150 - size) / 2,
                }}
              />
            ))}

            {/* shade so the title is readable on any artwork */}
            <LinearGradient
              colors={["rgba(10,14,40,0)", "rgba(10,14,40,0.72)"]}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: "64%",
              }}
            />

            {/* top row: chip + round play button */}
            <View className="absolute left-3 right-3 top-3 flex-row items-center justify-between">
              <View className="h-7 flex-row items-center rounded-full bg-black/30 px-2.5">
                {playing ? (
                  <>
                 <Bars active={isScreenActive && playing} />
                    <Text className="ml-1.5 text-[11px] font-medium text-white">
                      Playing
                    </Text>
                  </>
                ) : (
                  <>
                    <Music size={12} color="#fff" strokeWidth={2.2} />
                    <Text className="ml-1.5 text-[11px] font-medium text-white">
                      {item.songs} songs
                    </Text>
                  </>
                )}
              </View>

              <View
                className="h-[34px] w-[34px] items-center justify-center rounded-full border"
                style={{
                  backgroundColor: playing
                    ? "#f5b81c"
                    : "rgba(255,255,255,0.2)",
                  borderColor: playing
                    ? "transparent"
                    : "rgba(255,255,255,0.28)",
                }}
              >
                {playing ? (
                  <Pause
                    size={14}
                    color="#1a1200"
                    fill="#1a1200"
                    strokeWidth={0}
                  />
                ) : (
                  <Play size={14} color="#fff" fill="#fff" strokeWidth={0} />
                )}
              </View>
            </View>

            {/* title */}
            <View className="absolute bottom-3.5 left-3.5 right-3.5">
              <Text
                numberOfLines={2}
                className="text-white"
                style={{
                  fontFamily: "Quicksand_500Medium",
                  fontSize: 22,
                  lineHeight: 25,
                  textShadowColor: "rgba(0,0,0,0.35)",
                  textShadowRadius: 6,
                  textShadowOffset: { width: 0, height: 1 },
                }}
              >
                {item.title}
              </Text>
            </View>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
});
/* ---------- section ---------- */
export default function Playlists({
  items = DEFAULT_PLAYLISTS,
  title = "Playlists",
  label = "Handpicked",
  activeId,
  onPressItem,
  onSeeAll,
  C = { fg: "#FFFFFF" },
  className = "",
  isScreenActive = true,
}) {
  const router = useRouter();
  const scrollX = useMemo(() => new Animated.Value(0), []);
  const [page, setPage] = useState(0);
  // playingId is derived from the prop on every render, so no effect is
  // needed to sync it — the component stays in sync without a setState call.
  const [playingIdState, setPlayingIdState] = useState(activeId ?? null);
  const playingId = activeId ?? playingIdState;

  const handlePress = useCallback(
    (item) => {
      setPlayingIdState((cur) =>
        String(cur) === String(item.id) ? null : item.id
      );

      onPressItem?.(item);
    },
    [onPressItem]
  );

  const onScrollEnd = useCallback(
    (e) => {
      const { contentOffset, contentSize, layoutMeasurement } =
        e.nativeEvent;

      const maxX = contentSize.width - layoutMeasurement.width;

      const next =
        contentOffset.x >= maxX - 2
          ? items.length - 1
          : Math.min(
              items.length - 1,
              Math.max(0, Math.round(contentOffset.x / STEP))
            );

      setPage(next);
    },
    [items.length]
  );

  const keyExtractor = useCallback((item) => String(item.id), []);

  const renderSeparator = useCallback(
    () => <View style={{ width: GAP }} />,
    []
  );

  const renderItem = useCallback(
    ({ item, index }) => (
      <Card
        item={item}
        index={index}
        scrollX={scrollX}
        playing={
          playingId != null &&
          String(playingId) === String(item.id)
        }
        onPress={() => handlePress(item)}
        isScreenActive={isScreenActive}
      />
    ),
    [scrollX, playingId, handlePress, isScreenActive]
  );

  const onScroll = useMemo(
    () =>
      Animated.event(
        [{ nativeEvent: { contentOffset: { x: scrollX } } }],
        { useNativeDriver: true }
      ),
    [scrollX]
  );

  if (!items?.length) return null;

  return (
    <View className={`w-full ${className}`}>
      {/* Heading (same layout as Daily Mix, different icon) */}
      <View className="mb-3 ml-0.5 mt-7 flex-row items-center justify-between">
        <TouchableOpacity
          activeOpacity={0.6}
          onPress={onSeeAll ?? (() => router.push("/library"))}
          className="flex-row items-center"
        >
          <ListMusic
            size={20}
            color="#fbbf24"
            strokeWidth={2}
            style={{ marginRight: 8 }}
          />
          <Text
            className="text-3xl font-medium capitalize tracking-widest"
            style={{ color: C.fg, fontFamily: "Quicksand_500Medium" }}
          >
            {title}
          </Text>
        </TouchableOpacity>

        <Text
          style={{
            color: "#8a8a94",
            fontFamily: WORDMARK_FONT,
            fontSize: 10,
            letterSpacing: 1.5,
            textTransform: "uppercase",
          }}
        >
          {label}
        </Text>
      </View>

      {/* Carousel */}
   <Animated.FlatList
  horizontal
  data={items}
  keyExtractor={keyExtractor}
  renderItem={renderItem}
  ItemSeparatorComponent={renderSeparator}
  showsHorizontalScrollIndicator={false}
  snapToInterval={STEP}
  snapToAlignment="start"
  decelerationRate="fast"
  scrollEventThrottle={16}
  contentContainerStyle={{
    paddingTop: 8,
    paddingBottom: 22,
  }}
  onScroll={onScroll}
  onMomentumScrollEnd={onScrollEnd}
  initialNumToRender={3}
  maxToRenderPerBatch={3}
  windowSize={3}
  removeClippedSubviews={false}
/>

      {/* Pagination dots */}
      <View className="flex-row items-center justify-center" style={{ gap: 6 }}>
        {items.map((it, i) => (
          <View
            key={it.id}
            className="h-1.5 rounded-full"
            style={{
              width: i === page ? 22 : 6,
              backgroundColor: i === page ? "#f5b81c" : "rgba(255,255,255,0.2)",
            }}
          />
        ))}
      </View>
    </View>
  );
}
