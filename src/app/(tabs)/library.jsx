import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Platform,
  Image,
  Animated,
  Easing,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useIsFocused } from "expo-router";
import {
  Search,
  Grid,
  List,
  Play,
  Pause,
  Shuffle,
  Check,
  MoreVertical,
  ArrowLeft,
  Music,
  Trash2,
  Share2,
  Info,
} from "lucide-react-native";
import { Ionicons } from "@expo/vector-icons";

import { HEADER_CONTENT } from "../../constants/headerContent";
import MusicHeader from "../../components/subComponents/MusicHeader";
import { useSongs } from "../../hooks/useSongs.js";
import { getSavedMusicFolder } from "../../services/musicFolder.js";
import { useHideTabBarOnScroll } from "../../components/ui/BottomBar";
import {
  getFilenameFromUri,
  looksLikeUri,
  parseMetadataFromFilename,
} from "../../services/folderScanner.js";
import { usePlayer } from "../../context/player-context";
import { playbackQueue } from "../../services/audio/PlaybackQueue";
import { MixSongItem, songToMixTrack } from "../../components/subComponents/MixSongList";
import { useSharedValue } from "react-native-reanimated";

/* ───────────── palette (was constants/design) ───────────── */
const C = {
  bg: "#0b0b0e",
  pill: "#1a1a20",
  tile: "#15151a",
  text: "#f4f4f6",
  textSoft: "rgba(244,244,246,0.72)",
  mut: "#8a8a94",
  lime: "#7ed957",
  limeBorder: "rgba(126,217,87,0.6)",
  // left → right wash used behind the active song row
  limeGlow: [
    "rgba(126,217,87,0.42)",
    "rgba(126,217,87,0.12)",
    "rgba(126,217,87,0)",
  ],
  on: "#0b0b0e",
};

/* ───────────── layout (copied from the Settings screen) ───────────── */
const BOTTOM_PAD = 140; // kept: clears the mini player dock
const TABLET_MIN = 768;
const TABLET_MAX_W = 840;

// Song durations: 1 if your DB stores seconds, 1000 if it stores milliseconds.
const DURATION_DIVISOR = 1;

const WORDMARK_FONT = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

function useLayout() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isTablet = width >= TABLET_MIN;
  const padX = Math.max(20, insets.left, insets.right); // 20 like Settings, clear of landscape notches

  return {
    insets,
    isTablet,
    padX,
    // list gutter: 20 on phones, centred 840 column (with 20 inside) on tablets
    sidePad: isTablet ? (width - TABLET_MAX_W) / 2 + padX : padX,
  };
}

/* ───────────── hardcoded collections (preserved) ───────────── */
const LIBRARY_ITEMS = [
  {
    id: 1,
    title: "Chill Sunset",
    by: "Waveform",
    songs: 8,
    cat: "Playlists",
    colors: ["#ea6f8e", "#a8325a", "#fff", "Chill", "#3a1d2e"],
  },
  {
    id: 2,
    title: "Neon Night Drive",
    by: "Waveform",
    songs: 10,
    cat: "Playlists",
    colors: ["#6a4fd8", "#2a1d6e", "#fff", "Neon", "#1a1240"],
  },
  {
    id: 3,
    title: "Golden Hour Pop",
    by: "Waveform",
    songs: 12,
    cat: "Playlists",
    colors: ["#f2b134", "#e0603a", "#fff", "Gold", "#2a1a0e"],
  },
  {
    id: 4,
    title: "Rainy Day Lo-fi",
    by: "Waveform",
    songs: 15,
    cat: "Playlists",
    colors: ["#7fa7d6", "#3c5f8f", "#fff", "Rain", "#1d3a5c"],
  },
  {
    id: 5,
    title: "Gym Power Mix",
    by: "Waveform",
    songs: 20,
    cat: "Playlists",
    colors: ["#6fd06f", "#2f8f4a", "#fff", "Gym", "#1d6e45"],
  },
  {
    id: 6,
    title: "Midnight Echoes",
    by: "Waveform",
    songs: 14,
    cat: "Playlists",
    colors: ["#6a4fd8", "#2a1d6e", "#fff", "Mid", "#1a1240"],
  },
  {
    id: 7,
    title: "Liked Songs",
    by: "You",
    songs: 42,
    cat: "Liked Songs",
    colors: ["#ec6f8e", "#8e2a55", "#fff", "Like", "#3a1422"],
  },
  {
    id: 8,
    title: "Downloaded",
    by: "Device",
    songs: 19,
    cat: "Downloads",
    colors: ["#3cc0b8", "#0e6e66", "#fff", "Down", "#0a3a36"],
  },
];

const CATS = ["All", "Playlists", "Liked Songs", "Downloads"];
const SORTS = ["Recently added", "A–Z", "Most songs"];

/* ───────────── song → display helpers (UI only) ───────────── */

// 214 → "3:34"
function formatDuration(value) {
  let total = Number(value);
  if (!Number.isFinite(total) || total <= 0) return "--:--";
  // If stored in milliseconds (e.g. > 10000 ms), convert to seconds
  if (total > 10000) {
    total = Math.round(total / 1000);
  }
  const mins = Math.floor(total / 60);
  const secs = String(total % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

// "m4a" / "/storage/.../song.m4a" → "m4a"
function getFormat(song) {
  // Prefer the real format stored in the DB (extracted from the audio
  // stream). Fall back to the file extension only when the stream format is
  // unavailable - the extension is a weaker signal but better than nothing.
  if (song.file_format) return song.file_format;
  const source =
    song.format ??
    song.extension ??
    song.path ??
    song.uri ??
    song.filename ??
    song.file_uri;
  const ext = String(source ?? "")
    .split("?")[0]
    .split(".")
    .pop()
    .toLowerCase();
  return ext && ext.length <= 5 ? ext.toUpperCase() : "";
}

function getArtwork(song) {
  // The DB column is `artwork_uri` (see song.SONG_FIELDS). Fall back to the
  // other field names other code paths might use, then null.
  return (
    song.artwork_uri ??
    song.artwork ??
    song.cover ??
    song.thumbnail ??
    song.albumArt ??
    null
  );
}

/* ───────────── building blocks ───────────── */

// Generates a simple avatar art for each library item from its color palette.
function AvatarArt({ colors }) {
  const [b1] = colors;

  return (
    <View
      className="flex-1 items-center justify-center overflow-hidden"
      style={{ backgroundColor: b1 }}
    >
      <Text
        textTransform="capitalize"
        className="text-xl font-bold"
        style={{ color: "white" }}
      >
        {colors[3]?.charAt(0) || "?"}
      </Text>
    </View>
  );
}

// One bouncing bar of the equaliser (native-driven, so it never blocks JS)
function EqBar({ delay, active }) {
  // Animated.Value must not be created in a ref read during render.
  const [scale] = useState(() => new Animated.Value(0.35));

  useEffect(() => {
    if (!active) {
      scale.setValue(0.35);
      return undefined;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1,
          duration: 420,
          delay,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.35,
          duration: 420,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();

    return () => loop.stop();
  }, [active, delay, scale]);

  return (
    <Animated.View
      className="h-4 w-[3px] rounded-sm"
      style={{ backgroundColor: C.lime, transform: [{ scaleY: scale }] }}
    />
  );
}

// Equaliser bars shown on currently playing item (frozen when paused)
function EqBars({ active = true }) {
  return (
    <View className="h-4 flex-row items-center gap-[3px]">
      {[0, 140, 280].map((delay) => (
        <EqBar key={delay} delay={delay} active={active} />
      ))}
    </View>
  );
}

const IconPlay = () => (
  <Play
    size={18}
    color={C.lime}
    fill={C.lime}
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

const IconPause = () => (
  <Pause
    size={18}
    color={C.on}
    fill={C.on}
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

const IconCheck = () => (
  <Check
    size={20}
    color={C.lime}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

const IconMore = () => (
  <MoreVertical
    size={20}
    color={C.mut}
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

const IconQueue = () => (
  <Play
    size={18}
    color={C.text}
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

const IconNext = () => (
  <Play
    size={18}
    color={C.text}
    fill={C.text}
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

const IconDelete = () => (
  <Trash2
    size={18}
    color="#ec6f8e"
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

const IconShare = () => (
  <Share2
    size={18}
    color={C.text}
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

const IconInfo = () => (
  <Info
    size={18}
    color={C.text}
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

const IconImage = () => (
  <Ionicons
    name="image-outline"
    size={18}
    color={C.text}
  />
);

const IconAdd = () => (
  <Music
    size={18}
    color={C.text}
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

/* ───────────── long-press context menu ───────────── */
function LongPressMenu({
  visible,
  item,
  onClose,
  onAddToPlaylist,
  onQueue,
  onPlayNext,
  onDelete,
  onShare,
  onInfo,
  onArtwork,
}) {
  if (!visible || !item) return null;

  const actions = [
    { key: "playlist", label: "Add to Playlist", icon: <IconAdd /> },
    { key: "queue", label: "Queue", icon: <IconQueue /> },
    { key: "next", label: "Play Next", icon: <IconNext /> },
    { key: "delete", label: "Delete", icon: <IconDelete /> },
    { key: "share", label: "Share", icon: <IconShare /> },
    { key: "info", label: "Info/Tags", icon: <IconInfo /> },
    { key: "artwork", label: "Album Art", icon: <IconImage /> },
  ];

  return (
    <View className="absolute inset-0 z-30 items-center justify-center bg-black/55">
      <View
        className="w-[86%] max-w-[360px] overflow-hidden rounded-3xl"
        style={{
          backgroundColor: C.pill,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
        }}
      >
        <View className="px-4 pb-2 pt-3">
          <Text
            numberOfLines={1}
            className="text-base font-semibold"
            style={{ color: C.text }}
          >
            {item.title}
          </Text>
          <Text
            numberOfLines={1}
            className="mt-0.5 text-xs"
            style={{ color: C.mut }}
          >
            {item.by}
          </Text>
        </View>

        {actions.map((a) => (
          <TouchableOpacity
            key={a.key}
            activeOpacity={0.7}
            className="flex-row items-center gap-3 px-4 py-[14px]"
            onPress={() => {
              onClose();
              switch (a.key) {
                case "playlist":
                  onAddToPlaylist?.();
                  break;
                case "queue":
                  onQueue?.();
                  break;
                case "next":
                  onPlayNext?.();
                  break;
                case "delete":
                  onDelete?.();
                  break;
                case "share":
                  onShare?.();
                  break;
                case "info":
                  onInfo?.();
                  break;
                case "artwork":
                  onArtwork?.();
                  break;
              }
            }}
          >
            {a.icon}
            <Text
              className={`text-sm ${
                a.key === "delete" ? "font-semibold" : "font-medium"
              }`}
              style={{ color: a.key === "delete" ? "#ec6f8e" : C.text }}
            >
              {a.label}
            </Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          className="items-center border-t border-white/5 py-3"
          onPress={onClose}
          activeOpacity={0.7}
        >
          <Text className="text-sm font-medium" style={{ color: C.mut }}>
            Cancel
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function LibraryScreen() {
  const { insets, sidePad } = useLayout();
  const router = useRouter();
  const isFocused = useIsFocused();

  const onScroll = useHideTabBarOnScroll();

  // Library states
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(0);
  const [gridView, setGridView] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [shuffled, setShuffled] = useState(false);
  const { playSongs, togglePlay, track, playing, seekTo } = usePlayer();
  const cur = track?.id;
  const mixPosition = useSharedValue(0);

  useEffect(() => {
    if (!isFocused) return;
    const syncPos = () => {
      mixPosition.value = Number(playbackQueue.getCurrentPosition?.()) || 0;
    };
    syncPos();
    const id = setInterval(syncPos, 250);
    return () => clearInterval(id);
  }, [isFocused, mixPosition]);

  // Long-press context menu state
  const [ctxItem, setCtxItem] = useState(null);

  // Album-art preview overlay (shown when user taps "Album Art" in the menu)
  const [artworkPreview, setArtworkPreview] = useState(null);

  const {
    songs: dbSongs,
    scanAndImport,
    scanning,
    scanResult,
    loading,
    refreshSongs,
  } = useSongs({
    search: filter === "All" ? query : "",
    sort,
  });

  // One-time auto import when library opens empty and a folder is already saved.
  useEffect(() => {
    if (!scanning && !scanResult && !loading && dbSongs.length === 0) {
      if (!getSavedMusicFolder()) return;
      scanAndImport();
    }
  }, [scanning, scanResult, loading, dbSongs.length, scanAndImport]);

  const repairStarted = useRef(false);
  useEffect(() => {
    if (loading || scanning || repairStarted.current || dbSongs.length === 0) return;
    const hasIncomplete = dbSongs.some(
      (s) =>
        !s.title ||
        looksLikeUri(s.title) ||
        !s.artist ||
        s.artist === "Unknown Artist" ||
        !s.duration ||
        s.duration <= 0 ||
        !s.artwork_uri
    );
    if (!hasIncomplete) return;
    repairStarted.current = true;
    import("../../services/musicImporter.js").then(
      async ({ repairLibraryMetadata, enrichExistingSongs }) => {
        try {
          const repaired = await repairLibraryMetadata();
          const enriched = await enrichExistingSongs({ batchSize: 8 });
          if ((repaired?.repaired || 0) + (enriched?.updated || 0) > 0) {
            refreshSongs();
          }
        } catch (error) {
          console.warn("Library metadata repair failed:", error);
        }
      },
    );
  }, [dbSongs, loading, scanning, refreshSongs]);

  // Keep the rest of your existing LibraryScreen code below this point.
  // Map real songs from SQLite into item-shaped objects for the "All" category.
  // Uses smart filename fallback when tags in the file are absent or generic.
  const libraryItems = useMemo(() => dbSongs.map((song) => {
    const isUnknownArtist = !song.artist || song.artist === "Unknown Artist" || song.artist === "Unknown";
    const isUnknownAlbum = !song.album || song.album === "Unknown Album" || song.album === "Unknown";
    const isBadTitle = !song.title || looksLikeUri(song.title);
    const parsed = (isUnknownArtist || isUnknownAlbum || isBadTitle)
      ? parseMetadataFromFilename(
          getFilenameFromUri(song.file_uri) || song.title,
          song.file_uri,
        )
      : null;

    const displayTitle = isBadTitle
      ? (parsed?.title || getFilenameFromUri(song.file_uri) || "Unknown Title")
      : song.title;
    const displayArtist = isUnknownArtist
      ? (parsed?.artist || "Unknown Artist")
      : song.artist;
    const displayAlbum = isUnknownAlbum
      ? (parsed?.album || null)
      : song.album;

    return {
      id: song.id,
      title: displayTitle,
      by: displayArtist,
      songs: 1,
      cat: "All",
      colors: [
        C.lime,
        "#0b0b0e",
        "#fff",
        displayTitle?.charAt(0) || "?",
        "#1a1a2e",
      ],
      // display-only fields consumed by <SongRow />
      isSong: true,
      artwork: getArtwork(song),
      album: displayAlbum && displayAlbum !== "Unknown Album" ? displayAlbum : null,
      duration: formatDuration(song.duration),
      format: getFormat(song),
      // Raw record so Info/Tags can read every field without re-querying.
      song,
    };
  }), [dbSongs]);

  const collectionItems =
    filter === "All" ? [] : LIBRARY_ITEMS.filter((item) => item.cat === filter);

  const items = filter === "All" ? libraryItems : collectionItems;

  const filtered =
    filter === "All"
      ? items
      : items
          .filter((item) =>
            (item.title + " " + item.by)
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .sort((a, b) =>
            sort === 0
              ? b.id - a.id
              : sort === 1
                ? a.title.localeCompare(b.title)
                : b.songs - a.songs,
          );

  const play = useCallback((id) => {
    if (filter !== "All") return;
    const songIndex = dbSongs.findIndex((song) => song.id === id);
    if (songIndex < 0) return;
    if (track?.id === id) {
      togglePlay();
      return;
    }
    playSongs(dbSongs, songIndex);
  }, [filter, dbSongs, track?.id, togglePlay, playSongs]);

  const goArtists = () => router.push("/settings");

  /* everything above the list scrolls with it, like the Settings page */
  const header = (
    <View>
      {/* header row: back arrow · wordmark · more */}

      <MusicHeader {...HEADER_CONTENT.library} goArtists={goArtists} active={isFocused} />

      {/* chips (full-bleed scroller, gap 8, h-10, px-5, text-sm font-medium) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mt-3 grow-0"
        style={{ marginHorizontal: -sidePad }}
        contentContainerStyle={{ paddingHorizontal: sidePad, gap: 8 }}
      >
        {CATS.map((cat) => (
          <TouchableOpacity
            key={cat}
            onPress={() => setFilter(cat)}
            activeOpacity={0.75}
            className={`h-10 mt-4 ml-[2px] items-center justify-center rounded-full px-5 ${
              filter === cat ? "" : "bg-white/[0.07]"
            }`}
            style={filter === cat ? { backgroundColor: C.lime } : null}
          >
            <Text
              textTransform="capitalize"
              className="text-sm font-medium"
              style={{ color: filter === cat ? C.on : C.text , fontFamily:"Quicksand_500Medium" }}
            >
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View
      className="flex-1"
      style={{ backgroundColor: C.bg, paddingTop: insets.top }}
    >
      {/* ── list / grid (header scrolls with it) ── */}
      <FlatList
        key={gridView ? "grid" : "list"}
        data={filtered}
        extraData={cur}
        numColumns={gridView ? 2 : 1}
        keyExtractor={(x) => String(x.id)}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={{ paddingBottom: 16 }}
        bounces
        scrollEventThrottle={16}
        onScroll={onScroll}
        onScrollBeginDrag={() => setMenuOpen(false)}
        initialNumToRender={16}
        maxToRenderPerBatch={16}
        windowSize={11}
        removeClippedSubviews
        contentContainerStyle={{
          paddingHorizontal: sidePad,
          gap: filter === "All" ? 6 : 12, // song rows carry their own padding
          paddingBottom: BOTTOM_PAD,
        }}
        columnWrapperStyle={
          gridView ? { gap: 12, justifyContent: "space-between" } : undefined
        }
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => {
          const isCur = cur === item.id;
          const isPlaying = isCur && playing;
          const onPlay = () => play(item.id);

          if (gridView) {
            return (
              <GridItem
                item={item}
                cur={isCur}
                playing={isPlaying}
                onPlay={onPlay}
                isScreenActive={isFocused}
              />
            );
          }

          if (item.isSong) {
            return (
              <MixSongItem
                track={songToMixTrack(item.song, {
                  title: item.title,
                  artist: item.by,
                  artwork: item.artwork,
                  quality: item.format,
                })}
                index={index}
                firstMount={false}
                expanded={false}
                position={mixPosition}
                onSelect={() => play(item.id)}
                onSeek={(seconds) => seekTo(seconds)}
                onViewDetails={() => router.push("/player")}
                onLongPress={() => setCtxItem(item)}
                isScreenActive={isFocused}
              />
            );
          }

          return (
            <ListItem
              item={item}
              cur={isCur}
              playing={isPlaying}
              onPlay={onPlay}
              isScreenActive={isFocused}
            />
          );
        }}
      />

      {/* sort dropdown (sits under the "more" button) */}
      {menuOpen && (
        <View
          className="absolute z-20 min-w-[200px] rounded-3xl p-2"
          style={{
            top: insets.top + 60,
            right: sidePad,
            backgroundColor: C.pill,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 20 },
            shadowOpacity: 0.5,
            shadowRadius: 20,
            elevation: 20,
          }}
        >
          <Text
            textTransform="capitalize"
            className="mx-2.5 mb-1 mt-1.5 text-xs uppercase tracking-[1.54px]"
            style={{ color: C.mut }}
          >
            Sort by
          </Text>

          {SORTS.map((s, k) => (
            <TouchableOpacity
              key={s}
              className="flex-row items-center justify-between rounded-2xl px-2.5 py-[11px]"
              onPress={() => {
                setSort(k);
                setMenuOpen(false);
              }}
            >
              <Text
                textTransform="capitalize"
                className={`text-sm ${
                  sort === k ? "font-semibold" : "font-medium"
                }`}
                style={{ color: sort === k ? C.lime : C.text }}
              >
                {s}
              </Text>

              {sort === k && <IconCheck />}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Long-press context menu (renders above everything) */}
      <LongPressMenu
        visible={!!ctxItem}
        item={ctxItem}
        onClose={() => setCtxItem(null)}
        onAddToPlaylist={() => {}}
        onQueue={() => {}}
        onPlayNext={() => {}}
        onDelete={() => {}}
        onShare={() => {}}
        onInfo={() => {
          if (ctxItem && ctxItem.song) {
            router.push(`/song-info?id=${ctxItem.song.id}`);
          }
        }}
        onArtwork={() => {
          if (ctxItem && ctxItem.artwork) {
            setArtworkPreview(ctxItem.artwork);
          }
        }}
      />

      {/* ── album-art preview overlay ── */}
      {artworkPreview && (
        <View
          className="absolute inset-0 z-40 items-center justify-center bg-black/85"
          onPress={() => setArtworkPreview(null)}
        >
          <Image
            source={{ uri: artworkPreview }}
            resizeMode="contain"
            style={{ width: "90%", height: "90%" }}
          />
          <Text
            className="mt-4 text-sm"
            style={{ color: C.mut }}
          >
            Tap to close
          </Text>
        </View>
      )}

      {/* ── mini player dock ── */}
    </View>
  );
}

/* same as Settings' Row: 64px tile (rounded-2xl) · gap 12 · base/bold title · xs subtitle · 36px round button */
function ListItem({ item, cur, playing, onPlay, isScreenActive = true }) {
  return (
    <TouchableOpacity
      onPress={onPlay}
      activeOpacity={0.7}
      className="flex-row items-center"
    >
      <View className="mr-3 h-16 w-16 overflow-hidden rounded-2xl">
        <AvatarArt colors={item.colors} />

        {cur && (
          <View className="absolute inset-0 items-end justify-end bg-black/35 pb-2 pr-2">
            <EqBars active={playing && isScreenActive} />
          </View>
        )}
      </View>

      <View className="min-w-0 flex-1">
        <Text
          textTransform="capitalize"
          numberOfLines={1}
          className="text-base font-bold"
          style={{ color: cur ? C.lime : C.text }}
        >
          {item.title}
        </Text>

        <Text
          textTransform="capitalize"
          numberOfLines={1}
          className="mt-1 text-xs"
          style={{ color: C.mut }}
        >
          By {item.by} • {item.songs} Songs
        </Text>
      </View>

      <TouchableOpacity
        onPress={onPlay}
        activeOpacity={0.8}
        className={`h-9 w-9 items-center justify-center rounded-full ${
          cur && playing ? "" : "bg-white/[0.07]"
        }`}
        style={cur && playing ? { backgroundColor: C.lime } : null}
      >
        {cur && playing ? <IconPause /> : <IconPlay />}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function GridItem({ item, cur, playing, onPlay, isScreenActive = true }) {
  return (
    <View className="flex-1">
      <TouchableOpacity
        onPress={onPlay}
        activeOpacity={0.8}
        className="relative"
      >
        <View className="aspect-square w-full overflow-hidden rounded-3xl">
          <AvatarArt colors={item.colors} />

          {cur && (
            <View className="absolute inset-0 items-end justify-end bg-black/35 pb-3 pr-3">
              <EqBars active={playing && isScreenActive} />
            </View>
          )}
        </View>

        <TouchableOpacity
          onPress={onPlay}
          activeOpacity={0.8}
          className={`absolute bottom-3 right-3 h-9 w-9 items-center justify-center rounded-full ${
            cur && playing ? "" : "bg-white/40"
          }`}
          style={cur && playing ? { backgroundColor: C.lime } : null}
        >
          {cur && playing ? <IconPause /> : <IconPlay />}
        </TouchableOpacity>
      </TouchableOpacity>

      <View className="mt-3 pr-1">
        <Text
          textTransform="capitalize"
          numberOfLines={1}
          className="text-base font-bold"
          style={{ color: cur ? C.lime : C.text }}
        >
          {item.title}
        </Text>

        <Text
          textTransform="capitalize"
          numberOfLines={1}
          className="mt-1 text-xs"
          style={{ color: C.mut }}
        >
          By {item.by} • {item.songs} Songs
        </Text>
      </View>
    </View>
  );
}