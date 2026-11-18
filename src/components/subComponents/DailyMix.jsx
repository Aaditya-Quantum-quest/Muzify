import { useCallback, useEffect, useMemo, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Sparkles } from "lucide-react-native";
import MixSongList, { songToMixTrack } from "./MixSongList";
import { useSongs } from "../../hooks/useSongs.js";
import { usePlayer } from "../../context/player-context";
import { playbackQueue } from "../../services/audio/PlaybackQueue";

export { MixSongItem, songToMixTrack } from "./MixSongList";

const WORDMARK_FONT = "PlaywriteITTrad_400Regular";
const DAILY_SIZE = 6;

// yyyymmdd - the mix is re-picked when the calendar day changes.
const daySeed = (date = new Date()) =>
  date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic partial Fisher-Yates: same songs for a given day, a different
// set tomorrow, and no shuffling churn between renders.
function pickDailySongs(songs, count, seed) {
  const total = songs.length;
  if (total === 0) return [];

  const n = Math.min(count, total);
  const order = new Array(total);
  for (let i = 0; i < total; i += 1) order[i] = i;

  const rng = mulberry32(seed);
  for (let i = 0; i < n; i += 1) {
    const j = i + Math.floor(rng() * (total - i));
    const swap = order[i];
    order[i] = order[j];
    order[j] = swap;
  }

  const picks = new Array(n);
  for (let i = 0; i < n; i += 1) picks[i] = songs[order[i]];
  return picks;
}

export default function DailyMixTracks({
  initialIndex = null,
  C = { fg: "#FFFFFF" },
  onViewDetails,
  isScreenActive = true,
}) {
  const router = useRouter();
  const { songs, loading, refreshSongs } = useSongs();
  const { playSongs, togglePlay, track, playing, seekTo } = usePlayer();

  // Home stays mounted while blurred, so pick up imports made on other tabs.
  // The hook already queries on mount, hence the first activation is skipped.
  // Deferred one tick so the tab switch paints before the synchronous SQLite
  // read runs.
  const activatedOnce = useRef(false);
  useEffect(() => {
    if (!isScreenActive) return undefined;
    if (!activatedOnce.current) {
      activatedOnce.current = true;
      return undefined;
    }
    const id = setTimeout(() => refreshSongs(), 0);
    return () => clearTimeout(id);
  }, [isScreenActive, refreshSongs]);

  const daily = useMemo(() => {
    const playable = songs.filter((song) => song.file_uri);
    const picked = pickDailySongs(playable, DAILY_SIZE, daySeed());
    return {
      songs: picked,
      tracks: picked.map((song) => songToMixTrack(song)),
    };
  }, [songs]);

  const handleSelect = useCallback(
    (_mixTrack, index) => {
      const song = daily.songs[index];
      if (!song) return;
      // Re-expanding the paused track resumes it instead of restarting it.
      if (song.id === track?.id) {
        if (!playing) togglePlay();
        return;
      }
      playSongs(daily.songs, index);
    },
    [daily.songs, playSongs, playing, togglePlay, track?.id],
  );

  const handleCollapse = useCallback(() => {
    // Collapsing the card stops playback, like the library's expanded row.
    if (playing) togglePlay();
  }, [playing, togglePlay]);

  const getPosition = useCallback(() => playbackQueue.getCurrentPosition(), []);
  const handleSeek = useCallback((seconds) => seekTo(seconds), [seekTo]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.6}
          onPress={() => router.push("/library")}
          style={styles.headerButton}
        >
          <Sparkles
            size={20}
            color="#fbbf24"
            strokeWidth={2}
            style={{ marginRight: 8 }}
          />
          <Text
            style={[styles.title, { color: C.fg, fontFamily: "Quicksand_500Medium" }]}
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
          Updated daily
        </Text>
      </View>

      {daily.tracks.length > 0 ? (
        <MixSongList
          tracks={daily.tracks}
          initialIndex={initialIndex}
          isScreenActive={isScreenActive}
          playingId={track?.id ?? null}
          onSelectTrack={handleSelect}
          onCollapseTrack={handleCollapse}
          onSeekTrack={handleSeek}
          getPosition={getPosition}
          onViewDetails={onViewDetails}
        />
      ) : loading ? null : (
        <View style={styles.emptyCard}>
          <Text style={[styles.emptyText, { color: "#8a8a94" }]}>
            Your daily mix fills up once songs are in your library.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: "100%" },
  header: {
    marginBottom: 20,
    marginLeft: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerButton: { flexDirection: "row", alignItems: "center" },
  title: {
    fontSize: 30,
    fontWeight: "500",
    textTransform: "capitalize",
    letterSpacing: 2,
  },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  emptyText: { fontSize: 14 },
});
