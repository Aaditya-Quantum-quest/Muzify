import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import React, { memo, useCallback } from "react";
import { LinearGradient } from "expo-linear-gradient";
import {
  Clock,
  Play,
  SlidersHorizontal,
  Sparkles,
  Waves,
  Heart,
  Flame,
  TrendingUp,
  AudioLines,
  Headphones,
} from "lucide-react-native";

// Copy the real values for these two from your original screen file.
// WORDMARK_FONT: your custom font family name (undefined = system font)
// FG_COLOR: the value that used to be C.fg
const WORDMARK_FONT = undefined;
const FG_COLOR = "#ffffff";

const CARD_WIDTH = 280;
const CARD_GAP = 12;

const wordmark = { fontFamily: WORDMARK_FONT };

// Tailwind can't detect dynamically built class names (e.g. `h-[${n}px]`),
// so every bar height is written out as a full static class.
const BAR_HEIGHTS = ["h-[6px]", "h-[11px]", "h-[8px]", "h-[12px]"];

const EqualizerBars = memo(function EqualizerBars() {
  return (
    <View className="h-3 flex-row items-end gap-0.5">
      {BAR_HEIGHTS.map((h, i) => (
        <View key={i} className={`w-[2.5px] rounded-[2px] bg-[#f0c070] ${h}`} />
      ))}
    </View>
  );
});

const MixCard = memo(function MixCard({
  gradient,
  badgeIcon,
  badgeLabel,
  chipLabel,
  chipClass,
  chipTextClass,
  eyebrow,
  eyebrowClass,
  title,
  titleClass,
  subtitle,
  subtitleClass,
  FooterIcon,
  footerLabel,
  footerColor,
  footerTextClass,
}) {
  return (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      className="h-[212px] w-[280px] overflow-hidden rounded-3xl"
    >
      <View className="flex-1 justify-between p-4">
        {/* top row */}
        <View className="flex-row items-center justify-between">
          <View className="h-6 flex-row items-center gap-1.5 rounded-xl bg-[rgba(30,18,8,0.55)] px-2.5">
            {badgeIcon}
            <Text
              className="text-[9.5px] uppercase tracking-[1.4px] text-[#f0c070]"
              style={wordmark}
            >
              {badgeLabel}
            </Text>
          </View>

          <View className={`h-6 justify-center rounded-xl px-2.5 ${chipClass}`}>
            <Text
              className={`text-[11px] font-medium ${chipTextClass}`}
              style={wordmark}
            >
              {chipLabel}
            </Text>
          </View>
        </View>

        {/* text block */}
        <View>
          <Text
            className={`mb-1.5 text-[11px] uppercase tracking-[2px] ${eyebrowClass}`}
            style={wordmark}
          >
            {eyebrow}
          </Text>
          <Text
            numberOfLines={2}
            className={`text-[26px] leading-[30px] tracking-widest capitalize  ${titleClass}`}
            style={{ fontFamily: "Quicksand_500Medium" }}
          >
            {title}
          </Text>
          <Text
            numberOfLines={1}
            className={`mt-1.5 text-xs font-medium ${subtitleClass}`}
          >
            {subtitle}
          </Text>
        </View>

        {/* footer */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-1.5">
            <FooterIcon size={15} color={footerColor} strokeWidth={2} />
            <Text
              className={`text-xs font-medium ${footerTextClass}`}
              style={wordmark}
            >
              {footerLabel}
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.8}
            className="h-11 w-11 items-center justify-center rounded-full bg-[#1a130d]"
            style={{
              shadowColor: "#000",
              shadowOpacity: 0.35,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 6,
            }}
          >
            <Play
              size={16}
              color="#fbbf24"
              strokeWidth={2}
              style={{ marginLeft: 2 }}
            />
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
});

const MIX_CARDS = [
  {
    id: "weekly-featured",
    gradient: ["#e3b25a", "#cf9238", "#b8721f"],
    badgeIcon: <EqualizerBars />,
    badgeLabel: "Sonic Aura",
    chipLabel: "28 Tracks",
    chipClass: "bg-[rgba(255,245,225,0.42)]",
    chipTextClass: "text-[#2a1a0e]",
    eyebrow: "Weekly Featured",
    eyebrowClass: "text-[#3a2814]",
    title: "Soundtrack of the week",
    titleClass: "text-[#1a1208]",
    subtitle: "Ambient beats, lush neoclassical & minimal…",
    subtitleClass: "text-[#3a2814]",
    FooterIcon: Clock,
    footerLabel: "1 hr 42 min",
    footerColor: "#1a1208",
    footerTextClass: "text-[#1a1208]",
  },
  {
    id: "daily-mix",
    gradient: ["#e8892a", "#cf4b2c", "#a82040"],
    badgeIcon: <Waves size={13} color="#f0c070" strokeWidth={2} />,
    badgeLabel: "Adaptive",
    chipLabel: "Updated daily",
    chipClass: "bg-[rgba(255,255,255,0.22)]",
    chipTextClass: "text-[#fff4e6]",
    eyebrow: "Personalised",
    eyebrowClass: "text-[rgba(255,230,200,0.9)]",
    title: "Daily mix, made for you",
    titleClass: "capitalize text-[#fff4e6]",
    subtitle: "Tailored according to your mood and time of day",
    subtitleClass: "text-[rgba(255,240,225,0.85)]",
    FooterIcon: SlidersHorizontal,
    footerLabel: "Adaptive",
    footerColor: "#fff4e6",
    footerTextClass: "text-[#fff4e6]",
  },
  {
    id: "liked-songs",
    gradient: ["#f078a8", "#d83f79", "#92285f"],
    badgeIcon: <Heart size={13} color="#ffe0ed" strokeWidth={2} />,
    badgeLabel: "Heartbeats",
    chipLabel: "Your favourites",
    chipClass: "bg-[rgba(255,255,255,0.22)]",
    chipTextClass: "text-[#fff0f6]",
    eyebrow: "Your Collection",
    eyebrowClass: "text-[#ffe0ed]",
    title: "Songs you love",
    titleClass: "text-[#fff5f9]",
    subtitle: "Every favourite track, all in one place",
    subtitleClass: "text-[#ffe0ed]",
    FooterIcon: Heart,
    footerLabel: "Liked tracks",
    footerColor: "#fff5f9",
    footerTextClass: "text-[#fff5f9]",
  },
  {
    id: "recently-added",
    gradient: ["#56c8b4", "#259b9b", "#176477"],
    badgeIcon: <Sparkles size={13} color="#d7fff5" strokeWidth={2} />,
    badgeLabel: "Fresh Drops",
    chipLabel: "Recently added",
    chipClass: "bg-[rgba(255,255,255,0.2)]",
    chipTextClass: "text-[#e4fffa]",
    eyebrow: "Fresh Collection",
    eyebrowClass: "text-[#d7fff5]",
    title: "New to your library",
    titleClass: "text-[#f0fffc]",
    subtitle: "Discover the latest tracks added to your collection",
    subtitleClass: "text-[#d7fff5]",
    FooterIcon: Clock,
    footerLabel: "Latest additions",
    footerColor: "#f0fffc",
    footerTextClass: "text-[#f0fffc]",
  },
  {
    id: "hyped-songs",
    gradient: ["#b58af5", "#8158d9", "#5030a5"],
    badgeIcon: <Flame size={13} color="#f4eaff" strokeWidth={2} />,
    badgeLabel: "High Voltage",
    chipLabel: "Trending now",
    chipClass: "bg-[rgba(255,255,255,0.2)]",
    chipTextClass: "text-[#f5efff]",
    eyebrow: "Your Hype Zone",
    eyebrowClass: "text-[#e7d8ff]",
    title: "Feel the hype",
    titleClass: "text-[#ffffff]",
    subtitle: "Your most exciting tracks for every high-energy moment",
    subtitleClass: "text-[#e7d8ff]",
    FooterIcon: TrendingUp,
    footerLabel: "On repeat",
    footerColor: "#ffffff",
    footerTextClass: "text-[#ffffff]",
  },
  {
    id: "most-played",
    gradient: ["#64a5f8", "#3976db", "#2444a0"],
    badgeIcon: <AudioLines size={13} color="#e0edff" strokeWidth={2} />,
    badgeLabel: "Heavy Rotation",
    chipLabel: "Top tracks",
    chipClass: "bg-[rgba(255,255,255,0.2)]",
    chipTextClass: "text-[#edf4ff]",
    eyebrow: "Your Top Rotation",
    eyebrowClass: "text-[#d7e7ff]",
    title: "Your all-time repeats",
    titleClass: "text-[#ffffff]",
    subtitle: "The tracks you keep coming back to, again and again",
    subtitleClass: "text-[#d7e7ff]",
    FooterIcon: Headphones,
    footerLabel: "Most played",
    footerColor: "#ffffff",
    footerTextClass: "text-[#ffffff]",
  },
];

const InspiredForYou = memo(function InspiredForYou() {
  const router = useRouter();
  const handleHeadingPress = useCallback(() => {
    router.push("/library");
  }, [router]);

  return (
    <>
      <View className="mb-3 ml-0.5 mt-7 flex-row items-center justify-between">
        <TouchableOpacity
          activeOpacity={0.6}
          onPress={handleHeadingPress}
          className="flex-row items-center"
        >
          <Sparkles
            size={20}
            color="#fbbf24"
            strokeWidth={2}
            style={{ marginRight: 8 }}
          />
          <Text
            className="text-3xl font-semibold capitalize tracking-[2px]"
            style={{ color: FG_COLOR, fontFamily: "Quicksand_500Medium" }}
          >
            Inspired for you
          </Text>
        </TouchableOpacity>

        {/* <Text
          className="text-[10px] uppercase tracking-[1.5px] text-[#8a8a94]"
          style={wordmark}
        >
          Dynamic mix
        </Text> */}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mx-5 grow-0"
        contentContainerClassName="gap-3 px-5"
        snapToInterval={CARD_WIDTH + CARD_GAP}
        snapToAlignment="start"
        decelerationRate="fast"
      >
        {MIX_CARDS.map(({ id, ...card }) => (
          <MixCard key={id} {...card} />
        ))}
      </ScrollView>
    </>
  );
});

export default InspiredForYou;
