import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Platform,
  Image,
  Animated,
  Easing,
  useWindowDimensions,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useIsFocused } from "expo-router";
import {
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
import { getSetting } from "../../databases/queries/settings.js";
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
const TABLET_MIN = 768;
const TABLET_MAX_W = 840;

// Song durations: 1 if your DB stores seconds, 1000 if it stores milliseconds.
const DURATION_DIVISOR = 1;

// Minimum gap between two folder listings. Tab switches must not re-walk the
// tree on every focus.
const FOLDER_SYNC_INTERVAL_MS = 60000;

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

/* ───────────── sort options ───────────── */
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
      style={[styles.avatarWrap, { backgroundColor: b1 }]}
    >
      <Text
        textTransform="capitalize"
        style={[styles.avatarInitial, { color: "white" }]}
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
      style={[styles.eqBar, { backgroundColor: C.lime, transform: [{ scaleY: scale }] }]}
    />
  );
}

// Equaliser bars shown on currently playing item (frozen when paused)
function EqBars({ active = true }) {
  return (
    <View style={styles.eqBars}>
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
    <View style={styles.menuOverlay}>
      <View
        style={[
          styles.menuSheet,
          {
            backgroundColor: C.pill,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
          },
        ]}
      >
        <View style={styles.menuHeader}>
          <Text
            numberOfLines={1}
            style={[styles.menuTitle, { color: C.text }]}
          >
            {item.title}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.menuSub, { color: C.mut }]}
          >
            {item.by}
          </Text>
        </View>

        {actions.map((a) => (
          <TouchableOpacity
            key={a.key}
            activeOpacity={0.7}
            style={styles.menuAction}
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
              style={[
                styles.menuActionText,
                a.key === "delete" ? styles.fw600 : styles.fw500,
                { color: a.key === "delete" ? "#ec6f8e" : C.text },
              ]}
            >
              {a.label}
            </Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={styles.menuCancel}
          onPress={onClose}
          activeOpacity={0.7}
        >
          <Text style={[styles.menuCancelText, { color: C.mut }]}>
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

  // Library states
  const [sort, setSort] = useState(0);
  const [gridView, setGridView] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [shuffled, setShuffled] = useState(false);
  const { playSongs, togglePlay, track, playing, seekTo } = usePlayer();
  const cur = track?.id;
  const mixPosition = useSharedValue(0);
  const [expandedId, setExpandedId] = useState(null);

  // Only the expanded card reads the position; when nothing is expanded (or
  // playback is paused) the 4Hz JS timer is pure waste. One sync still runs on
  // expand/pause so the beam lands on the real position.
  useEffect(() => {
    if (!isFocused || expandedId == null) return undefined;
    const syncPos = () => {
      mixPosition.value = Number(playbackQueue.getCurrentPosition?.()) || 0;
    };
    syncPos();
    if (!playing) return undefined;
    const id = setInterval(syncPos, 250);
    return () => clearInterval(id);
  }, [isFocused, expandedId, playing, mixPosition]);

  // Long-press context menu state
  const [ctxItem, setCtxItem] = useState(null);

  // Album-art preview overlay (shown when user taps "Album Art" in the menu)
  const [artworkPreview, setArtworkPreview] = useState(null);

  const {
    songs: dbSongs,
    scanAndImport,
    syncLibrary,
    scanning,
    loading,
    refreshSongs,
    totalSongs,
  } = useSongs({ sort });

  // Inactive tabs are frozen (see (tabs)/_layout), so rows imported while the
  // screen was blurred never reach the list. Re-read SQLite on focus, deferred
  // one tick so the tab switch paints before the synchronous query runs.
  useEffect(() => {
    if (!isFocused) return undefined;
    const id = setTimeout(() => refreshSongs(), 0);
    return () => clearTimeout(id);
  }, [isFocused, refreshSongs]);

  // The importer commits each song individually, but scanAndImport only
  // refreshes once the whole folder is done - which can take minutes for a
  // large library. Poll so rows appear while the scan is still running.
  useEffect(() => {
    if (!scanning) return undefined;
    const id = setInterval(() => refreshSongs(), 3000);
    return () => clearInterval(id);
  }, [scanning, refreshSongs]);

  // Import the saved folder until it has been fully scanned. The importer
  // writes a completion marker per folder URI *only* when every discovered
  // file imported cleanly, so an incomplete import is retried the next time
  // this tab is shown instead of leaving a permanently partial library.
  // Tracking the URI (not a boolean) lets a mid-session folder change re-run.
  const autoScanUri = useRef(null);
  const lastSyncAt = useRef(0);
  useEffect(() => {
    if (!isFocused) {
      // Re-arm on blur so a folder that did not finish importing is retried on
      // the next visit. Blur is the only place the guard is cleared, which
      // stops the effect from re-scanning in a loop while the tab stays
      // focused.
      autoScanUri.current = null;
      return;
    }
    if (scanning) return;
    const folder = getSavedMusicFolder();
    if (!folder) return;

    // Always refresh when the scan settles, even if the import threw partway:
    // songs inserted before the failure must still show up.
    const runScan = (task) => {
      task()
        .catch(() => {})
        .finally(() => refreshSongs());
    };

    if (getSetting("music_folder_scan_complete") === folder.uri) {
      // The folder was fully imported at least once, but anything added since
      // is still missing. Diff the directory listing against SQLite instead of
      // assuming the library is complete. Throttled because this effect re-runs
      // when `scanning` flips off, which would otherwise sync in a loop.
      if (Date.now() - lastSyncAt.current < FOLDER_SYNC_INTERVAL_MS) return;
      lastSyncAt.current = Date.now();
      runScan(syncLibrary);
      return;
    }

    if (autoScanUri.current === folder.uri) return;
    autoScanUri.current = folder.uri;
    runScan(scanAndImport);
  }, [isFocused, scanning, scanAndImport, syncLibrary, refreshSongs]);

  const repairStarted = useRef(false);
  useEffect(() => {
    // Skip until the first read has landed: the repair pass walks the whole
    // table, so one loaded library is enough to decide whether rows need it.
    if (loading || scanning || repairStarted.current || totalSongs === 0) return;
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
  }, [dbSongs, loading, scanning, refreshSongs, totalSongs]);

  // Map real songs from SQLite into the row shape the list renders.
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

    const artwork = getArtwork(song);
    const format = getFormat(song);

    return {
      id: song.id,
      title: displayTitle,
      by: displayArtist,
      songs: 1,
      colors: [
        C.lime,
        "#0b0b0e",
        "#fff",
        displayTitle?.charAt(0) || "?",
        "#1a1a2e",
      ],
      // display-only fields consumed by <SongRow />
      isSong: true,
      artwork,
      album: displayAlbum && displayAlbum !== "Unknown Album" ? displayAlbum : null,
      duration: formatDuration(song.duration),
      format,
      // Raw record so Info/Tags can read every field without re-querying.
      song,
      // Built once per fetch, not once per render: a fresh object on every
      // render defeats MixSongItem's memo and re-renders every visible row on
      // each tap/state change.
      mixTrack: songToMixTrack(song, {
        title: displayTitle,
        artist: displayArtist,
        artwork,
        quality: format,
      }),
    };
  }), [dbSongs]);

  // `useSongs` already applies the sort in SQL and keeps the array identity
  // between identical refreshes, so the FlatList data prop stays stable.
  const filtered = libraryItems;

  const play = useCallback((id) => {
    if (expandedId === id) {
      setExpandedId(null);
      if (playing) togglePlay();
      return;
    }
    // The tapped song loads from 0; reset the beam before the card mounts so
    // its first frame doesn't show the previous track's position.
    // eslint-disable-next-line react-hooks/immutability
    mixPosition.value = 0;
    setExpandedId(id);
    // The queue spans the whole library in the current order.
    const songIndex = dbSongs.findIndex((song) => song.id === id);
    if (songIndex < 0) return;
    playSongs(dbSongs, songIndex);
  }, [expandedId, playing, togglePlay, playSongs, mixPosition, dbSongs]);

  // Stable row handlers: inline arrows are a new function on every render, which
  // makes MixSongItem's memo re-render the whole visible list on any state
  // change (tap, playback status, poll refresh). Resolve the row from a ref
  // instead so these stay dependency-free.
  const filteredRef = useRef(filtered);
  const playRef = useRef(play);
  useEffect(() => {
    filteredRef.current = filtered;
    playRef.current = play;
  }, [filtered, play]);

  const handleSongSelect = useCallback((index) => {
    const row = filteredRef.current[index];
    if (row?.isSong) playRef.current(row.id);
  }, []);

  const handleSongLongPress = useCallback((track) => {
    if (!track) return;
    const row = filteredRef.current.find(
      (entry) => entry.isSong && entry.id === track.id,
    );
    if (row) setCtxItem(row);
  }, []);

  const openPlayer = useCallback(() => router.push("/Player"), [router]);
  const openSearch = useCallback(() => router.push("/search"), [router]);

  const goArtists = useCallback(() => router.push("/settings"), [router]);

  /* everything above the list scrolls with it, like the Settings page */
  // Memoized so playback/expansion state changes don't rebuild the header.
  const header = useMemo(
    () => (
      <View>
        {/* header row: back arrow · wordmark · more */}

        <MusicHeader
          {...HEADER_CONTENT.library}
          goArtists={goArtists}
          onSearchPress={openSearch}
          searchPlaceholder="Search songs, albums, artists"
          active={isFocused}
        />
      </View>
    ),
    [goArtists, isFocused, openSearch],
  );

  const listContentStyle = useMemo(
    () => ({
      paddingHorizontal: sidePad,
      gap: 6,
      paddingBottom: Math.max(insets.bottom, 16) + 56,
    }),
    [sidePad, insets.bottom],
  );

  const keyExtractor = useCallback((x) => String(x.id), []);

  const hideSortMenu = useCallback(() => setMenuOpen(false), []);

  // Two separate renderers: song rows don't care about `cur`/`playing`, so
  // letting playback state change their renderer identity would needlessly
  // re-render every visible cell on play/pause.
  const renderSongRow = useCallback(
    ({ item, index }) => (
      <MixSongItem
        track={item.mixTrack}
        index={index}
        firstMount={false}
        expanded={expandedId === item.id}
        position={mixPosition}
        onSelect={handleSongSelect}
        onSeek={seekTo}
        onViewDetails={openPlayer}
        onLongPress={handleSongLongPress}
        isScreenActive={isFocused}
        animateRise={false}
      />
    ),
    [
      expandedId,
      handleSongLongPress,
      handleSongSelect,
      isFocused,
      mixPosition,
      openPlayer,
      seekTo,
    ],
  );

  const renderTile = useCallback(
    ({ item }) => {
      if (gridView) {
        return (
          <GridItem
            item={item}
            cur={cur === item.id}
            playing={cur === item.id && playing}
            onPlay={() => play(item.id)}
            isScreenActive={isFocused}
          />
        );
      }

      return (
        <ListItem
          item={item}
          cur={cur === item.id}
          playing={cur === item.id && playing}
          onPlay={() => play(item.id)}
          isScreenActive={isFocused}
        />
      );
    },
    [cur, gridView, isFocused, play, playing],
  );

  const renderItem = gridView ? renderTile : renderSongRow;

  // Song rows only depend on which row is expanded, so play/pause no longer
  // invalidates the whole list. Grid tiles still need `cur`/`playing`.
  const extraData = gridView
    ? `${expandedId}-${cur}-${playing}`
    : expandedId;

  return (
    <View
      style={[styles.screen, { backgroundColor: C.bg, paddingTop: insets.top }]}
    >
      {/* ── list / grid (header scrolls with it) ── */}
      <FlatList
        key={gridView ? "grid" : "list"}
        data={filtered}
        extraData={extraData}
        numColumns={gridView ? 2 : 1}
        keyExtractor={keyExtractor}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={{ paddingBottom: 16 }}
        bounces
        onScrollBeginDrag={hideSortMenu}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={listContentStyle}
        columnWrapperStyle={
          gridView ? { gap: 12, justifyContent: "space-between" } : undefined
        }
        showsVerticalScrollIndicator={false}
        renderItem={renderItem}
      />

      <View
        pointerEvents="none"
        style={[
          styles.songCountBadge,
          { bottom: Math.max(insets.bottom, 12) + 8, right: sidePad },
        ]}
      >
        <Text style={styles.songCountText}>
          {totalSongs} {totalSongs === 1 ? "song" : "songs"}
        </Text>
      </View>

      {/* sort dropdown (sits under the "more" button) */}
      {menuOpen && (
        <View
          style={[
            styles.sortMenu,
            {
              top: insets.top + 60,
              right: sidePad,
              backgroundColor: C.pill,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 20 },
              shadowOpacity: 0.5,
              shadowRadius: 20,
              elevation: 20,
            },
          ]}
        >
          <Text
            textTransform="capitalize"
            style={[styles.sortLabel, { color: C.mut }]}
          >
            Sort by
          </Text>

          {SORTS.map((s, k) => (
            <TouchableOpacity
              key={s}
              style={styles.sortRow}
              onPress={() => {
                setSort(k);
                setMenuOpen(false);
              }}
            >
              <Text
                textTransform="capitalize"
                style={[
                  styles.sortText,
                  sort === k ? styles.fw600 : styles.fw500,
                  { color: sort === k ? C.lime : C.text },
                ]}
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
          style={styles.artPreview}
          onPress={() => setArtworkPreview(null)}
        >
          <Image
            source={{ uri: artworkPreview }}
            resizeMode="contain"
            style={{ width: "90%", height: "90%" }}
          />
          <Text
            style={[styles.artPreviewHint, { color: C.mut }]}
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
      style={styles.listRow}
    >
      <View style={styles.tile}>
        <AvatarArt colors={item.colors} />

        {cur && (
          <View style={styles.tileOverlay}>
            <EqBars active={playing && isScreenActive} />
          </View>
        )}
      </View>

      <View style={styles.flexCol}>
        <Text
          textTransform="capitalize"
          numberOfLines={1}
          style={[styles.rowTitle, { color: cur ? C.lime : C.text }]}
        >
          {item.title}
        </Text>

        <Text
          textTransform="capitalize"
          numberOfLines={1}
          style={[styles.rowSub, { color: C.mut }]}
        >
          By {item.by} • {item.songs} Songs
        </Text>
      </View>

      <TouchableOpacity
        onPress={onPlay}
        activeOpacity={0.8}
        style={[
          styles.playBtn,
          cur && playing ? null : styles.playBtnIdle,
          cur && playing ? { backgroundColor: C.lime } : null,
        ]}
      >
        {cur && playing ? <IconPause /> : <IconPlay />}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function GridItem({ item, cur, playing, onPlay, isScreenActive = true }) {
  return (
    <View style={styles.flex1}>
      <TouchableOpacity
        onPress={onPlay}
        activeOpacity={0.8}
        style={styles.relative}
      >
        <View style={styles.gridTile}>
          <AvatarArt colors={item.colors} />

          {cur && (
            <View style={styles.gridOverlay}>
              <EqBars active={playing && isScreenActive} />
            </View>
          )}
        </View>

        <TouchableOpacity
          onPress={onPlay}
          activeOpacity={0.8}
          style={[
            styles.gridPlayBtn,
            cur && playing ? null : styles.gridPlayBtnIdle,
            cur && playing ? { backgroundColor: C.lime } : null,
          ]}
        >
          {cur && playing ? <IconPause /> : <IconPlay />}
        </TouchableOpacity>
      </TouchableOpacity>

      <View style={styles.gridMeta}>
        <Text
          textTransform="capitalize"
          numberOfLines={1}
          style={[styles.rowTitle, { color: cur ? C.lime : C.text }]}
        >
          {item.title}
        </Text>

        <Text
          textTransform="capitalize"
          numberOfLines={1}
          style={[styles.rowSub, { color: C.mut }]}
        >
          By {item.by} • {item.songs} Songs
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* avatar tile */
  avatarWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarInitial: { fontSize: 20, fontWeight: "700" },
  /* equaliser */
  eqBar: { height: 16, width: 3, borderRadius: 2 },
  eqBars: { height: 16, flexDirection: "row", alignItems: "center", gap: 3 },
  /* context menu */
  menuOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  menuSheet: { width: "86%", maxWidth: 360, overflow: "hidden", borderRadius: 24 },
  menuHeader: { paddingHorizontal: 16, paddingBottom: 8, paddingTop: 12 },
  menuTitle: { fontSize: 16, fontWeight: "600" },
  menuSub: { marginTop: 2, fontSize: 12 },
  menuAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuActionText: { fontSize: 14 },
  fw600: { fontWeight: "600" },
  fw500: { fontWeight: "500" },
  menuCancel: {
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    paddingVertical: 12,
  },
  menuCancelText: { fontSize: 14, fontWeight: "500" },
  /* screen */
  screen: { flex: 1 },
  songCountBadge: {
    position: "absolute",
    zIndex: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(26,26,32,0.94)",
  },
  songCountText: {
    color: C.textSoft,
    fontFamily: WORDMARK_FONT,
    fontSize: 11,
  },
  /* sort dropdown */
  sortMenu: {
    position: "absolute",
    zIndex: 20,
    minWidth: 200,
    borderRadius: 24,
    padding: 8,
  },
  sortLabel: {
    marginHorizontal: 10,
    marginBottom: 4,
    marginTop: 6,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.54,
  },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 11,
  },
  sortText: { fontSize: 14 },
  /* album-art preview */
  artPreview: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.85)",
  },
  artPreviewHint: { marginTop: 16, fontSize: 14 },
  /* list row */
  listRow: { flexDirection: "row", alignItems: "center" },
  tile: {
    marginRight: 12,
    height: 64,
    width: 64,
    overflow: "hidden",
    borderRadius: 16,
  },
  tileOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "flex-end",
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingBottom: 8,
    paddingRight: 8,
  },
  flexCol: { minWidth: 0, flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: "700" },
  rowSub: { marginTop: 4, fontSize: 12 },
  playBtn: {
    height: 36,
    width: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9999,
  },
  playBtnIdle: { backgroundColor: "rgba(255,255,255,0.07)" },
  /* grid tile */
  flex1: { flex: 1 },
  relative: { position: "relative" },
  gridTile: {
    aspectRatio: 1,
    width: "100%",
    overflow: "hidden",
    borderRadius: 24,
  },
  gridOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "flex-end",
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingBottom: 12,
    paddingRight: 12,
  },
  gridPlayBtn: {
    position: "absolute",
    bottom: 12,
    right: 12,
    height: 36,
    width: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9999,
  },
  gridPlayBtnIdle: { backgroundColor: "rgba(255,255,255,0.4)" },
  gridMeta: { marginTop: 12, paddingRight: 4 },
});
