import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import {
  Sparkles,
  Music,
  Headphones,
  Activity,
  Disc,
  Star,
  BarChart3,
} from "lucide-react-native";
import MixSongList from "./MixSongList";

export { MixSongItem, songToMixTrack } from "./MixSongList";

const WORDMARK_FONT = "PlaywriteITTrad_400Regular";

const TRACKS = [
  {
    id: "midnight-resonator",
    title: "Midnight Resonator",
    artist: "Komorebi Pulse",
    quality: "96kHz",
    duration: 222,
    explicit: true,
    colors: ["#4b2fd6", "#f5a623"],
    Icon: BarChart3,
  },
  {
    id: "atmospheric-void",
    title: "Atmospheric Void",
    artist: "Synthetica Dream",
    quality: "24-Bit",
    duration: 255,
    explicit: false,
    colors: ["#ff5e62", "#ff9966"],
    Icon: Music,
  },
  {
    id: "neon-solitude",
    title: "Neon Solitude",
    artist: "Cyberia Echoes",
    quality: "Atmos",
    duration: 178,
    explicit: true,
    colors: ["#1e5bff", "#35c1ff"],
    Icon: Headphones,
  },
  {
    id: "sub-bass-horizon",
    title: "Sub-Bass Horizon",
    artist: "Subterranean",
    quality: "Lossless",
    duration: 312,
    explicit: false,
    colors: ["#0f766e", "#34d399"],
    Icon: Activity,
  },
  {
    id: "chroma-drift",
    title: "Chroma Drift",
    artist: "Aura Veil",
    quality: "FLAC",
    duration: 198,
    explicit: false,
    colors: ["#a21caf", "#f472b6"],
    Icon: Disc,
  },
  {
    id: "golden-velvet-reverie",
    title: "Golden Velvet Reverie",
    artist: "Hollow Luminary",
    quality: "FLAC",
    duration: 280,
    explicit: false,
    colors: ["#6b4a00", "#e6a817"],
    Icon: Star,
  },
];

export default function DailyMixTracks({
  tracks = TRACKS,
  initialIndex = null,
  C = { fg: "#FFFFFF" },
  onViewDetails,
  isScreenActive = true,
}) {
  const router = useRouter();

  return (
    <View className="w-full">
      <View className="mb-5 ml-0.5 flex-row items-center justify-between">
        <TouchableOpacity
          activeOpacity={0.6}
          onPress={() => router.push("/library")}
          className="flex-row items-center"
        >
          <Sparkles
            size={20}
            color="#fbbf24"
            strokeWidth={2}
            style={{ marginRight: 8 }}
          />
          <Text
            className="text-3xl font-medium capitalize tracking-widest"
            style={{ color: C.fg, fontFamily: "Quicksand_500Medium" }}
          >
            Daily Mix
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
          Dynamic mix
        </Text>
      </View>

      <MixSongList
        tracks={tracks}
        initialIndex={initialIndex}
        isScreenActive={isScreenActive}
        onViewDetails={onViewDetails}
      />
    </View>
  );
}
