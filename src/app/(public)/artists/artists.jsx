import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  Image,
  ActivityIndicator,
  Animated,
  Easing,
  AccessibilityInfo,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useIsFocused } from 'expo-router';
import Svg, {
  Path,
  Circle,
  Rect,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';

import { useArtists } from '../../../hooks/artists/useArtists.js';
import { getArtistPlayableQueue } from '../../../services/artists/artistRepository.js';
import { getArtistInitials } from '../../../services/artists/artistArtwork.js';
import { usePlayer } from '../../../context/player-context.jsx';

/* ───────────── Tokens ───────────── */
const C = {
  bg: '#0a0a0b',
  fg: '#f2efe9',
  soft: '#c9c5bd',
  mut: '#8c8a85',
  line: '#1f1e1c',
  edge: '#2a2927',
  ring: '#3a3936',
  accent: '#e0a030',
  error: '#ff6b6b',
};

const SIDE = 22;
const RAIL_W = 32;
const ROW_H = 81; // 14 + 52 + 14 padding + 1 hairline
const HEAD_H = 46; // 22 top + 16 text + 8 bottom
const FOOT_FADE = 110;

const SORTS = [
  { label: 'A TO Z', value: 'az' },
  { label: 'MOST SONGS', value: 'songs' },
  { label: 'RECENTLY ADDED', value: 'recent' },
];

const EMPTY = [];

/* ───────────── Helpers ───────────── */
const sortKey = (name = '') => name.replace(/^the\s+/i, '').trim();

const letterOf = (name) => {
  const ch = sortKey(name).charAt(0).toUpperCase();
  return /^[A-Z]$/.test(ch) ? ch : '#';
};

function useDebounced(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setReduce(v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}

/* ───────────── Icons (static, created once) ───────────── */
const IconBack = memo(function IconBack() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={C.fg} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M15 5l-7 7 7 7" />
    </Svg>
  );
});

const IconSearch = memo(function IconSearch() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={C.mut} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={11} cy={11} r={7} />
      <Path d="m20 20-3.8-3.8" />
    </Svg>
  );
});

const IconPlay = memo(function IconPlay() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill={C.fg}>
      <Path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5Z" />
    </Svg>
  );
});

const IconPause = memo(function IconPause() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill={C.bg}>
      <Rect x={6} y={4} width={4} height={16} rx={1} />
      <Rect x={14} y={4} width={4} height={16} rx={1} />
    </Svg>
  );
});

/* ───────────── Equalizer (native-driven, only mounted while playing) ───────────── */
const BAR_H = 10;
const EqBar = memo(function EqBar({ delay, reduce }) {
  // `useState` lazy-initializes the animated value once; it is never reassigned,
  // so the ref-access idiom is replaced without changing behavior.
  const [v] = useState(() => new Animated.Value(reduce ? 1 : 0.3));

  useEffect(() => {
    if (reduce) {
      v.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 450, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.3, duration: 450, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay, reduce]);

  // scaleY pivots on the centre, so shift down to keep the bar anchored to its base
  const translateY = v.interpolate({ inputRange: [0.3, 1], outputRange: [(BAR_H * 0.7) / 2, 0] });

  return <Animated.View style={[styles.eqBar, { transform: [{ translateY }, { scaleY: v }] }]} />;
});

const Equalizer = memo(function Equalizer() {
  const reduce = useReduceMotion();
  return (
    <View style={styles.eq} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <EqBar delay={0} reduce={reduce} />
      <EqBar delay={150} reduce={reduce} />
      <EqBar delay={300} reduce={reduce} />
    </View>
  );
});

/* ───────────── Static chrome ───────────── */
const BottomFade = memo(function BottomFade() {
  return (
    <View pointerEvents="none" style={styles.fade}>
    <Svg width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="artistsFade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.bg} stopOpacity={0} />
          <Stop offset="0.8" stopColor={C.bg} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#artistsFade)" />
    </Svg>
  </View>
  );
});

const Header = memo(function Header({ summary, topInset, onBack }) {
  return (
    <View style={[styles.header, { paddingTop: topInset + 16 }]}>
    <View style={styles.flex}>
      <Text style={styles.eyebrow}>LIBRARY</Text>
      <Text style={styles.title}>Artists</Text>
      <Text style={styles.summary}>{summary}</Text>
    </View>
    <Pressable
      onPress={onBack}
      accessibilityRole="button"
      accessibilityLabel="Back"
      style={styles.backBtn}
    >
      <IconBack />
    </Pressable>
  </View>
  );
});

const SearchBar = memo(function SearchBar({ value, onChange, onClear }) {
  return (
    <View style={styles.search}>
    <IconSearch />
    <TextInput
      style={styles.searchInput}
      placeholder="Search your artists"
      placeholderTextColor={C.mut}
      value={value}
      onChangeText={onChange}
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="search"
      accessibilityLabel="Search your artists"
    />
    {value.length > 0 && (
      <Pressable onPress={onClear} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
        <Text style={styles.clear}>CLEAR</Text>
      </Pressable>
    )}
  </View>
  );
});

const SortTabs = memo(function SortTabs({ active, onPick }) {
  return (
    <View style={styles.tabs}>
    {SORTS.map((s) => {
      const on = s.value === active;
      return (
        <Pressable
          key={s.value}
          onPress={() => onPick(s.value)}
          accessibilityRole="button"
          accessibilityState={{ selected: on }}
          style={[styles.tab, { borderBottomColor: on ? C.accent : 'transparent' }]}
        >
          <Text style={[styles.tabText, { color: on ? C.fg : C.mut }]}>{s.label}</Text>
        </Pressable>
      );
    })}
  </View>
  );
});

const IndexRail = memo(function IndexRail({ letters, onJump }) {
  return (
    <View pointerEvents="box-none" style={styles.rail}>
    {letters.map((l) => (
      <Pressable
        key={l}
        onPress={() => onJump(l)}
        hitSlop={{ left: 8, right: 6 }}
        accessibilityRole="button"
        accessibilityLabel={`Jump to ${l}`}
        style={styles.railBtn}
      >
        <Text style={styles.railText}>{l}</Text>
      </Pressable>
    ))}
  </View>
  );
});

/* ───────────── List items ───────────── */
const SectionLabel = memo(function SectionLabel({ letter }) {
  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionText}>{letter}</Text>
    </View>
  );
});

const ArtistRow = memo(({ artist, isPlaying, onOpen, onPlay }) => {
  const initials = useMemo(() => getArtistInitials(artist.name), [artist.name]);
  const songs = artist.songCount || 0;

  return (
    <Pressable
      onPress={() => onOpen(artist.id)}
      android_ripple={{ color: 'rgba(255,255,255,0.05)' }}
      accessibilityRole="button"
      accessibilityLabel={`${artist.name}, ${songs} ${songs === 1 ? 'song' : 'songs'}`}
      style={styles.row}
    >
      <View style={styles.avatar}>
        {artist.image_uri ? (
          <Image source={{ uri: artist.image_uri }} style={styles.avatarImg} resizeMode="cover" />
        ) : (
          <Text style={styles.avatarText}>{initials}</Text>
        )}
      </View>

      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.name, isPlaying && { color: C.accent }]}>
          {artist.name}
        </Text>
        <View style={styles.metaRow}>
          {isPlaying && <Equalizer />}
          <Text style={styles.meta}>
            {songs} {songs === 1 ? 'song' : 'songs'}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={() => onPlay(artist.id)}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={`${isPlaying ? 'Pause' : 'Play'} ${artist.name}`}
        style={[
          styles.playBtn,
          isPlaying && { backgroundColor: C.fg, borderColor: C.fg },
        ]}
      >
        {isPlaying ? <IconPause /> : <IconPlay />}
      </Pressable>
    </Pressable>
  );
});
ArtistRow.displayName = 'ArtistRow';

/* ───────────── Screen body (mounted only while the screen is focused) ───────────── */
const ArtistsContent = memo(({ store }) => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { playSongs, togglePlay } = usePlayer();

  const [inputQuery, setInputQuery] = useState(store.current.query);
  const [sort, setSort] = useState(store.current.sort);
  const [playingId, setPlayingId] = useState(null);

  const listRef = useRef(null);
  const restored = useRef(false);

  const query = useDebounced(inputQuery, 250);
  const hasQuery = query.trim().length > 0;

  const { artists, totalSongs, loading, error, refresh } = useArtists({
    search: query,
    sort,
  });

  // Fresh library data every time the screen becomes visible
  useEffect(() => {
    refresh();
  }, [refresh]);

  /* Flat, fixed-height rows → O(1) layout math, no per-item measuring */
  const grouped = sort === 'az' && !hasQuery;

  const { data, offsets, letterIndex, letters } = useMemo(() => {
    const list = grouped
      ? [...artists].sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name)))
      : artists;

    const items = [];
    const offs = [];
    const idx = {};
    const lets = [];
    let y = 0;
    let last = null;

    for (let i = 0; i < list.length; i += 1) {
      const a = list[i];
      if (grouped) {
        const l = letterOf(a.name);
        if (l !== last) {
          last = l;
          idx[l] = items.length;
          lets.push(l);
          offs.push(y);
          items.push({ key: `h-${l}`, type: 'head', letter: l, h: HEAD_H });
          y += HEAD_H;
        }
      }
      offs.push(y);
      items.push({ key: `a-${a.id}`, type: 'row', artist: a, h: ROW_H });
      y += ROW_H;
    }
    return { data: items, offsets: offs, letterIndex: idx, letters: lets };
  }, [artists, grouped]);

  /* Handlers (stable identities so memoized children never re-render needlessly) */
  const handleBack = useCallback(() => router.back(), [router]);
  const handleOpen = useCallback((id) => router.push(`/artists/${id}`), [router]);

  const handleSort = useCallback(
    (value) => {
      store.current.sort = value;
      setSort(value);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    },
    [store]
  );

  const handleQuery = useCallback(
    (text) => {
      store.current.query = text;
      setInputQuery(text);
    },
    [store]
  );
  const handleClear = useCallback(() => handleQuery(''), [handleQuery]);

  const handlePlay = useCallback(
    (artistId) => {
      if (playingId === artistId) {
        togglePlay?.();
        setPlayingId(null);
        return;
      }
      try {
        const queue = getArtistPlayableQueue(artistId, { sort: 'popular' });
        if (queue && queue.length > 0) {
          playSongs(queue, 0);
          setPlayingId(artistId);
        }
      } catch (err) {
        console.warn('handlePlayArtist failed', err);
      }
    },
    [playingId, playSongs, togglePlay]
  );

  const handleJump = useCallback(
    (letter) => {
      const index = letterIndex[letter];
      if (index !== undefined) {
        listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 });
      }
    },
    [letterIndex]
  );

  /* FlatList plumbing */
  const getItemLayout = useCallback(
    (_, index) => ({ length: data[index].h, offset: offsets[index], index }),
    [data, offsets]
  );

  const renderItem = useCallback(
    ({ item }) =>
      item.type === 'head' ? (
        <SectionLabel letter={item.letter} />
      ) : (
        <ArtistRow
          artist={item.artist}
          isPlaying={playingId === item.artist.id}
          onOpen={handleOpen}
          onPlay={handlePlay}
        />
      ),
    [playingId, handleOpen, handlePlay]
  );

  const keyExtractor = useCallback((item) => item.key, []);

  const onScroll = useCallback(
    (e) => {
      store.current.y = e.nativeEvent.contentOffset.y; // ref write, zero re-renders
    },
    [store]
  );

  // Put the user back where they left off after returning to the screen
  const onListLayout = useCallback(() => {
    if (restored.current) return;
    restored.current = true;
    if (store.current.y > 0) {
      listRef.current?.scrollToOffset({ offset: store.current.y, animated: false });
    }
  }, [store]);

  const contentStyle = useMemo(
    () => ({
      paddingLeft: SIDE,
      paddingRight: SIDE + (grouped ? 22 : 0),
      paddingBottom: 120,
    }),
    [grouped]
  );

  const summary = `${artists.length} ${artists.length === 1 ? 'artist' : 'artists'} from ${totalSongs} downloaded ${totalSongs === 1 ? 'song' : 'songs'}`;

  const emptyText = hasQuery
    ? `No artists match “${query.trim()}”`
    : 'No artists found in your local music library.';

  return (
    <View style={styles.screen}>
      <Header summary={summary} topInset={insets.top} onBack={handleBack} />
      <SearchBar value={inputQuery} onChange={handleQuery} onClear={handleClear} />
      <SortTabs active={sort} onPick={handleSort} />

      <View style={styles.flex}>
        {loading && artists.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={C.accent} />
            <Text style={styles.stateText}>Loading artists...</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={[styles.stateText, { color: C.error }]}>
              Failed to load artists from library.
            </Text>
            <Pressable onPress={refresh} accessibilityRole="button" style={styles.retry}>
              <Text style={styles.retryText}>RETRY</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={data.length ? data : EMPTY}
            extraData={playingId}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            getItemLayout={getItemLayout}
            onLayout={onListLayout}
            onScroll={onScroll}
            scrollEventThrottle={32}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={contentStyle}
            ListEmptyComponent={<Text style={styles.empty}>{emptyText}</Text>}
            initialNumToRender={10}
            maxToRenderPerBatch={8}
            updateCellsBatchingPeriod={40}
            windowSize={7}
            removeClippedSubviews
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          />
        )}

        {grouped && letters.length > 0 && !loading && !error && (
          <IndexRail letters={letters} onJump={handleJump} />
        )}

        <BottomFade />
      </View>
    </View>
  );
});
ArtistsContent.displayName = 'ArtistsContent';

/* ───────────── Route entry: renders the heavy tree only while visible ───────────── */
export default function ArtistsScreen() {
  const isFocused = useIsFocused();

  // Survives blur/refocus because it lives here, not in the unmounted body
  const store = useRef({ query: '', sort: 'az', y: 0 });

  if (!isFocused) {
    // Cheap placeholder: keeps the background so tab/stack transitions never flash
    return <View style={styles.screen} />;
  }

  return <ArtistsContent store={store} />;
}

/* ───────────── Styles ───────────── */
const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: C.bg },

  header: {
    paddingHorizontal: SIDE,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  eyebrow: { fontSize: 11, letterSpacing: 2.4, color: C.mut, fontWeight: '500' },
  title: {
    marginTop: 10,
    fontSize: 60,
    lineHeight: 60,
    letterSpacing: -2.7,
    fontWeight: '600',
    color: C.fg,
  },
  summary: { marginTop: 12, fontSize: 13, color: C.mut, letterSpacing: 0.13 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.edge,
    alignItems: 'center',
    justifyContent: 'center',
  },

  search: {
    marginTop: 26,
    marginHorizontal: SIDE,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.edge,
  },
  searchInput: { flex: 1, height: 44, fontSize: 15, color: C.fg, padding: 0 },
  clear: { fontSize: 12, letterSpacing: 1.4, color: C.mut },

  tabs: { marginTop: 6, marginHorizontal: SIDE, flexDirection: 'row', gap: 26 },
  tab: { height: 44, justifyContent: 'center', borderBottomWidth: 2 },
  tabText: { fontSize: 11, letterSpacing: 2, fontWeight: '500' },

  sectionWrap: { height: HEAD_H, paddingTop: 22, paddingBottom: 8 },
  sectionText: { fontSize: 12, lineHeight: 16, letterSpacing: 2.6, fontWeight: '600', color: C.accent },

  row: {
    height: ROW_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: C.edge,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { fontSize: 15, letterSpacing: 0.9, fontWeight: '500', color: C.soft },
  name: { fontSize: 21, letterSpacing: -0.4, fontWeight: '500', color: C.fg },
  metaRow: { marginTop: 3, flexDirection: 'row', alignItems: 'center', gap: 8 },
  meta: { fontSize: 12, color: C.mut, letterSpacing: 0.5 },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.ring,
    alignItems: 'center',
    justifyContent: 'center',
  },

  eq: { height: BAR_H, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  eqBar: { width: 2, height: BAR_H, backgroundColor: C.accent },

  rail: {
    position: 'absolute',
    top: 0,
    bottom: FOOT_FADE,
    right: 6,
    width: RAIL_W,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railBtn: { width: RAIL_W, height: 22, alignItems: 'center', justifyContent: 'center' },
  railText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4, color: C.soft },

  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: FOOT_FADE },

  center: { marginTop: 80, alignItems: 'center', paddingHorizontal: 24 },
  stateText: { marginTop: 12, fontSize: 14, color: C.mut, textAlign: 'center' },
  empty: { paddingVertical: 72, textAlign: 'center', fontSize: 14, color: C.mut },
  retry: {
    marginTop: 16,
    height: 44,
    paddingHorizontal: 22,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.ring,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { fontSize: 11, letterSpacing: 2, fontWeight: '500', color: C.fg },
});