import React, { useState } from "react";

import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  StyleSheet,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

import { HEADER_CONTENT } from "../../constants/headerContent";

import InspiredForYou from "../../components/subComponents/InspiredForYou";
import DailyMixTracks from "../../components/subComponents/DailyMix";
import MusicHeader from "../../components/subComponents/MusicHeader";

import Playlists from "../../components/subComponents/Playlists";

import DACStreamVisualizer from "../../components/subComponents/DACStreamVisualizer";

import ArtistsSection from "../../components/subComponents/ArtistsGrid";
import RecentGrid from "../../components/subComponents/RecentSection";

// Screen visibility hook
import useScreenVisibility from "../../hooks/useScreenVisibility.js";

import { useArtists } from "../../hooks/artists/useArtists.js";

/* ───────────── palette ───────────── */

const C = {
  screen: "#000000",
  btn: "#1f1e26",
  chip: "#1a1a20",
  fg: "#f4f4f6",
  mut: "#8a8a94",
  amb: "#fbbf24",
  pink: "#ec6f8e",
  tabActive: "#2a1500",
};

const CHIPS = ["All", "New Release", "Trending", "Top Charts", "Podcasts"];

/* ───────────── Home screen ───────────── */

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Check whether Home screen is focused
  const isVisible = useScreenVisibility();

  const [chip, setChip] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const { artists: realArtists } = useArtists({ sort: "songs" });

  const goArtists = () => router.push("/settings");

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: C.screen,
          paddingTop: insets.top,
        },
      ]}
    >
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: Math.max(insets.bottom, 16) + 16,
        }}
      >
        {/* Music header */}

        <MusicHeader
          {...HEADER_CONTENT.home}
          active={isVisible}
          goArtists={goArtists}
        />


        {/* Inspired for you */}

        {/* <InspiredForYou /> */}

        {/* Artists section */}

        <ArtistsSection
          title="Artists"
          label="Popular"
           inset={0}       
          artists={realArtists.slice(0, 10).map((a) => ({
            id: a.id,
            name: a.name,
            info: `${a.songCount || 0} ${a.songCount === 1 ? "track" : "tracks"}`,
            image: a.image_uri,
          }))}
          selectedId={selectedId}
          onArtistPress={(artist) => {
            setSelectedId(artist.id);
            router.push(`/artists/${artist.id}`);
          }}
          onArtistView={(artist) => router.push(`/artists/${artist.id}`)}
          onSeeAll={() => router.push("/artists")}
        />

        {/* Recent listen */}

        <DailyMixTracks isScreenActive={isVisible} />

        {/* Playlists */}

        <Playlists isScreenActive={isVisible} />

        {/* ─────────────
            ANIMATED COMPONENTS
            Kept mounted while Home is blurred: unmounting and rebuilding the
            spectrum on every tab switch cost more than leaving it parked (its
            own loop already stops when `active` is false).
        ───────────── */}

        <DACStreamVisualizer active={isVisible} />

        {/* Other components */}



        <RecentGrid isScreenActive={isVisible} />
     

        {/* ALL COMPONENTS FINISHED */}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
});
