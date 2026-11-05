import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Radio } from "lucide-react-native";
import {
  Animated,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useIsFocused } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Slider from "@react-native-community/slider";
import { LinearGradient } from "expo-linear-gradient";
import {
  Activity,
  ArrowRight,
  AudioLines,
  Bell,
  Check,
  ChevronRight,
  CirclePlay,
  Clock3,
  Disc3,
  Equal,
  Explore,
  Headphones,
  Heart,
  Home,
  Library,
  ListMusic,
  Music2,
  Pause,
  Play,
  Search,
  Settings2,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Tune,
  UserRound,
  Waves,
  Zap, Compass
} from "lucide-react-native";

const C = {
  bg: "#131316",
  surface: "#1b1b1e",
  surface2: "#1f1f22",
  surface3: "#2a2a2d",
  surface4: "#353438",
  black: "#0e0e11",
  text: "#e5e1e6",
  muted: "#d8c3ad",
  outline: "#a08e7a",
  outlineDark: "#534434",
  amber: "#ffc174",
  amberStrong: "#f59e0b",
  amberDeep: "#e0a800",
  amberLight: "#ffddb8",
  rose: "#ffb3b5",
  roseStrong: "#de0541",
  violet: "#8b5cf6",
  green: "#69d6a5",
};

const FILTERS = [
  { label: "All", count: "42" },
  { label: "New Release", count: "12" },
  { label: "Trending" },
  { label: "Top Charts" },
  { label: "Spatial Hi-Res" },
  { label: "Podcasts" },
];

const PRESETS = ["Spatial Harmonic", "Analogue Tube", "Studio Reference"];
const FREQUENCY_MODES = [
  "Octave Bands",
  "Phase Lissajous",
  "Acoustic Waterfall",
];

const PLAYLISTS = [
  {
    id: "1",
    title: "Chill Sunset",
    by: "By Waveform • 8 songs",
    tag: "HI-RES",
    icon: "flare",
    colors: ["#ffc174", "#f59e0b", "#de0541"],
    tone: C.amber,
  },
  {
    id: "2",
    title: "Neon Night Drive",
    by: "By Waveform • 10 songs",
    tag: "LOSSLESS",
    icon: "zap",
    colors: ["#de0541", "#353438", "#39393c"],
    tone: C.rose,
  },
  {
    id: "3",
    title: "Golden Hour Pop",
    by: "By Waveform • 12 songs",
    tag: "HI-RES",
    icon: "sun",
    colors: ["#ffc32d", "#ffc174", "#f59e0b"],
    tone: C.amber,
  },
  {
    id: "4",
    title: "Rainy Day Lo-fi",
    by: "By Waveform • 15 songs",
    tag: "LOSSLESS",
    icon: "waves",
    colors: ["#39393c", "#2a2a2d", "#0e0e11"],
    tone: C.muted,
  },
  {
    id: "5",
    title: "Gym Power Mix",
    by: "By Waveform • 20 songs",
    tag: "HIGH ENERGY",
    icon: "zap",
    colors: ["#de0541", "#f59e0b", "#39393c"],
    tone: C.rose,
  },
];

const INSPIRED = [
  {
    title: "Soundtrack of the week",
    subtitle: "Ambient beats, lush neoclassical & minimal drone",
    badge: "SONIC AURA",
    count: "28 Tracks",
    duration: "1 hr 42 min",
    colors: ["#ffc174", "#f59e0b", "#0e0e11"],
    dark: "#0e0e11",
    icon: "audio",
  },
  {
    title: "Daily mix, made for you",
    subtitle: "Tailored acoustic progression to match your heart rate",
    badge: "ADAPTIVE AI",
    count: "34 Tracks",
    duration: "Adaptive BPM",
    colors: ["#e0a800", "#de0541", "#0e0e11"],
    dark: "#fff1f1",
    icon: "waves",
  },
];

const RECENT = [
  {
    title: "Midnight Echoes",
    tracks: "14 tracks",
    icon: "moon",
    colors: ["#0e0e11", "#f59e0b", "#ffc174"],
  },
  {
    title: "Ocean Breeze",
    tracks: "9 tracks",
    icon: "waves",
    colors: ["#0e0e11", "#39393c", "#ffc174"],
  },
  {
    title: "Sunset Boulevard",
    tracks: "22 tracks",
    icon: "sun",
    colors: ["#de0541", "#f59e0b", "#ffc174"],
  },
  {
    title: "Forest Walk",
    tracks: "11 tracks",
    icon: "leaf",
    colors: ["#0e0e11", "#e0a800", "#ffc32d"],
  },
];

const NEW_ADDITIONS = [
  {
    title: "Fresh Finds",
    detail: "Curated 2h ago",
    tag: "NEW",
    icon: "music",
    colors: ["#ffc174", "#2a2a2d", "#0e0e11"],
  },
  {
    title: "New In Pop",
    detail: "Updated today",
    tag: "POP",
    icon: "sparkles",
    colors: ["#de0541", "#353438", "#0e0e11"],
  },
  {
    title: "Indie Drops",
    detail: "18 new cuts",
    tag: "INDIE",
    icon: "radio",
    colors: ["#ffc32d", "#39393c", "#0e0e11"],
  },
  {
    title: "Weekly Radar",
    detail: "Every Friday",
    tag: "RADAR",
    icon: "activity",
    colors: ["#ffddb8", "#2a2a2d", "#0e0e11"],
  },
];

const TODAY_MIXES = [
  {
    title: "Morning Boost",
    detail: "High BPM • Uplifting",
    meta: "120-128 BPM",
    label: "08:00 AM",
    icon: Sun,
    color: C.amberStrong,
  },
  {
    title: "Focus Flow",
    detail: "Binaural • Low Vocals",
    meta: "Beta Wave",
    label: "Deep Work",
    icon: Headphones,
    color: C.amberDeep,
  },
  {
    title: "Evening Wind Down",
    detail: "Organic Chill • Velvet",
    meta: "65-75 BPM",
    label: "21:00 PM",
    icon: Disc3,
    color: C.muted,
  },
  {
    title: "Weekend Vibes",
    detail: "Eclectic House • Funk",
    meta: "Groove Synced",
    label: "Live Sets",
    icon: Sparkles,
    color: C.rose,
  },
];

const Icon = memo(function Icon({
  name,
  size = 20,
  color = C.text,
  strokeWidth = 2,
}) {
  const props = { size, color, strokeWidth };
  switch (name) {
    case "search":
      return <Search {...props} />;
    case "bell":
      return <Bell {...props} />;
    case "user":
      return <UserRound {...props} />;
    case "music":
      return <Music2 {...props} />;
    case "audio":
      return <AudioLines {...props} />;
    case "waves":
      return <Waves {...props} />;
    case "sun":
      return <Sun {...props} />;
    case "zap":
      return <Zap {...props} />;
    case "radio":
      return <Radio {...props} />;
    case "activity":
      return <Activity {...props} />;
    case "moon":
      return <Disc3 {...props} />;
    case "leaf":
      return <Sparkles {...props} />;
    case "play":
      return <Play {...props} />;
    case "pause":
      return <Pause {...props} />;
    case "next":
      return <SkipForward {...props} />;
    case "home":
      return <Home {...props} />;
    case "explore":
      return <Compass {...props} />;
    case "library":
      return <Library {...props} />;
    case "podcasts":
      return <Radio {...props} />;
    case "tune":
      return <SlidersHorizontal {...props} />;
    case "list":
      return <ListMusic {...props} />;
    case "clock":
      return <Clock3 {...props} />;
    case "check":
      return <Check {...props} />;
    case "arrow":
      return <ArrowRight {...props} />;
    case "chevron":
      return <ChevronRight {...props} />;
    case "equal":
      return <Equal {...props} />;
    default:
      return <Music2 {...props} />;
  }
});

const ActionButton = memo(function ActionButton({
  icon,
  onPress,
  label,
  active = false,
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className={`h-10 w-10 items-center justify-center rounded-full ${active ? "bg-[#f59e0b]" : "bg-[#2a2a2d]"}`}
    >
      <Icon name={icon} size={19} color={active ? C.black : C.muted} />
    </Pressable>
  );
});

const SectionHeading = memo(function SectionHeading({
  title,
  subtitle,
  right,
}) {
  return (
    <View className="mb-3 flex-row items-center justify-between">
      <View className="flex-1 pr-2">
        <Text className="text-[18px] font-bold text-[#e5e1e6]">{title}</Text>
        {!!subtitle && (
          <Text className="mt-1 text-[11px] text-[#a08e7a]">{subtitle}</Text>
        )}
      </View>
      {right}
    </View>
  );
});

const SpectrumBars = memo(function SpectrumBars({
  phase,
  count = 16,
  height = 76,
  color = C.amber,
  secondary = false,
}) {
  const bars = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const base = 0.25 + ((i * 17) % 61) / 100;
        const a = 0.2 + ((i + 1) % 4) * 0.12;
        const b = 0.25 + ((i + 2) % 5) * 0.1;
        return {
          base,
          a,
          b,
          color: secondary && i > count * 0.72 ? C.rose : color,
        };
      }),
    [count, color, secondary],
  );

  return (
    <View className="h-full w-full flex-row items-end justify-between gap-[3px]">
      {bars.map((bar, index) => {
        const scaleY = phase.interpolate({
          inputRange: [0, 0.25, 0.5, 0.75, 1],
          outputRange: [
            bar.base,
            bar.a,
            bar.b,
            0.35 + (index % 3) * 0.18,
            bar.base,
          ],
        });
        return (
          <View key={index} className="h-full flex-1 items-center justify-end">
            <Animated.View
              style={{
                height: "100%",
                transform: [{ scaleY }],
                backgroundColor: bar.color,
                opacity: 0.9,
              }}
              className="w-full rounded-t-sm"
            />
          </View>
        );
      })}
    </View>
  );
});

const PlaylistRow = memo(function PlaylistRow({ item, playing, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      className="mb-2 flex-row items-center justify-between rounded-xl bg-[#1b1b1e] p-3"
    >
      <View className="min-w-0 flex-1 flex-row items-center">
        <LinearGradient
          colors={item.colors}
          className="mr-3 h-12 w-12 items-center justify-center overflow-hidden rounded-lg"
        >
          <Icon name={item.icon} size={22} color={item.tone} />
          {playing && (
            <View className="absolute inset-0 flex-row items-center justify-center bg-[#0e0e11]/80">
              <View className="mx-[2px] h-3 w-[3px] rounded-full bg-[#ffc174]" />
              <View className="mx-[2px] h-5 w-[3px] rounded-full bg-[#f59e0b]" />
              <View className="mx-[2px] h-2 w-[3px] rounded-full bg-[#ffc174]" />
            </View>
          )}
        </LinearGradient>
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center">
            <Text
              numberOfLines={1}
              className="mr-2 flex-shrink text-[13px] font-semibold text-[#e5e1e6]"
            >
              {item.title}
            </Text>
            <Text className="rounded bg-[#353438] px-1.5 py-0.5 text-[8px] font-bold text-[#ffc174]">
              {item.tag}
            </Text>
          </View>
          <Text numberOfLines={1} className="mt-1 text-[10px] text-[#a08e7a]">
            {item.by}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={onPress}
        className={`ml-2 h-10 w-10 items-center justify-center rounded-full ${playing ? "bg-[#ffc174]" : "bg-[#2a2a2d]"}`}
      >
        <Icon
          name={playing ? "pause" : "play"}
          size={18}
          color={playing ? C.black : C.text}
        />
      </Pressable>
    </Pressable>
  );
});

const MiniCard = memo(function MiniCard({ item, playing, onPress }) {
  return (
    <View className="mr-3 w-36 rounded-xl bg-[#1b1b1e] p-2.5">
      <LinearGradient
        colors={item.colors}
        className="relative mb-2 aspect-square w-full items-center justify-center overflow-hidden rounded-lg"
      >
        <Icon name={item.icon} size={30} color={C.amber} />
        <Pressable
          onPress={onPress}
          className="absolute bottom-2 right-2 h-8 w-8 items-center justify-center rounded-full bg-[#ffc174]"
        >
          <Icon name={playing ? "pause" : "play"} size={15} color={C.black} />
        </Pressable>
      </LinearGradient>
      <Text
        numberOfLines={1}
        className="text-[12px] font-semibold text-[#e5e1e6]"
      >
        {item.title}
      </Text>
      <Text className="mt-1 text-[10px] text-[#a08e7a]">{item.tracks}</Text>
    </View>
  );
});

const SpectrumCard = memo(function SpectrumCard({
  onSearch,
  onNotifications,
  onProfile,
  onNavigate,
  onPlayTrack,
}) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState(0);
  const [preset, setPreset] = useState(0);
  const [frequencyMode, setFrequencyMode] = useState(0);
  const [exciter, setExciter] = useState(3.2);
  const [dacPrimary, setDacPrimary] = useState(true);
  const [eqEnabled, setEqEnabled] = useState(false);
  const [playingRow, setPlayingRow] = useState(null);
  const [playingTrack, setPlayingTrack] = useState("Obsidian Resonance");
  const [isPlaying, setIsPlaying] = useState(true);
  const [activeTab, setActiveTab] = useState("home");
  const [samplingRate, setSamplingRate] = useState("96kHz / 24-bit Lossless");
  const [session, setSession] = useState("Morning Awakening");

  const phase = useRef(new Animated.Value(0)).current;
  const beam = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isFocused) return undefined;

    const spectrumLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(phase, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(phase, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: true,
        }),
      ]),
    );
    const beamLoop = Animated.loop(
      Animated.timing(beam, {
        toValue: 1,
        duration: 5200,
        useNativeDriver: true,
      }),
    );

    spectrumLoop.start();
    beamLoop.start();

    return () => {
      spectrumLoop.stop();
      beamLoop.stop();
      phase.stopAnimation();
      beam.stopAnimation();
    };
  }, [isFocused, phase, beam]);

  const toggleRow = useCallback(
    (id, title) => {
      setPlayingRow((current) => (current === id ? null : id));
      setPlayingTrack(title);
      setIsPlaying((current) => (playingRow === id ? false : true));
      onPlayTrack?.(title);
    },
    [onPlayTrack, playingRow],
  );

  const toggleTrack = useCallback(
    (title) => {
      setPlayingTrack((current) => {
        const next = current === title && isPlaying ? null : title;
        return next || title;
      });
      setIsPlaying((current) => (playingTrack === title ? !current : true));
      onPlayTrack?.(title);
    },
    [isPlaying, onPlayTrack, playingTrack],
  );

  const navigate = useCallback(
    (tab) => {
      setActiveTab(tab);
      onNavigate?.(tab);
    },
    [onNavigate],
  );

  const handleSearch = useCallback(() => {
    setSearchOpen((value) => !value);
    onSearch?.();
  }, [onSearch]);

  const spectrumTranslate = beam.interpolate({
    inputRange: [0, 1],
    outputRange: [-220, 220],
  });

  if (!isFocused) return null;

  return (
    <View className="flex-1 bg-[#131316]" style={{ paddingTop: insets.top }}>
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 190 }}
        removeClippedSubviews
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pb-3 pt-3">
          <View className="flex-row items-center">
            <View className="mr-2 h-9 w-9 items-center justify-center rounded-xl bg-[#2a2a2d]">
              <Icon name="audio" size={22} color={C.amber} />
            </View>
            <View>
              <View className="flex-row items-center">
                <Text className="text-[17px] font-extrabold tracking-tight text-[#e5e1e6]">
                  N MUSIC
                </Text>
                <Text className="ml-2 rounded bg-[#ffc174]/20 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-[#ffc174]">
                  PRO
                </Text>
              </View>
              <View className="mt-0.5 flex-row items-center">
                <View className="mr-1.5 h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />
                <Text className="text-[9px] font-bold uppercase tracking-[2px] text-[#ffc174]">
                  Home
                </Text>
              </View>
            </View>
          </View>
          <View className="flex-row items-center gap-1">
            <ActionButton
              icon="search"
              label="Search"
              onPress={handleSearch}
              active={searchOpen}
            />
            <ActionButton
              icon="bell"
              label="Notifications"
              onPress={onNotifications}
            />
            <ActionButton icon="user" label="Profile" onPress={onProfile} />
          </View>
        </View>

        {searchOpen && (
          <View className="mx-5 mb-3 flex-row items-center rounded-xl bg-[#2a2a2d] px-3 py-2.5">
            <Icon name="search" size={17} color={C.outline} />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search albums, artists, or lossless tracks..."
              placeholderTextColor={C.outline}
              className="ml-2 flex-1 py-0 text-[12px] text-[#e5e1e6]"
              returnKeyType="search"
            />
            <Pressable onPress={() => setSearchText("")}>
              <Text className="text-[10px] font-bold text-[#a08e7a]">
                CLEAR
              </Text>
            </Pressable>
          </View>
        )}

        {/* Audio engine status */}
        <Pressable
          onPress={() => setEqEnabled((v) => !v)}
          className="mx-5 mb-5 rounded-xl bg-[#1b1b1e] p-3.5"
        >
          <View className="flex-row items-center justify-between">
            <View className="min-w-0 flex-1 flex-row items-center">
              <View className="mr-3 h-11 w-11 items-center justify-center rounded-full bg-[#2a2a2d]">
                <Icon name="audio" size={22} color={C.amber} />
                <View className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#1b1b1e] bg-[#f59e0b]" />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-[9px] font-bold uppercase tracking-[1.4px] text-[#ffc174]">
                  HI-RES AUDIO ENGINE
                </Text>
                <Text
                  numberOfLines={1}
                  className="mt-1 text-[15px] font-bold text-[#e5e1e6]"
                >
                  Audiophile Studio Master
                </Text>
              </View>
            </View>
            <View className="ml-2 flex-row items-center">
              <View className="mr-2 h-8 flex-row items-end rounded-lg bg-[#2a2a2d] px-2 py-1">
                {[3, 5, 4, 2].map((h, i) => (
                  <View
                    key={i}
                    style={{ height: h * 3 }}
                    className={`mx-[2px] w-[3px] rounded-full ${i === 1 ? "bg-[#f59e0b]" : "bg-[#ffc174]"}`}
                  />
                ))}
              </View>
              <View
                className={`h-9 w-9 items-center justify-center rounded-lg ${eqEnabled ? "bg-[#f59e0b]" : "bg-[#2a2a2d]"}`}
              >
                <Icon
                  name="tune"
                  size={18}
                  color={eqEnabled ? C.black : C.amber}
                />
              </View>
            </View>
          </View>
          <View className="mt-3 flex-row items-center justify-between border-t border-[#353438] pt-2.5">
            <View className="flex-row items-center">
              <Text className="rounded bg-[#353438] px-2 py-1 text-[9px] font-bold tracking-wider text-[#ffc174]">
                {eqEnabled ? "DSP ACTIVE" : "PURE DIRECT"}
              </Text>
              <Text className="ml-2 text-[9px] text-[#d8c3ad]">
                ES9038PRO Dual DAC
              </Text>
            </View>
            <Text className="text-[9px] text-[#a08e7a]">
              Tap to switch mode →
            </Text>
          </View>
        </Pressable>

    
 
      </ScrollView>


    </View>
  );
});

export default SpectrumCard;
