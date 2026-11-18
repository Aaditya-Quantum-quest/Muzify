import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  FlatList,
  Image,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Clock, Disc, ListMusic, Music, Pause, Play, Search, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useSongs } from '../hooks/useSongs.js';
import { usePlayer } from '../context/player-context';
import { playbackQueue } from '../services/audio/PlaybackQueue';
import { getMixSongs, getPlaylists } from '../databases/queries/mix';

/*
  Search screen (flat AMOLED look, matches the Artists screen).

  Searches the local library: songs, albums, artists and playlists (albums /
  artists are grouped from the song rows, playlists are the genre / artist
  playlists the home screen already builds). Needs @expo-google-fonts/inter
  loaded in the root layout.

  Performance:
  - `visible` = screen focused + app foregrounded + `active` prop. Results are
    only computed, timers only run and the keyboard is only open while visible.
  - The search index (normalized strings, artist / album groups) is built once
    per songs change, not per keystroke.
  - Typing state lives inside <SearchField>; the screen only hears a debounced
    query, so keystrokes never re-render the list.
  - Rows are memoized, styles are static StyleSheet objects, list is windowed.
*/

/* -------------------------------------------------------------------------- */
/* Tokens                                                                     */
/* -------------------------------------------------------------------------- */

// Flat AMOLED palette: pure black, hairline outlines, ONE amber accent.
const C = {
  bg: '#000000',
  title: '#F5F5F5',
  text: '#EDEDED',
  sub: '#8A8A8A',
  dim: '#7A7A7A',
  hair: '#1A1A1A', // row dividers
  outline: '#262626', // thumbs, back button
  ring: '#2A2A2A', // play button ring
  accent: '#FBBF24',
  accentRing: 'rgba(251,191,36,0.45)',
};

const F = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semi: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
};

const TABS = [
  { key: 'all', label: 'ALL' },
  { key: 'songs', label: 'SONGS' },
  { key: 'albums', label: 'ALBUMS' },
  { key: 'artists', label: 'ARTISTS' },
  { key: 'playlists', label: 'PLAYLISTS' },
];

const DEBOUNCE_MS = 200;
const MAX_PER_SECTION = 60;
const MAX_RECENTS = 6;
const HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 };

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 20 },
  header: { marginTop: 24 },
  label: { fontFamily: F.medium, fontSize: 11, letterSpacing: 2.2, color: C.sub },
  title: {
    marginTop: 8,
    fontFamily: F.bold,
    fontSize: 52,
    lineHeight: 55,
    letterSpacing: -1.6,
    color: C.title,
  },
  subtitle: { marginTop: 10, fontFamily: F.regular, fontSize: 13, color: C.sub },
  back: {
    position: 'absolute',
    right: 0,
    top: 4,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },

  field: {
    marginTop: 26,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
  },
  input: { flex: 1, minWidth: 0, paddingVertical: 0, fontFamily: F.regular, fontSize: 16, color: C.text },
  clear: { width: 44, height: 44, marginRight: -12, alignItems: 'center', justifyContent: 'center' },

  tabs: { marginTop: 12, flexDirection: 'row', gap: 24 },
  tab: { paddingVertical: 12, borderBottomWidth: 2 },
  tabText: { fontFamily: F.semi, fontSize: 11, letterSpacing: 1.76 },

  listContent: { paddingTop: 2 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: {
    marginTop: 18,
    marginBottom: 4,
    fontFamily: F.semi,
    fontSize: 11,
    letterSpacing: 1.98,
    color: C.accent,
  },
  sectionAction: { fontFamily: F.semi, fontSize: 11, letterSpacing: 1.1, color: C.dim },

  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 9 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.hair },
  thumb: {
    width: 52,
    height: 52,
    borderWidth: 1,
    borderColor: C.outline,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImg: { width: 52, height: 52 },
  initials: { fontFamily: F.medium, fontSize: 15, letterSpacing: 0.75, color: '#A3A3A3' },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: F.medium, fontSize: 18, color: C.title },
  rowSub: { marginTop: 2, fontFamily: F.regular, fontSize: 13, color: C.sub },
  playHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  playRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: C.ring,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playRingOn: { borderColor: C.accentRing },

  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52 },
  recentText: { flex: 1, fontFamily: F.regular, fontSize: 16, color: C.text },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 80 },
  emptyTitle: { fontFamily: F.semi, fontSize: 17, color: C.title },
  emptyBody: {
    marginTop: 6,
    fontFamily: F.regular,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    color: C.sub,
  },
});

/* -------------------------------------------------------------------------- */
/* Visibility gate: focused + app foregrounded + `active` prop                */
/* -------------------------------------------------------------------------- */

function useIsVisible(active) {
  const focused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => setAppActive(st === 'active'));
    return () => sub.remove();
  }, []);

  return active && focused && appActive;
}

/* -------------------------------------------------------------------------- */
/* Search helpers (module scope)                                              */
/* -------------------------------------------------------------------------- */

const norm = (v) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const initialsOf = (name) => {
  const parts = String(name || '?').trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?';
};

// Builds everything search needs once per songs change.
function buildIndex(songs) {
  const playable = songs.filter((song) => song.file_uri);
  const songEntries = playable.map((song) => ({
    song,
    name: norm(song.title),
    hay: norm(`${song.title} ${song.artist} ${song.album}`),
  }));

  const artistMap = new Map();
  const albumMap = new Map();
  for (const song of playable) {
    const artist = song.artist || 'Unknown artist';
    let a = artistMap.get(artist);
    if (!a) {
      a = { name: artist, key: norm(artist), songs: [], ids: new Set() };
      artistMap.set(artist, a);
    }
    a.songs.push(song);
    a.ids.add(song.id);

    if (song.album) {
      const albumKey = `${song.album}\u0000${artist}`;
      let b = albumMap.get(albumKey);
      if (!b) {
        b = {
          name: song.album,
          artist,
          key: norm(`${song.album} ${artist}`),
          nameKey: norm(song.album),
          art: song.artwork_uri || null,
          songs: [],
          ids: new Set(),
        };
        albumMap.set(albumKey, b);
      }
      if (!b.art && song.artwork_uri) b.art = song.artwork_uri;
      b.songs.push(song);
      b.ids.add(song.id);
    }
  }

  return {
    songs: songEntries,
    artists: [...artistMap.values()],
    albums: [...albumMap.values()],
    playlists: getPlaylists(500),
    songCount: playable.length,
  };
}

const EMPTY_RESULTS = { songs: [], artists: [], albums: [], playlists: [], total: 0 };

// Every query word must appear; names that start with the first word rank first.
function runSearch(index, query) {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return EMPTY_RESULTS;

  const matches = (hay) => {
    for (let i = 0; i < tokens.length; i += 1) if (!hay.includes(tokens[i])) return false;
    return true;
  };
  const rank = (name) => (name.startsWith(tokens[0]) ? 0 : name.includes(` ${tokens[0]}`) ? 1 : 2);
  const pick = (list, hayOf, nameOf) => {
    const hits = [];
    for (let i = 0; i < list.length && hits.length < MAX_PER_SECTION * 3; i += 1) {
      if (matches(hayOf(list[i]))) hits.push(list[i]);
    }
    return hits
      .map((item, i) => ({ item, i, r: rank(nameOf(item)) }))
      .sort((x, y) => x.r - y.r || x.i - y.i)
      .slice(0, MAX_PER_SECTION)
      .map((x) => x.item);
  };

  const songs = pick(index.songs, (e) => e.hay, (e) => e.name).map((e) => e.song);
  const artists = pick(index.artists, (a) => a.key, (a) => a.key);
  const albums = pick(index.albums, (b) => b.key, (b) => b.nameKey);
  const playlists = pick(index.playlists, (p) => norm(p.title), (p) => norm(p.title));
  return {
    songs,
    artists,
    albums,
    playlists,
    total: songs.length + artists.length + albums.length + playlists.length,
  };
}

// Amber highlight ranges, only when normalizing kept string lengths intact.
function splitHighlight(text, tokens) {
  const lower = norm(text);
  if (!tokens.length || lower.length !== text.length) return null;
  const ranges = [];
  for (const t of tokens) {
    const at = lower.indexOf(t);
    if (at >= 0) ranges.push([at, at + t.length]);
  }
  if (!ranges.length) return null;
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [ranges[0]];
  for (let i = 1; i < ranges.length; i += 1) {
    const last = merged[merged.length - 1];
    if (ranges[i][0] <= last[1]) last[1] = Math.max(last[1], ranges[i][1]);
    else merged.push(ranges[i]);
  }
  const parts = [];
  let pos = 0;
  for (const [a, b] of merged) {
    if (a > pos) parts.push({ t: text.slice(pos, a), hit: false });
    parts.push({ t: text.slice(a, b), hit: true });
    pos = b;
  }
  if (pos < text.length) parts.push({ t: text.slice(pos), hit: false });
  return parts;
}

// Recent searches live for the session (module scope); persist them with
// AsyncStorage / SQLite if you want them across launches.
let RECENTS = [];

/* -------------------------------------------------------------------------- */
/* Search field                                                               */
/* -------------------------------------------------------------------------- */

const SearchField = memo(
  forwardRef(function SearchField({ onQuery }, ref) {
    const input = useRef(null);
    const timer = useRef(null);
    const [text, setText] = useState('');
    const [focused, setFocused] = useState(false);

    useEffect(() => () => clearTimeout(timer.current), []);

    const push = useCallback(
      (value, immediate) => {
        clearTimeout(timer.current);
        if (immediate) onQuery(value.trim());
        else timer.current = setTimeout(() => onQuery(value.trim()), DEBOUNCE_MS);
      },
      [onQuery],
    );

    const onChangeText = useCallback(
      (v) => {
        setText(v);
        push(v, false);
      },
      [push],
    );

    const clear = useCallback(() => {
      setText('');
      push('', true);
      input.current?.focus();
    }, [push]);

    useImperativeHandle(
      ref,
      () => ({
        setText: (v) => {
          setText(v);
          push(v, true);
        },
        focus: () => input.current?.focus(),
        blur: () => input.current?.blur(),
      }),
      [push],
    );

    const onFocus = useCallback(() => setFocused(true), []);
    const onBlur = useCallback(() => setFocused(false), []);
    const onSubmit = useCallback(() => push(text, true), [push, text]);

    return (
      <View style={[s.field, { borderBottomColor: focused ? C.text : C.outline }]}>
        <Search size={18} color={C.sub} strokeWidth={1.6} />
        <TextInput
          ref={input}
          value={text}
          style={s.input}
          placeholder="Search songs, albums, artists"
          placeholderTextColor={C.dim}
          selectionColor={C.accent}
          cursorColor={C.accent}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel="Search songs, albums, artists"
          maxFontSizeMultiplier={1.2}
          onChangeText={onChangeText}
          onFocus={onFocus}
          onBlur={onBlur}
          onSubmitEditing={onSubmit}
        />
        {text.length > 0 && (
          <Pressable
            onPress={clear}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            style={s.clear}
          >
            <X size={16} color={C.sub} strokeWidth={1.8} />
          </Pressable>
        )}
      </View>
    );
  }),
);

/* -------------------------------------------------------------------------- */
/* Tabs                                                                       */
/* -------------------------------------------------------------------------- */

const Tab = memo(function Tab({ tab, on, onPress }) {
  const handle = useCallback(() => onPress(tab.key), [onPress, tab.key]);
  return (
    <Pressable
      onPress={handle}
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      style={[s.tab, { borderBottomColor: on ? C.accent : 'transparent' }]}
    >
      <Text style={[s.tabText, { color: on ? C.title : C.dim }]}>{tab.label}</Text>
    </Pressable>
  );
});

/* -------------------------------------------------------------------------- */
/* Rows                                                                       */
/* -------------------------------------------------------------------------- */

const Highlighted = memo(function Highlighted({ text, tokens, style }) {
  const parts = useMemo(() => splitHighlight(text, tokens), [text, tokens]);
  if (!parts) {
    return (
      <Text numberOfLines={1} style={style}>
        {text}
      </Text>
    );
  }
  return (
    <Text numberOfLines={1} style={style}>
      {parts.map((p, i) =>
        p.hit ? (
          <Text key={i} style={{ color: C.accent }}>
            {p.t}
          </Text>
        ) : (
          p.t
        ),
      )}
    </Text>
  );
});

const Thumb = memo(function Thumb({ kind, uri, name, gradient }) {
  const radius = kind === 'artist' ? 26 : kind === 'song' ? 12 : 6;
  return (
    <View style={[s.thumb, { borderRadius: radius }]}>
      {kind === 'artist' ? (
        <Text style={s.initials}>{initialsOf(name)}</Text>
      ) : kind === 'playlist' ? (
        <LinearGradient
          colors={gradient ?? ['#3a3a3a', '#161616']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.thumbImg}
        >
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ListMusic size={22} color="rgba(255,255,255,0.9)" strokeWidth={1.6} />
          </View>
        </LinearGradient>
      ) : uri ? (
        <Image source={{ uri }} style={s.thumbImg} resizeMode="cover" fadeDuration={0} />
      ) : kind === 'song' ? (
        <Music size={22} color={C.dim} strokeWidth={1.6} />
      ) : (
        <Disc size={24} color={C.dim} strokeWidth={1.6} />
      )}
    </View>
  );
});

const ResultRow = memo(function ResultRow({ item, tokens, isPlaying, onPress, onPlay }) {
  const handlePress = useCallback(() => onPress(item), [onPress, item]);
  const handlePlay = useCallback(() => onPlay(item), [onPlay, item]);
  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${item.sub}`}
      style={[s.row, !item.last && s.rowDivider]}
    >
      <Thumb kind={item.kind} uri={item.art} name={item.title} gradient={item.gradient} />
      <View style={s.rowText}>
        <Highlighted text={item.title} tokens={tokens} style={s.rowTitle} />
        <Highlighted text={item.sub} tokens={tokens} style={s.rowSub} />
      </View>
      <Pressable
        onPress={handlePlay}
        hitSlop={HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={`${isPlaying ? 'Pause' : 'Play'} ${item.title}`}
        style={s.playHit}
      >
        <View style={[s.playRing, isPlaying && s.playRingOn]}>
          {isPlaying ? (
            <Pause size={12} color={C.accent} fill={C.accent} strokeWidth={0} />
          ) : (
            <Play size={12} color={C.text} fill={C.text} strokeWidth={0} />
          )}
        </View>
      </Pressable>
    </Pressable>
  );
});

const SectionLabel = memo(function SectionLabel({ label }) {
  return <Text style={s.section}>{label}</Text>;
});

const RecentsHeader = memo(function RecentsHeader({ onClear }) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.section}>RECENT</Text>
      <Pressable onPress={onClear} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel="Clear recent searches">
        <Text style={[s.sectionAction, { marginTop: 18 }]}>CLEAR</Text>
      </Pressable>
    </View>
  );
});

const RecentRow = memo(function RecentRow({ item, onPress }) {
  const handle = useCallback(() => onPress(item.text), [onPress, item.text]);
  return (
    <Pressable onPress={handle} accessibilityRole="button" style={[s.recentRow, !item.last && s.rowDivider]}>
      <Clock size={18} color={C.dim} strokeWidth={1.6} />
      <Text numberOfLines={1} style={s.recentText}>
        {item.text}
      </Text>
    </Pressable>
  );
});

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

const keyExtractor = (item) => item.id;
const noop = () => {};

export default function SearchScreen({ onBack, onOpenArtist = noop, active = true }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const visible = useIsVisible(active);

  const { songs, loading, refreshSongs } = useSongs();
  const { playSongs, togglePlay, track, playing } = usePlayer();

  const fieldRef = useRef(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('all');
  const [recents, setRecents] = useState(RECENTS);

  /* ---- keep the library fresh without work while hidden ---- */
  const activatedOnce = useRef(false);
  useEffect(() => {
    if (!visible) {
      fieldRef.current?.blur();
      Keyboard.dismiss();
      return undefined;
    }
    if (!activatedOnce.current) {
      activatedOnce.current = true;
      const focusId = setTimeout(() => fieldRef.current?.focus(), 250);
      return () => clearTimeout(focusId);
    }
    // Pick up imports made on other tabs; deferred so the screen paints first.
    const id = setTimeout(() => refreshSongs?.(), 0);
    return () => clearTimeout(id);
  }, [visible, refreshSongs]);

  /* ---- index + results (computed only while visible) ---- */
  const index = useMemo(() => buildIndex(songs || []), [songs]);

  const lastResults = useRef(EMPTY_RESULTS);
  const results = useMemo(() => {
    if (!visible) return lastResults.current; // hidden: reuse, do no work
    const next = runSearch(index, query);
    lastResults.current = next;
    return next;
  }, [visible, index, query]);

  const tokens = useMemo(() => norm(query).split(/\s+/).filter(Boolean), [query]);

  /* ---- list data ---- */
  const data = useMemo(() => {
    if (!query) {
      if (!recents.length) return [];
      return [
        { type: 'recentsHeader', id: 'rh' },
        ...recents.map((text, i) => ({
          type: 'recent',
          id: `r-${text}`,
          text,
          last: i === recents.length - 1,
        })),
      ];
    }

    const out = [];
    const showHeaders = tab === 'all';
    const songQueue = results.songs;

    if ((tab === 'all' || tab === 'artists') && results.artists.length) {
      if (showHeaders) out.push({ type: 'header', id: 'h-artists', label: 'ARTISTS' });
      results.artists.forEach((a, i) =>
        out.push({
          type: 'row',
          id: `a-${a.name}`,
          kind: 'artist',
          title: a.name,
          sub: plural(a.songs.length, 'song', 'songs'),
          art: null,
          ids: a.ids,
          queue: a.songs,
          start: 0,
          last: i === results.artists.length - 1,
        }),
      );
    }
    if ((tab === 'all' || tab === 'playlists') && results.playlists.length) {
      if (showHeaders) out.push({ type: 'header', id: 'h-playlists', label: 'PLAYLISTS' });
      results.playlists.forEach((p, i) =>
        out.push({
          type: 'row',
          id: `p-${p.id}`,
          kind: 'playlist',
          title: p.title,
          sub: plural(p.songs, 'song', 'songs'),
          art: null,
          gradient: p.gradient,
          mixId: p.id,
          last: i === results.playlists.length - 1,
        }),
      );
    }
    if ((tab === 'all' || tab === 'songs') && songQueue.length) {
      if (showHeaders) out.push({ type: 'header', id: 'h-songs', label: 'SONGS' });
      songQueue.forEach((song, i) =>
        out.push({
          type: 'row',
          id: `s-${song.id}`,
          kind: 'song',
          title: song.title || 'Untitled',
          sub: song.artist || 'Unknown artist',
          art: song.artwork_uri || null,
          songId: song.id,
          queue: songQueue,
          start: i,
          last: i === songQueue.length - 1,
        }),
      );
    }
    if ((tab === 'all' || tab === 'albums') && results.albums.length) {
      if (showHeaders) out.push({ type: 'header', id: 'h-albums', label: 'ALBUMS' });
      results.albums.forEach((b, i) =>
        out.push({
          type: 'row',
          id: `b-${b.name}-${b.artist}`,
          kind: 'album',
          title: b.name,
          sub: b.artist,
          art: b.art,
          ids: b.ids,
          queue: b.songs,
          start: 0,
          last: i === results.albums.length - 1,
        }),
      );
    }
    return out;
  }, [query, tab, results, recents]);

  /* ---- actions (read live player state through a ref: stable callbacks) ---- */
  const live = useRef({});
  live.current = { track, playing, togglePlay, playSongs, query, onOpenArtist, router };

  const rememberQuery = useCallback(() => {
    const q = live.current.query;
    if (q.length < 2) return;
    RECENTS = [q, ...RECENTS.filter((r) => r !== q)].slice(0, MAX_RECENTS);
    setRecents(RECENTS);
  }, []);

  const rowIsCurrent = (item, currentId) =>
    item.kind === 'song' ? item.songId === currentId : item.ids?.has(currentId);

  const handlePlay = useCallback(
    (item) => {
      const { track: t, togglePlay: toggle, playSongs: play } = live.current;
      rememberQuery();
      if (item.kind === 'playlist') {
        // Playlists key off the shared queue's mixSource, like the home cards.
        if (playbackQueue.mixSource === item.mixId && t) {
          toggle();
          return;
        }
        const rows = getMixSongs(item.mixId);
        if (!rows.length) return;
        play(rows, 0);
        // setQueue clears this, so it has to be set after the queue loads.
        playbackQueue.mixSource = item.mixId;
        return;
      }
      if (t?.id != null && rowIsCurrent(item, t.id)) {
        toggle();
        return;
      }
      play(item.queue, item.start);
    },
    [rememberQuery],
  );

  const handlePress = useCallback(
    (item) => {
      if (item.kind === 'playlist') {
        // Same contract as the home playlist cards: open the mix player.
        rememberQuery();
        live.current.router.push({
          pathname: '/MixedPlayer',
          params: { mixId: item.mixId },
        });
        return;
      }
      if (item.kind === 'artist' && live.current.onOpenArtist !== noop) {
        rememberQuery();
        live.current.onOpenArtist(item.title);
        return;
      }
      handlePlay(item);
    },
    [handlePlay, rememberQuery],
  );

  const useRecent = useCallback((text) => fieldRef.current?.setText(text), []);
  const clearRecents = useCallback(() => {
    RECENTS = [];
    setRecents(RECENTS);
  }, []);

  const goBack = useCallback(() => (onBack ? onBack() : router.back()), [onBack, router]);

  const playingKey = `${track?.id ?? ''}:${playing ? 1 : 0}`;

  const renderItem = useCallback(
    ({ item }) => {
      if (item.type === 'header') return <SectionLabel label={item.label} />;
      if (item.type === 'recentsHeader') return <RecentsHeader onClear={clearRecents} />;
      if (item.type === 'recent') return <RecentRow item={item} onPress={useRecent} />;
      const current = track?.id != null && rowIsCurrent(item, track.id);
      const playlistOn =
        item.kind === 'playlist' && playing && playbackQueue.mixSource === item.mixId;
      return (
        <ResultRow
          item={item}
          tokens={tokens}
          isPlaying={Boolean((current && playing) || playlistOn)}
          onPress={handlePress}
          onPlay={handlePlay}
        />
      );
    },
    // `playingKey` stands in for track + playing so rows refresh when playback changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tokens, handlePress, handlePlay, clearRecents, useRecent, playingKey],
  );

  /* ---- header copy ---- */
  const subtitle = !query
    ? loading && !index.songCount
      ? 'Loading your library'
      : index.songCount
        ? `Search across ${plural(index.songCount, 'song', 'songs')}, ${plural(index.artists.length, 'artist', 'artists')} and ${plural(index.playlists.length, 'playlist', 'playlists')}`
        : 'Your library is empty'
    : results.total
      ? `${plural(results.total, 'result', 'results')} for “${query}”`
      : `No results for “${query}”`;

  const screenStyle = useMemo(
    () => [s.screen, { paddingTop: insets.top }],
    [insets.top],
  );
  const listStyle = useMemo(
    () => ({ paddingBottom: insets.bottom + 24 }),
    [insets.bottom],
  );

  const showEmpty = Boolean(query) && results.total === 0;
  const showIdleHint = !query && !recents.length;

  return (
    <View style={screenStyle}>
      <View style={s.header}>
        <Text style={s.label}>LIBRARY</Text>
        <Text style={s.title} numberOfLines={1} adjustsFontSizeToFit>
          Search
        </Text>
        <Text style={s.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={s.back}
        >
          <ChevronLeft size={18} color={C.text} strokeWidth={1.8} />
        </Pressable>
      </View>

      <SearchField ref={fieldRef} onQuery={setQuery} />

      <View style={s.tabs} accessibilityRole="tablist">
        {TABS.map((t) => (
          <Tab key={t.key} tab={t} on={t.key === tab} onPress={setTab} />
        ))}
      </View>

      {showEmpty ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No results</Text>
          <Text style={s.emptyBody}>
            Nothing in your library matches “{query}”. Try a song, artist or album name.
          </Text>
        </View>
      ) : showIdleHint ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>Search your library</Text>
          <Text style={s.emptyBody}>Find songs, albums and artists by name.</Text>
        </View>
      ) : (
        <FlatList
          data={data}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          extraData={playingKey}
          style={s.listContent}
          contentContainerStyle={listStyle}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          initialNumToRender={14}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews
        />
      )}
    </View>
  );
}