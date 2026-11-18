import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import PagerView from "react-native-pager-view";

import PlayerScreen from "../app/(public)/PlayerScreen";
import EquilizerScreen from "./EquilizerScreen";
import LyricsScreen from "./LyricsScreen";
import CircleWaveVisualizer from "../components/ui/CircleWaveVisualizer";
import { usePlayer } from "../context/player-context";

// Page order: CircleWave → Lyrics → Player → Equalizer.
// The Main Player stays the initial/center screen.
const PAGE_CIRCLE = 0;
const PAGE_LYRICS = 1;
const PAGE_PLAYER = 2;
const PAGE_EQ = 3;

export default function PlayerPager() {
  const { playing } = usePlayer();
  const pagerRef = useRef(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [page, setPage] = useState(PAGE_PLAYER);
  // The player is the only page that must exist on open; the rest mount a beat
  // later (or when swiped to) so opening the tab never waits on them.
  const [warm, setWarm] = useState(false);
  // The equalizer is the heaviest page: mount it on first visit only.
  const [eqMounted, setEqMounted] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setWarm(true), 600);
    return () => clearTimeout(id);
  }, []);

  const onPageSelected = useCallback((event) => {
    const next = event.nativeEvent.position;
    setPage(next);
    if (next === PAGE_EQ) setEqMounted(true);
  }, []);

  // Pre-mount a neighbor as soon as a swipe toward it starts, so the drag never
  // reveals an empty page. Setting the same value again is a cheap no-op.
  const onPageScroll = useCallback((event) => {
    const { position, offset } = event.nativeEvent;
    if (position === PAGE_LYRICS || position === PAGE_CIRCLE) setWarm(true);
    if (position === PAGE_EQ || (position === PAGE_PLAYER && offset > 0.02)) {
      setEqMounted(true);
    }
  }, []);

  const goToPlayer = useCallback(() => {
    pagerRef.current?.setPage(PAGE_PLAYER);
  }, []);

  // The pager is full screen, so the player needs its own exit.
  const closePlayer = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/home");
  }, [router]);

  return (
    <View style={styles.root}>
      <PagerView
        ref={pagerRef}
        style={styles.root}
        initialPage={PAGE_PLAYER}
        offscreenPageLimit={2}
        overdrag
        onPageSelected={onPageSelected}
        onPageScroll={onPageScroll}
      >
        <View key="circle" collapsable={false} style={styles.page}>
          {warm ? (
            <CircleWaveVisualizer
              playing={playing}
              size={300}
              active={page === PAGE_CIRCLE}
            />
          ) : null}
        </View>
        <View key="lyrics" collapsable={false} style={styles.page}>
          {warm ? (
            <LyricsScreen onBack={goToPlayer} active={page === PAGE_LYRICS} />
          ) : null}
        </View>
        <View key="player" collapsable={false} style={styles.page}>
          <PlayerScreen active={page === PAGE_PLAYER} />
          <Pressable
            onPress={closePlayer}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close player"
            style={[styles.close, { top: insets.top + 8 }]}
          >
            <Ionicons name="chevron-down" size={22} color="#ffffff" />
          </Pressable>
        </View>
        <View key="eq" collapsable={false} style={styles.page}>
          {eqMounted ? (
            <EquilizerScreen onBack={goToPlayer} active={page === PAGE_EQ} />
          ) : null}
        </View>
      </PagerView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#050506",
  },
  page: {
    flex: 1,
  },
  close: {
    position: "absolute",
    left: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
  },
});
