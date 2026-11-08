import { useCallback, useRef } from "react";
import { StyleSheet, View } from "react-native";
import PagerView from "react-native-pager-view";

import PlayerScreen from "../app/(public)/PlayerScreen";
import EquilizerScreen from "./EquilizerScreen";
import LyricsScreen from "./LyricsScreen";
import CircleWaveVisualizer from "../components/ui/CircleWaveVisualizer";
import { usePlayer } from "../context/player-context";

// Page order: CircleWave → Lyrics → Player → Equalizer.
// The Main Player stays the initial/center screen.
const PAGE_PLAYER = 1;

export default function PlayerPager() {
  const { playing } = usePlayer();
  const pagerRef = useRef(null);

  const goToPlayer = useCallback(() => {
    pagerRef.current?.setPage(PAGE_PLAYER);
  }, []);

  return (
    <View style={styles.root}>
      <PagerView
        ref={pagerRef}
        style={styles.root}
        initialPage={PAGE_PLAYER}
        offscreenPageLimit={2}
        overdrag
      >
        <View key="circle" collapsable={false} style={styles.page}>
          <CircleWaveVisualizer playing={playing} size={300} active />
        </View>
        <View key="lyrics" collapsable={false} style={styles.page}>
          <LyricsScreen onBack={goToPlayer} />
        </View>
        <View key="player" collapsable={false} style={styles.page}>
          <PlayerScreen />
        </View>
        <View key="eq" collapsable={false} style={styles.page}>
          <EquilizerScreen onBack={goToPlayer} />
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
});