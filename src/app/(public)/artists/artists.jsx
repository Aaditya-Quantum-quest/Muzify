import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Dimensions,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
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
import {
  getArtistGradient,
  getArtistInitials,
} from '../../../services/artists/artistArtwork.js';
import { usePlayer } from '../../../context/player-context.jsx';

const { width: SW } = Dimensions.get('window');

/* ───────────── Palette ───────────── */
const C = {
  screen: '#0b0b0e',
  btn: '#1f1e26',
  chip: '#1a1a20',
  fg: '#f4f4f6',
  mut: '#8a8a94',
  amb: '#e0a030',
  line: '#262431',
  field: '#1b1922',
  tabActive: '#2a1500',
};
const Space = { sm: 16 };

const CHIPS = ['A to Z', 'Most songs', 'Recently added'];
const SORT_MAP = {
  'A to Z': 'az',
  'Most songs': 'songs',
  'Recently added': 'recent',
};

/* ───────────── Grid Sizing ───────────── */
const SIDE_PAD = Space.sm + 0.5;
const INDEX_W = 26;
const GRID_GAP = 12;
const CARD_W = (SW - SIDE_PAD * 2 - INDEX_W - GRID_GAP) / 2;

/* ───────────── Icons ───────────── */
const IconBack = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M15 5l-7 7 7 7" />
  </Svg>
);

const IconSearch = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={C.mut} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Circle cx={11} cy={11} r={7} />
    <Path d="m20 20-3.8-3.8" />
  </Svg>
);

const IconPlay = () => (
  <Svg width={13} height={13} viewBox="0 0 24 24" fill="#fff">
    <Path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5Z" />
  </Svg>
);

const CardGradient = ({ id, colors }) => (
  <Svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
    <Defs>
      <LinearGradient id={`g_${id}`} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor={colors[0]} />
        <Stop offset="1" stopColor={colors[1]} />
      </LinearGradient>
    </Defs>
    <Rect width="100%" height="100%" fill={`url(#g_${id})`} />
  </Svg>
);

/* ───────────── Memoized Artist Card ───────────── */
const ArtistCard = React.memo(({ artist, onPress, onPlay }) => {
  const colors = useMemo(() => getArtistGradient(artist.name), [artist.name]);
  const initials = useMemo(() => getArtistInitials(artist.name), [artist.name]);
  const songCount = artist.songCount || 0;

  return (
    <TouchableOpacity
      onPress={() => onPress(artist.id)}
      activeOpacity={0.85}
      className="overflow-hidden rounded-[28px]"
      style={{ width: CARD_W, aspectRatio: 1 }}
    >
      {artist.image_uri ? (
        <Image
          source={{ uri: artist.image_uri }}
          className="absolute inset-0 h-full w-full"
          resizeMode="cover"
        />
      ) : (
        <CardGradient id={artist.id} colors={colors} />
      )}

      {/* Decorative corner glow */}
      <View
        pointerEvents="none"
        className="absolute -bottom-10 -right-10 h-[110px] w-[110px] rounded-full bg-white/[0.14]"
      />

      <View className="flex-1 justify-between p-4 bg-black/15">
        <View className="flex-row items-start justify-between">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-white/25">
            <Text className="text-[15px] font-bold text-white/90">
              {initials}
            </Text>
          </View>

          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              onPlay(artist.id);
            }}
            activeOpacity={0.8}
            className="h-10 w-10 items-center justify-center rounded-full"
            style={{
              backgroundColor: '#2b1d16',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.35,
              shadowRadius: 8,
              elevation: 6,
            }}
          >
            <IconPlay />
          </TouchableOpacity>
        </View>

        <View>
          <Text numberOfLines={1} className="text-[18px] font-bold text-white">
            {artist.name}
          </Text>

          <Text className="mt-0.5 text-[13px] text-white/80">
            {songCount} {songCount === 1 ? 'song' : 'songs'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

ArtistCard.displayName = 'ArtistCard';

export default function ArtistsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { playSongs } = usePlayer();

  const [inputQuery, setInputQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [mode, setMode] = useState('A to Z');

  const scrollRef = useRef(null);
  const sectionY = useRef({});

  // 250ms debounce for search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(inputQuery);
    }, 250);
    return () => clearTimeout(handler);
  }, [inputQuery]);

  const activeSort = SORT_MAP[mode] || 'az';
  const {
    artists,
    totalSongs,
    loading,
    error,
    refresh,
  } = useArtists({
    search: debouncedQuery,
    sort: activeSort,
  });

  // Re-query when returning to screen
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  // Group artists by first letter (or '#' for non-letters) when A to Z
  const showGroups = mode === 'A to Z' && !debouncedQuery.trim();
  const sections = useMemo(() => {
    if (!showGroups) {
      return [{ letter: null, items: artists }];
    }

    const map = new Map();
    for (const a of artists) {
      const firstChar = a.name ? a.name.trim().charAt(0).toUpperCase() : '#';
      const letter = /^[A-Z]$/.test(firstChar) ? firstChar : '#';
      if (!map.has(letter)) {
        map.set(letter, []);
      }
      map.get(letter).push(a);
    }

    const sortedLetters = Array.from(map.keys()).sort((x, y) => {
      if (x === '#') return 1;
      if (y === '#') return -1;
      return x.localeCompare(y);
    });

    return sortedLetters.map((letter) => ({
      letter,
      items: map.get(letter),
    }));
  }, [artists, showGroups]);

  const jumpTo = (letter) => {
    const y = sectionY.current[letter];
    if (y !== undefined) {
      scrollRef.current?.scrollTo({ y, animated: true });
    }
  };

  const handleCardPress = useCallback((artistId) => {
    router.push(`/artists/${artistId}`);
  }, [router]);

  const handlePlayArtist = useCallback((artistId) => {
    try {
      const queue = getArtistPlayableQueue(artistId, { sort: 'popular' });
      if (queue && queue.length > 0) {
        playSongs(queue, 0);
      }
    } catch (err) {
      console.warn('handlePlayArtist failed', err);
    }
  }, [playSongs]);

  return (
    <View
      className="flex-1"
      style={{ backgroundColor: C.screen, paddingTop: insets.top }}
    >
      {/* Ambient glow */}
      <View
        pointerEvents="none"
        className="absolute left-0 top-0 h-[170px] w-full"
        style={{ backgroundColor: 'rgba(172,50,135,0.18)' }}
      />
      <View
        pointerEvents="none"
        className="absolute -left-10 top-0 h-[160px] w-[160px] rounded-full"
        style={{ backgroundColor: 'rgba(172,50,135,0.25)' }}
      />

      {/* Header */}
      <View
        className="flex-row items-center gap-3.5 pb-3 pt-2"
        style={{ paddingHorizontal: SIDE_PAD }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          className="h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: C.btn }}
        >
          <IconBack />
        </TouchableOpacity>

        <View className="flex-1">
          <Text className="text-[30px] font-bold" style={{ color: C.fg }}>
            Artists
          </Text>

          <Text className="mt-0.5 text-[13px] font-medium" style={{ color: C.mut }}>
            {artists.length} {artists.length === 1 ? 'artist' : 'artists'} from{' '}
            {totalSongs} {totalSongs === 1 ? 'song' : 'downloaded songs'}
          </Text>
        </View>
      </View>

      {/* Search Bar */}
      <View
        className="mb-3 h-12 flex-row items-center gap-2.5 rounded-full px-4"
        style={{
          marginHorizontal: SIDE_PAD,
          backgroundColor: C.field,
        }}
      >
        <IconSearch />

        <TextInput
          className="flex-1 text-sm"
          placeholder="Search your artists"
          placeholderTextColor={C.mut}
          value={inputQuery}
          onChangeText={setInputQuery}
          style={{ color: C.fg }}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {inputQuery.length > 0 && (
          <TouchableOpacity onPress={() => setInputQuery('')}>
            <Text style={{ color: C.mut, fontSize: 13 }}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Sort Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mb-2 max-h-[42px]"
        style={{ marginHorizontal: SIDE_PAD }}
        contentContainerStyle={{ gap: 8 }}
      >
        {CHIPS.map((c) => {
          const isActive = mode === c;
          return (
            <TouchableOpacity
              key={c}
              onPress={() => setMode(c)}
              activeOpacity={0.8}
              className={`h-10 items-center justify-center rounded-full px-5 ${
                isActive ? '' : 'bg-[#1b1922]'
              }`}
              style={isActive ? { backgroundColor: C.amb } : null}
            >
              <Text
                className={`text-sm font-semibold ${
                  isActive ? '' : 'text-[#c4c4cc]'
                }`}
                style={isActive ? { color: C.tabActive } : null}
              >
                {c}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Content Area */}
      <View className="flex-1">
        {loading && artists.length === 0 ? (
          <View className="mt-20 items-center justify-center">
            <ActivityIndicator size="large" color={C.amb} />
            <Text className="mt-3 text-sm" style={{ color: C.mut }}>
              Loading artists...
            </Text>
          </View>
        ) : error ? (
          <View className="mt-20 items-center justify-center px-6">
            <Text className="text-center text-sm" style={{ color: '#ff6b6b' }}>
              Failed to load artists from library.
            </Text>
            <TouchableOpacity
              onPress={refresh}
              className="mt-4 rounded-full px-5 py-2.5"
              style={{ backgroundColor: C.btn }}
            >
              <Text style={{ color: C.fg, fontWeight: '600' }}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            className="flex-1"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingLeft: SIDE_PAD,
              paddingRight: SIDE_PAD + (showGroups ? INDEX_W : 0),
              paddingTop: 8,
              paddingBottom: 110,
            }}
          >
            {artists.length === 0 && (
              <View className="mt-20 items-center justify-center px-6">
                <Text className="text-center text-sm font-medium" style={{ color: C.mut }}>
                  {debouncedQuery.trim()
                    ? `No artists match "${debouncedQuery.trim()}"`
                    : 'No artists found in your local music library.'}
                </Text>
              </View>
            )}

            {sections.map((section, sIdx) => (
              <View
                key={section.letter ?? `all-${sIdx}`}
                className="mb-4"
                onLayout={(e) => {
                  if (section.letter) {
                    sectionY.current[section.letter] = e.nativeEvent.layout.y;
                  }
                }}
              >
                {section.letter && (
                  <Text
                    className="mb-3 mt-1 text-[17px] font-bold"
                    style={{ color: C.amb }}
                  >
                    {section.letter}
                  </Text>
                )}

                <View className="flex-row flex-wrap" style={{ gap: GRID_GAP }}>
                  {section.items.map((artist) => (
                    <ArtistCard
                      key={artist.id}
                      artist={artist}
                      onPress={handleCardPress}
                      onPlay={handlePlayArtist}
                    />
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        {/* A–Z Index Rail */}
        {showGroups && sections.length > 0 && artists.length > 0 && (
          <View
            pointerEvents="box-none"
            className="absolute inset-y-0 right-1 items-center justify-center"
            style={{ width: INDEX_W }}
          >
            {sections.map((s) => (
              <TouchableOpacity
                key={s.letter}
                onPress={() => jumpTo(s.letter)}
                hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
                className="py-[3px]"
              >
                <Text className="text-[11px] font-bold" style={{ color: C.fg }}>
                  {s.letter}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
