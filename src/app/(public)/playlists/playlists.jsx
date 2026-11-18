// import React, { useEffect, useMemo, useRef, useState } from 'react';
// import {
//   View,
//   Text,
//   ScrollView,
//   TouchableOpacity,
//   TextInput,
//   Modal,
//   Pressable,
//   KeyboardAvoidingView,
//   Animated,
//   LayoutAnimation,
//   Platform,
//   UIManager,
//   useWindowDimensions,
// } from 'react-native';
// import { useSafeAreaInsets } from 'react-native-safe-area-context';
// import { useRouter } from 'expo-router';
// import { LinearGradient } from 'expo-linear-gradient';
// import Svg, { Path } from 'react-native-svg';
// import { PLAYLISTS, type Playlist } from '@/constants/data';

// // styling is plain React Native (StyleSheet); LinearGradient accepts a style prop directly

// if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
//   UIManager.setLayoutAnimationEnabledExperimental(true);
// }
// const animate = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

// /* ───────────── types & constants ───────────── */
// type Item = Playlist & { liked: boolean; pinned: boolean; mine: boolean };
// type Filter = 'All' | 'Liked' | 'Pinned' | 'Yours';
// type SortKey = 'Recent' | 'A–Z' | 'Most songs';
// type Grad = [string, string];

// const FILTERS: Filter[] = ['All', 'Liked', 'Pinned', 'Yours'];
// const SORTS: SortKey[] = ['Recent', 'A–Z', 'Most songs'];
// const SWATCHES: Grad[] = [
//   ['#dea962', '#e09a66'],
//   ['#e69a12', '#c25d1a'],
//   ['#6a4fd8', '#2a1d6e'],
//   ['#4f8fd8', '#1d3a6e'],
//   ['#4fd88a', '#1d6e45'],
//   ['#ec6f8e', '#8e2a55'],
// ];
// const WORDMARK_FONT = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
// const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

// /* ───────────── icons ───────────── */
// const PATHS = {
//   search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-3.8-3.8',
//   x: 'M18 6 6 18M6 6l12 12',
//   plus: 'M12 5v14M5 12h14',
//   heart: 'M12 20.5s-7.5-4.5-7.5-10A4.3 4.3 0 0 1 12 7.8a4.3 4.3 0 0 1 7.5 2.7c0 5.5-7.5 10-7.5 10Z',
//   play: 'M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5Z',
//   pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
//   grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
//   list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
//   pin: 'M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z',
//   trash: 'M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14',
//   dots: 'M12 5h.01M12 12h.01M12 19h.01',
//   sort: 'M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3',
// } as const;

// function Icon({
//   name,
//   size = 22,
//   color = '#fff',
//   filled = false,
//   stroke = 1.7,
// }: {
//   name: keyof typeof PATHS;
//   size?: number;
//   color?: string;
//   filled?: boolean;
//   stroke?: number;
// }) {
//   return (
//     <Svg
//       width={size}
//       height={size}
//       viewBox="0 0 24 24"
//       fill={filled ? color : 'none'}
//       stroke={filled ? color : color}
//       strokeWidth={filled ? 0 : stroke}
//       strokeLinecap="round"
//       strokeLinejoin="round"
//     >
//       <Path d={PATHS[name]} />
//     </Svg>
//   );
// }
// const HeartIcon = ({ on, size = 18 }: { on: boolean; size?: number }) => (
//   <Svg
//     width={size}
//     height={size}
//     viewBox="0 0 24 24"
//     fill={on ? '#ff5c85' : 'none'}
//     stroke={on ? '#ff5c85' : '#fff'}
//     strokeWidth={1.8}
//     strokeLinecap="round"
//     strokeLinejoin="round"
//   >
//     <Path d={PATHS.heart} />
//   </Svg>
// );

// /* ───────────── small pieces ───────────── */
// function Equalizer() {
//   const bars = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
//   useEffect(() => {
//     const loops = bars.map((v, i) =>
//       Animated.loop(
//         Animated.sequence([
//           Animated.timing(v, { toValue: 1, duration: 360 + i * 140, useNativeDriver: false }),
//           Animated.timing(v, { toValue: 0, duration: 360 + i * 140, useNativeDriver: false }),
//         ]),
//       ),
//     );
//     loops.forEach((l) => l.start());
//     return () => loops.forEach((l) => l.stop());
//   }, [bars]);
//   return (
//     <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 16, gap: 2 }}>
//       {bars.map((v, i) => (
//         <Animated.View
//           key={i}
//           style={[
//             { width: 3, borderRadius: 9999, backgroundColor: '#ffffff' },
//             { height: v.interpolate({ inputRange: [0, 1], outputRange: [4, 16] }) },
//           ]}
//         />
//       ))}
//     </View>
//   );
// }

// function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
//   const insets = useSafeAreaInsets();
//   return (
//     <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
//       <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
//         <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={onClose} />
//         <View
//           style={[
//             {
//               backgroundColor: '#16151b',
//               borderTopLeftRadius: 28,
//               borderTopRightRadius: 28,
//               paddingHorizontal: 20,
//               paddingTop: 12,
//             },
//             { paddingBottom: Math.max(insets.bottom, 16) + 8 },
//           ]}
//         >
//           <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 9999, backgroundColor: 'rgba(255,255,255,0.2)', marginBottom: 16 }} />
//           {children}
//         </View>
//       </KeyboardAvoidingView>
//     </Modal>
//   );
// }

// function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
//   return (
//     <TouchableOpacity
//       style={[
//         { height: 40, paddingHorizontal: 20, borderRadius: 9999, alignItems: 'center', justifyContent: 'center' },
//         active ? { backgroundColor: '#e0a030' } : { backgroundColor: '#1c1c22' },
//       ]}
//       onPress={onPress}
//       activeOpacity={0.75}
//     >
//       <Text textTransform="capitalize"  style={[{ fontSize: 14, fontWeight: '500' }, active ? { color: '#2a1500' } : { color: '#c4c4cc' }]}>{label}</Text>
//     </TouchableOpacity>
//   );
// }

// function PlayPill({ playing, onPress, size = 44 }: { playing: boolean; onPress: () => void; size?: number }) {
//   return (
//     <TouchableOpacity
//       onPress={onPress}
//       activeOpacity={0.8}
//       hitSlop={HIT}
//       style={[
//         { borderRadius: 9999, alignItems: 'center', justifyContent: 'center' },
//         { width: size, height: size },
//         playing ? { backgroundColor: '#e0a030' } : { backgroundColor: '#2b1d16' },
//       ]}
//     >
//       <Icon name={playing ? 'pause' : 'play'} size={size * 0.34} color={playing ? '#2a1500' : '#fff'} filled />
//     </TouchableOpacity>
//   );
// }

// /* ───────────── cards ───────────── */
// function GridCard({
//   item,
//   width,
//   playing,
//   onOpen,
//   onPlay,
//   onLike,
//   onMenu,
// }: {
//   item: Item;
//   width: number;
//   playing: boolean;
//   onOpen: () => void;
//   onPlay: () => void;
//   onLike: () => void;
//   onMenu: () => void;
// }) {
//   return (
//     <TouchableOpacity activeOpacity={0.85} onPress={onOpen} onLongPress={onMenu} delayLongPress={280}>
//       <LinearGradient
//         colors={item.gradient as Grad}
//         start={{ x: 0.1, y: 0 }}
//         end={{ x: 1, y: 1 }}
//         style={[{ borderRadius: 24, overflow: 'hidden' }, { width, height: width }]}
//       >
//         <View style={{ position: 'absolute', right: -32, top: -32, width: 110, height: 110, borderRadius: 9999, backgroundColor: 'rgba(255,255,255,0.1)' }} />

//         <View style={{ position: 'absolute', left: 12, top: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
//           {playing && (
//             <View style={{ height: 36, paddingHorizontal: 12, borderRadius: 9999, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' }}>
//               <Equalizer />
//             </View>
//           )}
//           {item.pinned && (
//             <View style={{ width: 36, height: 36, borderRadius: 9999, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' }}>
//               <Icon name="pin" size={16} />
//             </View>
//           )}
//         </View>

//         <TouchableOpacity
//           onPress={onLike}
//           hitSlop={HIT}
//           activeOpacity={0.7}
//           style={{ position: 'absolute', right: 12, top: 12, width: 36, height: 36, borderRadius: 9999, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' }}
//         >
//           <HeartIcon on={item.liked} />
//         </TouchableOpacity>

//         <View style={{ position: 'absolute', left: 14, bottom: 14, right: 64 }}>
//           <Text textTransform="capitalize"  style={{ fontSize: 16, fontWeight: '700', color: '#ffffff' }} numberOfLines={1}>
//             {item.title}
//           </Text>
//           <Text textTransform="capitalize"  style={{ fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>{item.songs} Songs</Text>
//         </View>
//         <View style={{ position: 'absolute', right: 12, bottom: 12 }}>
//           <PlayPill playing={playing} onPress={onPlay} size={42} />
//         </View>
//       </LinearGradient>
//     </TouchableOpacity>
//   );
// }

// function ListRow({
//   item,
//   playing,
//   onOpen,
//   onPlay,
//   onMenu,
// }: {
//   item: Item;
//   playing: boolean;
//   onOpen: () => void;
//   onPlay: () => void;
//   onMenu: () => void;
// }) {
//   return (
//     <TouchableOpacity
//       style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}
//       activeOpacity={0.7}
//       onPress={onOpen}
//       onLongPress={onMenu}
//       delayLongPress={280}
//     >
//       <LinearGradient
//         colors={item.gradient as Grad}
//         start={{ x: 0, y: 0 }}
//         end={{ x: 1, y: 1 }}
//         style={{ width: 64, height: 64, borderRadius: 16, marginRight: 12, alignItems: 'center', justifyContent: 'center' }}
//       >
//         {playing && <Equalizer />}
//       </LinearGradient>
//       <View style={{ flex: 1, minWidth: 0 }}>
//         <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
//           <Text textTransform="capitalize"  style={{ flexShrink: 1, fontSize: 16, fontWeight: '700', color: '#f5f5f7' }} numberOfLines={1}>
//             {item.title}
//           </Text>
//           {item.pinned && <Icon name="pin" size={13} color="#e0a030" />}
//           {item.liked && <HeartIcon on size={13} />}
//         </View>
//         <Text textTransform="capitalize"  style={{ fontSize: 12, color: '#8a8a94', marginTop: 4 }}>By Waveform • {item.songs} Songs</Text>
//       </View>
//       <PlayPill playing={playing} onPress={onPlay} size={38} />
//       <TouchableOpacity onPress={onMenu} hitSlop={HIT} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}>
//         <Icon name="dots" size={20} color="#9a9aa4" stroke={2.6} />
//       </TouchableOpacity>
//     </TouchableOpacity>
//   );
// }

// function NewTile({ onPress, width, list }: { onPress: () => void; width: number; list: boolean }) {
//   if (list) {
//     return (
//       <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
//         <View style={{ width: 64, height: 64, borderRadius: 16, marginRight: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.25)' }}>
//           <Icon name="plus" size={24} color="#e0a030" />
//         </View>
//         <Text textTransform="capitalize"  style={{ fontSize: 16, fontWeight: '700', color: '#e0a030' }}>New playlist</Text>
//       </TouchableOpacity>
//     );
//   }
//   return (
//     <TouchableOpacity
//       onPress={onPress}
//       activeOpacity={0.7}
//       style={[
//         { borderRadius: 24, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
//         { width, height: width },
//       ]}
//     >
//       <View style={{ width: 48, height: 48, borderRadius: 9999, backgroundColor: 'rgba(224,160,48,0.15)', alignItems: 'center', justifyContent: 'center' }}>
//         <Icon name="plus" size={26} color="#e0a030" />
//       </View>
//       <Text textTransform="capitalize"  style={{ marginTop: 12, fontSize: 14, fontWeight: '600', color: '#e0a030' }}>New playlist</Text>
//     </TouchableOpacity>
//   );
// }

// /* ───────────── screen ───────────── */
// export default function PlaylistsScreen() {
//   const insets = useSafeAreaInsets();
//   const router = useRouter();
//   const { width: screenW } = useWindowDimensions();

//   const [items, setItems] = useState<Item[]>(() =>
//     PLAYLISTS.map((p) => ({ ...p, liked: false, pinned: false, mine: false })),
//   );
//   const [query, setQuery] = useState('');
//   const [filter, setFilter] = useState<Filter>('All');
//   const [sort, setSort] = useState<SortKey>('Recent');
//   const [view, setView] = useState<'grid' | 'list'>('grid');
//   const [playingId, setPlayingId] = useState<number | null>(null);
//   const [menuId, setMenuId] = useState<number | null>(null);
//   const [creating, setCreating] = useState(false);
//   const [newName, setNewName] = useState('');
//   const [newGrad, setNewGrad] = useState(0);
//   const [undo, setUndo] = useState<{ item: Item; index: number } | null>(null);
//   const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

//   const cardW = (screenW - 40 - 12) / 2; // 20px padding each side, 12px gap

//   const visible = useMemo(() => {
//     const q = query.trim().toLowerCase();
//     return items
//       .filter((i) => {
//         if (filter === 'Liked' && !i.liked) return false;
//         if (filter === 'Pinned' && !i.pinned) return false;
//         if (filter === 'Yours' && !i.mine) return false;
//         return i.title.toLowerCase().includes(q);
//       })
//       .sort((a, b) => {
//         if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
//         if (sort === 'A–Z') return a.title.localeCompare(b.title);
//         if (sort === 'Most songs') return Number(b.songs) - Number(a.songs);
//         return 0;
//       });
//   }, [items, query, filter, sort]);

//   const menuItem = items.find((i) => i.id === menuId) ?? null;

//   const patch = (id: number, p: Partial<Item>) => {
//     animate();
//     setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...p } : i)));
//   };
//   const togglePlay = (id: number) => setPlayingId((p) => (p === id ? null : id));

//   const removeItem = (id: number) => {
//     const index = items.findIndex((i) => i.id === id);
//     if (index < 0) return;
//     animate();
//     setUndo({ item: items[index], index });
//     setItems((prev) => prev.filter((i) => i.id !== id));
//     if (playingId === id) setPlayingId(null);
//     setMenuId(null);
//     if (undoTimer.current) clearTimeout(undoTimer.current);
//     undoTimer.current = setTimeout(() => setUndo(null), 4500);
//   };
//   const undoDelete = () => {
//     if (!undo) return;
//     animate();
//     setItems((prev) => {
//       const next = [...prev];
//       next.splice(Math.min(undo.index, next.length), 0, undo.item);
//       return next;
//     });
//     setUndo(null);
//     if (undoTimer.current) clearTimeout(undoTimer.current);
//   };
//   useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

//   const createPlaylist = () => {
//     const title = newName.trim();
//     if (!title) return;
//     animate();
//     const created = {
//       id: Date.now(),
//       title,
//       songs: 0,
//       gradient: SWATCHES[newGrad],
//       liked: false,
//       pinned: false,
//       mine: true,
//     } as unknown as Item;
//     setItems((prev) => [created, ...prev]);
//     setFilter('All');
//     setQuery('');
//     setNewName('');
//     setCreating(false);
//   };

//   const openPlayer = () => router.push('/player' as any);
//   const resetFilters = () => {
//     animate();
//     setQuery('');
//     setFilter('All');
//   };

//   return (
//     <View style={[{ flex: 1, backgroundColor: '#0b0b0e' }, { paddingTop: insets.top }]}>
//       <ScrollView
//         style={{ flex: 1 }}
//         contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130 }}
//         showsVerticalScrollIndicator={false}
//         keyboardShouldPersistTaps="handled"
//         bounces
//       >
//         {/* ── header ── */}
//         <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
//           <Text textTransform="capitalize"  style={[{ fontSize: 24, color: '#f5f5f7', letterSpacing: 3 }, { fontFamily: WORDMARK_FONT }]}>
//             N MUSIC
//           </Text>
//           <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
//             <TouchableOpacity
//               hitSlop={HIT}
//               activeOpacity={0.7}
//               onPress={() => {
//                 animate();
//                 setView((v) => (v === 'grid' ? 'list' : 'grid'));
//               }}
//             >
//               <Icon name={view === 'grid' ? 'list' : 'grid'} size={24} />
//             </TouchableOpacity>
//             <TouchableOpacity hitSlop={HIT} activeOpacity={0.7} onPress={() => setCreating(true)}>
//               <Icon name="plus" size={28} />
//             </TouchableOpacity>
//           </View>
//         </View>

//         <Text textTransform="capitalize"  style={{ marginTop: 32, fontSize: 44, lineHeight: 50, fontWeight: '500', letterSpacing: -0.5, color: '#f5f5f7' }}>
//           Your{'\n'}Playlists
//           <Text textTransform="capitalize"  style={{ color: '#ff2d55' }}>.</Text>
//         </Text>

//         {/* ── search ── */}
//         <View style={{ marginTop: 24, height: 48, borderRadius: 16, backgroundColor: '#1c1c22', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}>
//           <Icon name="search" size={20} color="#8a8a94" />
//           <TextInput
//             value={query}
//             onChangeText={(t) => {
//               animate();
//               setQuery(t);
//             }}
//             placeholder="Search your playlists"
//             placeholderTextColor="#6b6b75"
//             style={{ flex: 1, marginHorizontal: 12, fontSize: 16, color: '#f5f5f7', padding: 0 }}
//             returnKeyType="search"
//             autoCorrect={false}
//           />
//           {query.length > 0 && (
//             <TouchableOpacity
//               hitSlop={HIT}
//               onPress={() => {
//                 animate();
//                 setQuery('');
//               }}
//             >
//               <Icon name="x" size={18} color="#8a8a94" />
//             </TouchableOpacity>
//           )}
//         </View>

//         {/* ── filter chips ── */}
//         <ScrollView
//           horizontal
//           showsHorizontalScrollIndicator={false}
//           style={{ marginTop: 16, marginHorizontal: -20, flexGrow: 0 }}
//           contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
//         >
//           {FILTERS.map((f) => (
//             <Chip
//               key={f}
//               label={f}
//               active={filter === f}
//               onPress={() => {
//                 animate();
//                 setFilter(f);
//               }}
//             />
//           ))}
//         </ScrollView>

//         {/* ── count + sort ── */}
//         <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 12, marginHorizontal: 2 }}>
//           <Text textTransform="capitalize"  style={{ fontSize: 14, color: '#8a8a94' }}>
//             {visible.length} {visible.length === 1 ? 'playlist' : 'playlists'}
//           </Text>
//           <TouchableOpacity
//             style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
//             hitSlop={HIT}
//             activeOpacity={0.7}
//             onPress={() => {
//               animate();
//               setSort((s) => SORTS[(SORTS.indexOf(s) + 1) % SORTS.length]);
//             }}
//           >
//             <Icon name="sort" size={16} color="#e0a030" />
//             <Text textTransform="capitalize"  style={{ fontSize: 14, fontWeight: '600', color: '#e0a030' }}>{sort}</Text>
//           </TouchableOpacity>
//         </View>

//         {/* ── content ── */}
//         {view === 'grid' ? (
//           <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
//             {filter === 'All' && query === '' && (
//               <NewTile onPress={() => setCreating(true)} width={cardW} list={false} />
//             )}
//             {visible.map((item) => (
//               <GridCard
//                 key={item.id}
//                 item={item}
//                 width={cardW}
//                 playing={playingId === item.id}
//                 onOpen={openPlayer}
//                 onPlay={() => togglePlay(item.id)}
//                 onLike={() => patch(item.id, { liked: !item.liked })}
//                 onMenu={() => setMenuId(item.id)}
//               />
//             ))}
//           </View>
//         ) : (
//           <View>
//             {filter === 'All' && query === '' && <NewTile onPress={() => setCreating(true)} width={cardW} list />}
//             {visible.map((item) => (
//               <ListRow
//                 key={item.id}
//                 item={item}
//                 playing={playingId === item.id}
//                 onOpen={openPlayer}
//                 onPlay={() => togglePlay(item.id)}
//                 onMenu={() => setMenuId(item.id)}
//               />
//             ))}
//           </View>
//         )}

//         {visible.length === 0 && (
//           <View style={{ alignItems: 'center', marginTop: 40 }}>
//             <Text textTransform="capitalize"  style={{ fontSize: 18, fontWeight: '700', color: '#f5f5f7' }}>Nothing here yet</Text>
//             <Text textTransform="capitalize"  style={{ marginTop: 6, fontSize: 14, color: '#8a8a94', textAlign: 'center' }}>
//               {filter === 'All' && query ? `No playlist matches "${query}".` : `You have no ${filter.toLowerCase()} playlists.`}
//             </Text>
//             <TouchableOpacity onPress={resetFilters} style={{ marginTop: 20, height: 40, paddingHorizontal: 20, borderRadius: 9999, backgroundColor: '#1c1c22', alignItems: 'center', justifyContent: 'center' }}>
//               <Text textTransform="capitalize"  style={{ fontSize: 14, fontWeight: '500', color: '#f5f5f7' }}>Clear filters</Text>
//             </TouchableOpacity>
//           </View>
//         )}
//       </ScrollView>

//       {/* ── undo toast ── */}
//       {undo && (
//         <View style={{ position: 'absolute', left: 20, right: 20, bottom: 110, height: 48, borderRadius: 16, backgroundColor: '#26252d', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 10 }}>
//           <Text textTransform="capitalize"  style={{ fontSize: 14, color: '#f5f5f7' }} numberOfLines={1}>
//             Playlist deleted
//           </Text>
//           <TouchableOpacity onPress={undoDelete} hitSlop={HIT}>
//             <Text textTransform="capitalize"  style={{ fontSize: 14, fontWeight: '700', color: '#e0a030' }}>Undo</Text>
//           </TouchableOpacity>
//         </View>
//       )}

//       {/* ── actions sheet (long-press / dots) ── */}
//       <Sheet visible={!!menuItem} onClose={() => setMenuId(null)}>
//         {menuItem && (
//           <>
//             <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
//               <LinearGradient
//                 colors={menuItem.gradient as Grad}
//                 start={{ x: 0, y: 0 }}
//                 end={{ x: 1, y: 1 }}
//                 style={{ width: 56, height: 56, borderRadius: 16, marginRight: 12 }}
//               />
//               <View style={{ flex: 1 }}>
//                 <Text textTransform="capitalize"  style={{ fontSize: 18, fontWeight: '700', color: '#f5f5f7' }} numberOfLines={1}>
//                   {menuItem.title}
//                 </Text>
//                 <Text textTransform="capitalize"  style={{ fontSize: 12, color: '#8a8a94', marginTop: 2 }}>{menuItem.songs} Songs</Text>
//               </View>
//             </View>

//             {[
//               {
//                 icon: playingId === menuItem.id ? 'pause' : 'play',
//                 label: playingId === menuItem.id ? 'Pause' : 'Play',
//                 run: () => {
//                   togglePlay(menuItem.id);
//                   setMenuId(null);
//                 },
//               },
//               {
//                 icon: 'pin',
//                 label: menuItem.pinned ? 'Unpin from top' : 'Pin to top',
//                 run: () => {
//                   patch(menuItem.id, { pinned: !menuItem.pinned });
//                   setMenuId(null);
//                 },
//               },
//               {
//                 icon: 'heart',
//                 label: menuItem.liked ? 'Remove from liked' : 'Add to liked',
//                 run: () => {
//                   patch(menuItem.id, { liked: !menuItem.liked });
//                   setMenuId(null);
//                 },
//               },
//             ].map((a) => (
//               <TouchableOpacity key={a.label} onPress={a.run} activeOpacity={0.7} style={{ height: 56, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
//                 <Icon name={a.icon as keyof typeof PATHS} size={22} filled={a.icon === 'play' || a.icon === 'pause'} />
//                 <Text textTransform="capitalize"  style={{ fontSize: 16, color: '#f5f5f7' }}>{a.label}</Text>
//               </TouchableOpacity>
//             ))}

//             <TouchableOpacity
//               onPress={() => removeItem(menuItem.id)}
//               activeOpacity={0.7}
//               style={{ height: 56, flexDirection: 'row', alignItems: 'center', gap: 16 }}
//             >
//               <Icon name="trash" size={22} color="#ff5c6c" />
//               <Text textTransform="capitalize"  style={{ fontSize: 16, color: '#ff5c6c' }}>Delete playlist</Text>
//             </TouchableOpacity>
//           </>
//         )}
//       </Sheet>

//       {/* ── create sheet ── */}
//       <Sheet visible={creating} onClose={() => setCreating(false)}>
//         <Text textTransform="capitalize"  style={{ fontSize: 20, fontWeight: '700', color: '#f5f5f7' }}>New playlist</Text>
//         <TextInput
//           value={newName}
//           onChangeText={setNewName}
//           placeholder="Give it a name"
//           placeholderTextColor="#6b6b75"
//           autoFocus
//           maxLength={30}
//           onSubmitEditing={createPlaylist}
//           returnKeyType="done"
//           style={{ marginTop: 16, height: 56, borderRadius: 16, backgroundColor: '#1c1c22', paddingHorizontal: 16, fontSize: 16, color: '#f5f5f7' }}
//         />
//         <Text textTransform="capitalize"  style={{ marginTop: 20, marginBottom: 12, fontSize: 14, color: '#8a8a94' }}>Cover color</Text>
//         <View style={{ flexDirection: 'row', gap: 12 }}>
//           {SWATCHES.map((g, i) => (
//             <TouchableOpacity key={i} onPress={() => setNewGrad(i)} activeOpacity={0.8}>
//               <LinearGradient
//                 colors={g}
//                 start={{ x: 0, y: 0 }}
//                 end={{ x: 1, y: 1 }}
//                 style={[
//                   { width: 44, height: 44, borderRadius: 9999, borderWidth: 2 },
//                   newGrad === i ? { borderColor: '#ffffff' } : { borderColor: 'transparent' },
//                 ]}
//               />
//             </TouchableOpacity>
//           ))}
//         </View>
//         <TouchableOpacity
//           onPress={createPlaylist}
//           disabled={!newName.trim()}
//           activeOpacity={0.85}
//           style={[
//             { marginTop: 24, height: 56, borderRadius: 16, backgroundColor: '#e0a030', alignItems: 'center', justifyContent: 'center' },
//             newName.trim() ? null : { opacity: 0.4 },
//           ]}
//         >
//           <Text textTransform="capitalize"  style={{ fontSize: 16, fontWeight: '700', color: '#2a1500' }}>Create playlist</Text>
//         </TouchableOpacity>
//       </Sheet>
//     </View>
//   );
// }


import React from 'react'

import { View } from 'react-native';

const playlists = () => {
  return (
    <View>Hello</View>
  )
}

export default playlists
