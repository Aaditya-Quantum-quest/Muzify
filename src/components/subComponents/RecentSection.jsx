import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Animated,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Clock, Zap, Sun, Play, Pause } from "lucide-react-native";

/* ---------- constants ---------- */
const WORDMARK_FONT = "PlaywriteITTrad_400Regular";
// Serif italic for titles on cards (@expo-google-fonts/playfair-display)
const TITLE_FONT = "PlayfairDisplay_500Medium_Italic";

const ACCENT = "#f5b81c";
const BORDER_COLORS = ["#f5b81c", "#ff2d55"]; // border of the playing card
const BORDER = 2.5;

/* ---------- demo data (pass your own via props) ---------- */
// progress (0-1) is optional: shows a "resume" line on Recent cards
export const RECENT = [
  {
    id: 1,
    title: "Midnight Echoes",
    songs: 14,
    gradient: ["#6a4fd8", "#2a1d6e"],
    progress: 0.62,
  },
  { id: 2, title: "Ocean Breeze", songs: 11, gradient: ["#4f8fd8", "#1d3a6e"] },
  {
    id: 3,
    title: "Sunset Boulevard",
    songs: 9,
    gradient: ["#e69a12", "#c25d1a"],
    progress: 0.35,
  },
  { id: 4, title: "Forest Walk", songs: 16, gradient: ["#4fd88a", "#1d6e45"] },
];

export const NEW_SONGS = [
  { id: 1, title: "Fresh Finds", songs: 7, gradient: ["#ec6f8e", "#8e2a55"] },
  { id: 2, title: "New In Pop", songs: 12, gradient: ["#dea962", "#e09a66"] },
  { id: 3, title: "Indie Drops", songs: 9, gradient: ["#4f8fd8", "#1d3a6e"] },
  { id: 4, title: "Weekly Radar", songs: 15, gradient: ["#6a4fd8", "#2a1d6e"] },
];

// tag is the small word on the hero card
export const TODAY_MIX = [
  {
    id: 1,
    title: "Morning Boost",
    songs: 18,
    gradient: ["#f2b134", "#e0603a"],
    tag: "Morning",
  },
  {
    id: 2,
    title: "Focus Flow",
    songs: 22,
    gradient: ["#4fd88a", "#1d6e45"],
    tag: "Focus",
  },
  {
    id: 3,
    title: "Evening Wind Down",
    songs: 13,
    gradient: ["#6a4fd8", "#2a1d6e"],
    tag: "Evening",
  },
  {
    id: 4,
    title: "Weekend Vibes",
    songs: 25,
    gradient: ["#ec6f8e", "#8e2a55"],
    tag: "Weekend",
  },
];

const titleShadow = {
  textShadowColor: "rgba(0,0,0,0.35)",
  textShadowRadius: 6,
  textShadowOffset: { width: 0, height: 1 },
};

/* ---------- shared pieces ---------- */

// Gradient frame: becomes the amber-to-red border when the card is playing.
function Frame({ playing, radius, width, height, children }) {
  return (
    <LinearGradient
      colors={playing ? BORDER_COLORS : ["transparent", "transparent"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width,
        height,
        borderRadius: radius,
        padding: BORDER,
        shadowColor: playing ? ACCENT : "#000",
        shadowOpacity: playing ? 0.45 : 0.4,
        shadowRadius: playing ? 18 : 12,
        shadowOffset: { width: 0, height: 10 },
        elevation: playing ? 10 : 6,
      }}
    >
      <View
        style={{ flex: 1, borderRadius: radius - BORDER, overflow: "hidden" }}
      >
        {children}
      </View>
    </LinearGradient>
  );
}

// concentric rings in the top-right corner
function Rings({ size = 130 }) {
  return (
    <>
      {[1, 0.75, 0.5].map((k) => {
        const s = size * k;
        const offset = -size * 0.26 + (size - s) / 2;
        return (
          <View
            key={k}
            className="absolute rounded-full border border-white/10"
            style={{ width: s, height: s, top: offset, right: offset }}
          />
        );
      })}
    </>
  );
}

// gradient artwork + rings + bottom shade
function Art({ colors, ringSize }) {
  return (
    <>
      <LinearGradient
        colors={colors ?? ["#6a4fd8", "#1a1240"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Rings size={ringSize} />
      <LinearGradient
        colors={["rgba(10,14,40,0)", "rgba(10,14,40,0.65)"]}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "60%",
        }}
      />
    </>
  );
}

// round play / pause button (amber while playing)
function PlayBtn({ playing, size = 30, iconSize = 13, solid = false }) {
  const amber = playing || solid;
  const Icon = playing ? Pause : Play;
  return (
    <View
      className="items-center justify-center rounded-full border"
      style={{
        width: size,
        height: size,
        backgroundColor: amber ? ACCENT : "rgba(255,255,255,0.2)",
        borderColor: amber ? "transparent" : "rgba(255,255,255,0.28)",
      }}
    >
      <Icon
        size={iconSize}
        color={amber ? "#1a1200" : "#fff"}
        fill={amber ? "#1a1200" : "#fff"}
        strokeWidth={0}
      />
    </View>
  );
}

// Same heading layout as Daily Mix, with a different icon per section
function SectionHeading({ Icon, title, label, C, onPress }) {
  return (
    <View className="mb-3 ml-0.5 mt-7 flex-row items-center justify-between">
      <TouchableOpacity
        activeOpacity={0.6}
        onPress={onPress}
        className="flex-row items-center"
      >
        <Icon
          size={20}
          color="#fbbf24"
          strokeWidth={2}
          style={{ marginRight: 8 }}
        />
        <Text
          className="text-3xl tracking-widest"
          style={{
            color: C.fg,
            textTransform: "capitalize",
            fontFamily: "Quicksand_500Medium",
          }}
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
  );
}

// small pulsing dot inside the NEW badge
const PulseDot = memo(function PulseDot({ active = true }) {
  const v = useMemo(() => new Animated.Value(1), []);

  useEffect(() => {
    if (!active) {
      v.stopAnimation();
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, {
          toValue: 0.3,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();

    return () => {
      loop.stop();
      v.stopAnimation();
    };
  }, [active, v]);

  return (
    <Animated.View
      className="mr-1.5 h-[5px] w-[5px] rounded-full bg-[#1a1200]"
      style={{ opacity: v }}
    />
  );
});
/* ---------- Recent ---------- */
const RecentCard = memo(function RecentCard({ item, playing, onPress }) {
  return (
    <Pressable onPress={onPress} style={{ width: 128 }}>
      <Frame playing={playing} radius={26} width={128} height={128}>
        <Art colors={item.gradient} ringSize={130} />

        <View className="absolute right-2.5 top-2.5">
          <PlayBtn playing={playing} />
        </View>

        {item.progress > 0 && (
          <View className="absolute bottom-[11px] left-3 right-3 h-[3px] rounded-full bg-white/25">
            <View
              className="h-full rounded-full"
              style={{
                width: `${Math.round(item.progress * 100)}%`,
                backgroundColor: ACCENT,
              }}
            />
          </View>
        )}
      </Frame>

      <Text
        numberOfLines={1}
        className="mt-2.5 text-sm text-white"
        style={{ fontFamily: "Quicksand_500Medium" }}
      >
        {item.title}
      </Text>
      <Text className="mt-0.5 text-xs text-white/50">{item.songs} songs</Text>
    </Pressable>
  );
});

function RecentSection({ items, playingKey, onToggle, C, onHeadingPress }) {
  return (
    <View>
      <SectionHeading
        Icon={Clock}
        title="Recent"
        label="Replay"
        C={C}
        onPress={onHeadingPress}
      />
      <FlatList
        horizontal
        data={items}
        keyExtractor={(it) => String(it.id)}
        showsHorizontalScrollIndicator={false}
        snapToInterval={140}
        decelerationRate="fast"
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 6 }}
        ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
        renderItem={({ item }) => (
          <RecentCard
            item={item}
            playing={playingKey === `recent-${item.id}`}
            onPress={() => onToggle(`recent-${item.id}`, item)}
          />
        )}
      />
    </View>
  );
}

/* ---------- New Songs ---------- */
function NewTile({ item, playing, onPress, isScreenActive = true }) {
  return (
    <Pressable onPress={onPress} style={{ width: "48.5%" }}>
      <Frame playing={playing} radius={24} width="100%" height={116}>
        <Art colors={item.gradient} ringSize={110} />

        <View className="absolute left-2.5 top-2.5 h-5 flex-row items-center rounded-full bg-[#f5b81c] px-2">
          <PulseDot active={isScreenActive} />
          <Text className="text-[9px] font-bold tracking-widest text-[#1a1200]">
            NEW
          </Text>
        </View>

        <View className="absolute right-2.5 top-2.5">
          <PlayBtn playing={playing} />
        </View>

        <View className="absolute bottom-[11px] left-3 right-3">
          <Text
            numberOfLines={2}
            className="text-white"
            style={{
              fontFamily: "Quicksand_500Medium",
              fontSize: 17,
              lineHeight: 19,
              ...titleShadow,
            }}
          >
            {item.title}
          </Text>
          <Text className="mt-1 text-[11px] text-white/80">
            {item.songs} songs
          </Text>
        </View>
      </Frame>
    </Pressable>
  );
}

const NewSongsSection = memo(function NewSongsSection({
  items,
  playingKey,
  onToggle,
  C,
  onHeadingPress,
  isScreenActive = true,
}) {
  return (
    <View>
      <SectionHeading
        Icon={Zap}
        title="New Songs"
        label="Just in"
        C={C}
        onPress={onHeadingPress}
      />
      <View
        className="flex-row flex-wrap justify-between"
        style={{ rowGap: 10 }}
      >
        {items.map((item) => (
    <NewTile
  key={item.id}
  item={item}
  playing={playingKey === `new-${item.id}`}
  onPress={() => onToggle(`new-${item.id}`, item)}
  isScreenActive={isScreenActive}
/>
        ))}
      </View>
    </View>
  );
});

/* ---------- Today's Mix ---------- */
const TodayMixSection = memo(function TodayMixSection({
  items,
  playingKey,
  onToggle,
  C,
  onHeadingPress,
  isScreenActive = true,
}) {
  const [index, setIndex] = useState(0);
  const safeItems = items ?? [];

  // hooks must run unconditionally, so derive the renderable item up front
  const item = safeItems[index] ?? safeItems[0];

  // content slides in when the hero changes, and a soft light drifts around
  const swap = useMemo(() => new Animated.Value(1), []);
  const drift = useMemo(() => new Animated.Value(0), []);

useEffect(() => {
  if (!isScreenActive) {
    swap.setValue(1);
    return;
  }

  swap.setValue(0);

  const animation = Animated.timing(swap, {
    toValue: 1,
    duration: 450,
    useNativeDriver: true,
  });

  animation.start();

  return () => animation.stop();
}, [index, swap, isScreenActive]);




useEffect(() => {
  if (!isScreenActive) {
    drift.stopAnimation();
    return;
  }

  const loop = Animated.loop(
    Animated.sequence([
      Animated.timing(drift, {
        toValue: 1,
        duration: 7000,
        useNativeDriver: true,
      }),
      Animated.timing(drift, {
        toValue: 0,
        duration: 7000,
        useNativeDriver: true,
      }),
    ])
  );

  loop.start();

  return () => {
    loop.stop();
    drift.stopAnimation();
  };
}, [drift, isScreenActive]);

  if (!item) return null;

  const key = `mix-${item.id}`;
  const playing = playingKey === key;

  return (
    <View>
      <SectionHeading
        Icon={Sun}
        title="Today's Mix"
        label="For today"
        C={C}
        onPress={onHeadingPress}
      />

      <Pressable onPress={() => onToggle(key, item)}>
        <Frame playing={playing} radius={30} width="100%" height={178}>
          <Art colors={item.gradient} ringSize={170} />

          {/* drifting light */}
          <Animated.View
            pointerEvents="none"
            className="absolute rounded-full bg-white/10"
            style={{
              width: 150,
              height: 150,
              left: -30,
              top: -44,
              transform: [
                {
                  translateX: drift.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 120],
                  }),
                },
                {
                  translateY: drift.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 36],
                  }),
                },
              ],
            }}
          />

          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                opacity: swap,
                transform: [
                  {
                    translateX: swap.interpolate({
                      inputRange: [0, 1],
                      outputRange: [18, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {/* faint time word behind everything */}
            <Text
              numberOfLines={1}
              className="absolute bottom-11 right-3.5"
              style={{
                fontFamily: TITLE_FONT,
                fontSize: 64,
                lineHeight: 70,
                color: "rgba(255,255,255,0.13)",
              }}
            >
              {item.tag ?? "Mix"}
            </Text>

            <View className="absolute left-3.5 top-3.5 h-7 flex-row items-center rounded-full bg-black/30 pl-2 pr-3">
              <Sun size={13} color="#fff" strokeWidth={2.2} />
              <Text className="ml-1.5 text-[11.5px] font-medium text-white">
                {item.tag ?? "Mix"}
              </Text>
            </View>

            <View className="absolute bottom-4 left-4 right-20">
              <Text
                numberOfLines={2}
                className="text-white"
                style={{
                  fontFamily: "Quicksand_500Medium",
                  fontSize: 28,
                  lineHeight: 30,
                  ...titleShadow,
                }}
              >
                {item.title}
              </Text>
              <Text className="mt-1.5 text-xs text-white/80">
                {item.songs} songs
              </Text>
            </View>

            <View
              className="absolute bottom-4 right-4"
              style={{
                shadowColor: ACCENT,
                shadowOpacity: 0.5,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 0 },
              }}
            >
              <PlayBtn playing={playing} size={52} iconSize={20} solid />
            </View>
          </Animated.View>
        </Frame>
      </Pressable>

      {/* mix switcher */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12 }}
      >
        {items.map((it, i) => {
          const selected = i === index;
          return (
            <Pressable
              key={it.id}
              onPress={() => setIndex(i)}
              className="mr-2 h-[34px] flex-row items-center rounded-full border pl-2 pr-3"
              style={{
                backgroundColor: selected
                  ? "rgba(245,184,28,0.1)"
                  : "rgba(255,255,255,0.05)",
                borderColor: selected
                  ? "rgba(245,184,28,0.6)"
                  : "rgba(255,255,255,0.08)",
              }}
            >
              <LinearGradient
                colors={it.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ width: 18, height: 18, borderRadius: 9 }}
              />
              <Text
                className="ml-[7px] text-[12.5px]"
                style={{ color: selected ? "#fff" : "rgba(255,255,255,0.7)" }}
              >
                {it.title}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
});

/* ---------- main ---------- */
/**
 * <HomeSections
 *   recent={RECENT}
 *   newSongs={NEW_SONGS}
 *   todayMix={TODAY_MIX}
 *   onPressItem={(section, item) => router.push(`/playlist/${item.id}`)}
 *   onPressHeading={(section) => ...}   // optional, defaults to /library
 * />
 */
const RecentGrid = memo(function RecentGrid({
  recent = RECENT,
  newSongs = NEW_SONGS,
  todayMix = TODAY_MIX,
  onPressItem, // (section, item) => void
  onPressHeading, // (section) => void
  initialPlaying = "recent-1",
  C = { fg: "#FFFFFF" },
  className = "",
  isScreenActive = true,
}) {
  const router = useRouter();
  const [playingKey, setPlayingKey] = useState(initialPlaying);

  // only one thing plays at a time; tapping the playing card again pauses it
const toggle = useCallback((key, item) => {
  setPlayingKey((cur) => (cur === key ? null : key));
  onPressItem?.(key.split("-")[0], item);
}, [onPressItem]);

const handleRecentHeadingPress = useCallback(() => {
  if (onPressHeading) onPressHeading("recent");
  else router.push("/library");
}, [onPressHeading, router]);

const handleNewHeadingPress = useCallback(() => {
  if (onPressHeading) onPressHeading("new");
  else router.push("/library");
}, [onPressHeading, router]);

const handleMixHeadingPress = useCallback(() => {
  if (onPressHeading) onPressHeading("mix");
  else router.push("/library");
}, [onPressHeading, router]);

  return (
    <View className={`w-full ${className}`}>
      {!!recent?.length && (
        <RecentSection
          items={recent}
          playingKey={playingKey}
          onToggle={toggle}
          C={C}
      onHeadingPress={handleRecentHeadingPress}
        />
      )}
      {!!newSongs?.length && (
        <NewSongsSection
          items={newSongs}
          playingKey={playingKey}
          onToggle={toggle}
          C={C}
        onHeadingPress={handleNewHeadingPress}
isScreenActive={isScreenActive}
        />
      )}
      {!!todayMix?.length && (
        <TodayMixSection
          items={todayMix}
          playingKey={playingKey}
          onToggle={toggle}
          C={C}
    onHeadingPress={handleMixHeadingPress}
isScreenActive={isScreenActive}
        />
      )}
    </View>
  );
});

export default RecentGrid;