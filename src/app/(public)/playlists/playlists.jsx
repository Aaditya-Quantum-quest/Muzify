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
// import { cssInterop } from 'nativewind';
// import Svg, { Path } from 'react-native-svg';
// import { PLAYLISTS, type Playlist } from '@/constants/data';

// // lets <LinearGradient className="..." /> work (skip if already done in a shared setup file)
// cssInterop(LinearGradient, { className: 'style' });

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
//     <View className="flex-row items-end h-4 gap-[2px]">
//       {bars.map((v, i) => (
//         <Animated.View
//           key={i}
//           className="w-[3px] rounded-full bg-white"
//           style={{ height: v.interpolate({ inputRange: [0, 1], outputRange: [4, 16] }) }}
//         />
//       ))}
//     </View>
//   );
// }

// function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
//   const insets = useSafeAreaInsets();
//   return (
//     <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
//       <KeyboardAvoidingView behavior="padding" className="flex-1">
//         <Pressable className="flex-1 bg-black/60" onPress={onClose} />
//         <View className="bg-[#16151b] rounded-t-[28px] px-5 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}>
//           <View className="self-center w-10 h-1 rounded-full bg-white/20 mb-4" />
//           {children}
//         </View>
//       </KeyboardAvoidingView>
//     </Modal>
//   );
// }

// function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
//   return (
//     <TouchableOpacity
//       className={`h-10 px-5 rounded-full items-center justify-center ${active ? 'bg-amb' : 'bg-chip'}`}
//       onPress={onPress}
//       activeOpacity={0.75}
//     >
//       <Text textTransform="capitalize"  className={`text-sm font-medium ${active ? 'text-tabActive' : 'text-[#c4c4cc]'}`}>{label}</Text>
//     </TouchableOpacity>
//   );
// }

// function PlayPill({ playing, onPress, size = 44 }: { playing: boolean; onPress: () => void; size?: number }) {
//   return (
//     <TouchableOpacity
//       onPress={onPress}
//       activeOpacity={0.8}
//       hitSlop={HIT}
//       className={`rounded-full items-center justify-center ${playing ? 'bg-amb' : 'bg-[#2b1d16]'}`}
//       style={{ width: size, height: size }}
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
//         className="rounded-3xl overflow-hidden"
//         style={{ width, height: width }}
//       >
//         <View className="absolute -right-8 -top-8 w-[110px] h-[110px] rounded-full bg-white/10" />

//         <View className="absolute left-3 top-3 flex-row items-center gap-1.5">
//           {playing && (
//             <View className="h-9 px-3 rounded-full bg-black/25 items-center justify-center">
//               <Equalizer />
//             </View>
//           )}
//           {item.pinned && (
//             <View className="w-9 h-9 rounded-full bg-black/25 items-center justify-center">
//               <Icon name="pin" size={16} />
//             </View>
//           )}
//         </View>

//         <TouchableOpacity
//           onPress={onLike}
//           hitSlop={HIT}
//           activeOpacity={0.7}
//           className="absolute right-3 top-3 w-9 h-9 rounded-full bg-black/25 items-center justify-center"
//         >
//           <HeartIcon on={item.liked} />
//         </TouchableOpacity>

//         <View className="absolute left-3.5 bottom-3.5 right-16">
//           <Text textTransform="capitalize"  className="text-base font-bold text-white" numberOfLines={1}>
//             {item.title}
//           </Text>
//           <Text textTransform="capitalize"  className="text-xs font-medium text-white/80 mt-1">{item.songs} Songs</Text>
//         </View>
//         <View className="absolute right-3 bottom-3">
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
//       className="flex-row items-center py-2.5"
//       activeOpacity={0.7}
//       onPress={onOpen}
//       onLongPress={onMenu}
//       delayLongPress={280}
//     >
//       <LinearGradient
//         colors={item.gradient as Grad}
//         start={{ x: 0, y: 0 }}
//         end={{ x: 1, y: 1 }}
//         className="w-16 h-16 rounded-2xl mr-3 items-center justify-center"
//       >
//         {playing && <Equalizer />}
//       </LinearGradient>
//       <View className="flex-1 min-w-0">
//         <View className="flex-row items-center gap-1.5">
//           <Text textTransform="capitalize"  className="shrink text-base font-bold text-fg" numberOfLines={1}>
//             {item.title}
//           </Text>
//           {item.pinned && <Icon name="pin" size={13} color="#e0a030" />}
//           {item.liked && <HeartIcon on size={13} />}
//         </View>
//         <Text textTransform="capitalize"  className="text-xs text-mut mt-1">By Waveform • {item.songs} Songs</Text>
//       </View>
//       <PlayPill playing={playing} onPress={onPlay} size={38} />
//       <TouchableOpacity onPress={onMenu} hitSlop={HIT} className="w-9 h-9 items-center justify-center ml-1">
//         <Icon name="dots" size={20} color="#9a9aa4" stroke={2.6} />
//       </TouchableOpacity>
//     </TouchableOpacity>
//   );
// }

// function NewTile({ onPress, width, list }: { onPress: () => void; width: number; list: boolean }) {
//   if (list) {
//     return (
//       <TouchableOpacity onPress={onPress} activeOpacity={0.7} className="flex-row items-center py-2.5">
//         <View className="w-16 h-16 rounded-2xl mr-3 items-center justify-center border border-dashed border-white/25">
//           <Icon name="plus" size={24} color="#e0a030" />
//         </View>
//         <Text textTransform="capitalize"  className="text-base font-bold text-amb">New playlist</Text>
//       </TouchableOpacity>
//     );
//   }
//   return (
//     <TouchableOpacity
//       onPress={onPress}
//       activeOpacity={0.7}
//       className="rounded-3xl border border-dashed border-white/25 items-center justify-center"
//       style={{ width, height: width }}
//     >
//       <View className="w-12 h-12 rounded-full bg-amb/15 items-center justify-center">
//         <Icon name="plus" size={26} color="#e0a030" />
//       </View>
//       <Text textTransform="capitalize"  className="mt-3 text-sm font-semibold text-amb">New playlist</Text>
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
//     <View className="flex-1 bg-screen" style={{ paddingTop: insets.top }}>
//       <ScrollView
//         className="flex-1"
//         contentContainerClassName="px-5 pb-[130px]"
//         showsVerticalScrollIndicator={false}
//         keyboardShouldPersistTaps="handled"
//         bounces
//       >
//         {/* ── header ── */}
//         <View className="flex-row items-center justify-between mt-4">
//           <Text textTransform="capitalize"  className="text-2xl text-fg tracking-[3px]" style={{ fontFamily: WORDMARK_FONT }}>
//             N MUSIC
//           </Text>
//           <View className="flex-row items-center gap-5">
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

//         <Text textTransform="capitalize"  className="mt-8 text-[44px] leading-[50px] font-medium tracking-tight text-fg">
//           Your{'\n'}Playlists
//           <Text textTransform="capitalize"  className="text-[#ff2d55]">.</Text>
//         </Text>

//         {/* ── search ── */}
//         <View className="mt-6 h-12 rounded-2xl bg-chip px-4 flex-row items-center">
//           <Icon name="search" size={20} color="#8a8a94" />
//           <TextInput
//             value={query}
//             onChangeText={(t) => {
//               animate();
//               setQuery(t);
//             }}
//             placeholder="Search your playlists"
//             placeholderTextColor="#6b6b75"
//             className="flex-1 mx-3 text-base text-fg p-0"
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
//           className="mt-4 -mx-5 flex-grow-0"
//           contentContainerClassName="px-5 gap-2"
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
//         <View className="flex-row items-center justify-between mt-6 mb-3 mx-0.5">
//           <Text textTransform="capitalize"  className="text-sm text-mut">
//             {visible.length} {visible.length === 1 ? 'playlist' : 'playlists'}
//           </Text>
//           <TouchableOpacity
//             className="flex-row items-center gap-1.5"
//             hitSlop={HIT}
//             activeOpacity={0.7}
//             onPress={() => {
//               animate();
//               setSort((s) => SORTS[(SORTS.indexOf(s) + 1) % SORTS.length]);
//             }}
//           >
//             <Icon name="sort" size={16} color="#e0a030" />
//             <Text textTransform="capitalize"  className="text-sm font-semibold text-amb">{sort}</Text>
//           </TouchableOpacity>
//         </View>

//         {/* ── content ── */}
//         {view === 'grid' ? (
//           <View className="flex-row flex-wrap gap-3">
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
//           <View className="items-center mt-10">
//             <Text textTransform="capitalize"  className="text-lg font-bold text-fg">Nothing here yet</Text>
//             <Text textTransform="capitalize"  className="mt-1.5 text-sm text-mut text-center">
//               {filter === 'All' && query ? `No playlist matches "${query}".` : `You have no ${filter.toLowerCase()} playlists.`}
//             </Text>
//             <TouchableOpacity onPress={resetFilters} className="mt-5 h-10 px-5 rounded-full bg-chip items-center justify-center">
//               <Text textTransform="capitalize"  className="text-sm font-medium text-fg">Clear filters</Text>
//             </TouchableOpacity>
//           </View>
//         )}
//       </ScrollView>

//       {/* ── undo toast ── */}
//       {undo && (
//         <View className="absolute left-5 right-5 bottom-[110px] h-12 rounded-2xl bg-[#26252d] px-4 flex-row items-center justify-between shadow-lg">
//           <Text textTransform="capitalize"  className="text-sm text-fg" numberOfLines={1}>
//             Playlist deleted
//           </Text>
//           <TouchableOpacity onPress={undoDelete} hitSlop={HIT}>
//             <Text textTransform="capitalize"  className="text-sm font-bold text-amb">Undo</Text>
//           </TouchableOpacity>
//         </View>
//       )}

//       {/* ── actions sheet (long-press / dots) ── */}
//       <Sheet visible={!!menuItem} onClose={() => setMenuId(null)}>
//         {menuItem && (
//           <>
//             <View className="flex-row items-center mb-3">
//               <LinearGradient
//                 colors={menuItem.gradient as Grad}
//                 start={{ x: 0, y: 0 }}
//                 end={{ x: 1, y: 1 }}
//                 className="w-14 h-14 rounded-2xl mr-3"
//               />
//               <View className="flex-1">
//                 <Text textTransform="capitalize"  className="text-lg font-bold text-fg" numberOfLines={1}>
//                   {menuItem.title}
//                 </Text>
//                 <Text textTransform="capitalize"  className="text-xs text-mut mt-0.5">{menuItem.songs} Songs</Text>
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
//               <TouchableOpacity key={a.label} onPress={a.run} activeOpacity={0.7} className="h-14 flex-row items-center gap-4">
//                 <Icon name={a.icon as keyof typeof PATHS} size={22} filled={a.icon === 'play' || a.icon === 'pause'} />
//                 <Text textTransform="capitalize"  className="text-base text-fg">{a.label}</Text>
//               </TouchableOpacity>
//             ))}

//             <TouchableOpacity
//               onPress={() => removeItem(menuItem.id)}
//               activeOpacity={0.7}
//               className="h-14 flex-row items-center gap-4"
//             >
//               <Icon name="trash" size={22} color="#ff5c6c" />
//               <Text textTransform="capitalize"  className="text-base text-[#ff5c6c]">Delete playlist</Text>
//             </TouchableOpacity>
//           </>
//         )}
//       </Sheet>

//       {/* ── create sheet ── */}
//       <Sheet visible={creating} onClose={() => setCreating(false)}>
//         <Text textTransform="capitalize"  className="text-xl font-bold text-fg">New playlist</Text>
//         <TextInput
//           value={newName}
//           onChangeText={setNewName}
//           placeholder="Give it a name"
//           placeholderTextColor="#6b6b75"
//           autoFocus
//           maxLength={30}
//           onSubmitEditing={createPlaylist}
//           returnKeyType="done"
//           className="mt-4 h-14 rounded-2xl bg-chip px-4 text-base text-fg"
//         />
//         <Text textTransform="capitalize"  className="mt-5 mb-3 text-sm text-mut">Cover color</Text>
//         <View className="flex-row gap-3">
//           {SWATCHES.map((g, i) => (
//             <TouchableOpacity key={i} onPress={() => setNewGrad(i)} activeOpacity={0.8}>
//               <LinearGradient
//                 colors={g}
//                 start={{ x: 0, y: 0 }}
//                 end={{ x: 1, y: 1 }}
//                 className={`w-11 h-11 rounded-full ${newGrad === i ? 'border-2 border-white' : 'border-2 border-transparent'}`}
//               />
//             </TouchableOpacity>
//           ))}
//         </View>
//         <TouchableOpacity
//           onPress={createPlaylist}
//           disabled={!newName.trim()}
//           activeOpacity={0.85}
//           className={`mt-6 h-14 rounded-2xl bg-amb items-center justify-center ${newName.trim() ? '' : 'opacity-40'}`}
//         >
//           <Text textTransform="capitalize"  className="text-base font-bold text-tabActive">Create playlist</Text>
//         </TouchableOpacity>
//       </Sheet>
//     </View>
//   );
// }


import React from 'react'

const playlists = () => {
  return (
    <View>Hello</View>
  )
}

export default playlists