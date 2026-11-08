import React, { useState } from "react";

import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { cssInterop } from "nativewind";

import { HEADER_CONTENT } from "../../constants/headerContent";

import InspiredForYou from "../../components/subComponents/InspiredForYou";
import DailyMixTracks from "../../components/subComponents/DailyMix";
import MusicHeader from "../../components/subComponents/MusicHeader";

import Playlists, {
  DEFAULT_PLAYLISTS,
} from "../../components/subComponents/Playlists";

import WaveVisualizer from "../../components/ui/CircleWaveVisualizer";
import DACStreamVisualizer from "../../components/subComponents/DACStreamVisualizer";

import NowPlayingWidget from "../../widgets/Widgets";
import ArtistsSection from "../../components/subComponents/ArtistsGrid";
import RecentGrid from "../../components/subComponents/RecentSection";

// Screen visibility hook
import useScreenVisibility from "../../hooks/useScreenVisibility.js";
import { useHideTabBarOnScroll } from "../../components/ui/BottomBar";

// NEW: VisibleOnly wrapper
import VisibleOnly from "../../components/common/VisibleOnly.jsx";
import Spectrumcard from "../../components/subComponents/Spectrumcard .jsx";
import { useArtists } from "../../hooks/artists/useArtists.js";

// LinearGradient NativeWind support
cssInterop(LinearGradient, { className: "style" });

/* ───────────── palette ───────────── */

const C = {
  screen: "#0b0b0e",
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
  const onScroll = useHideTabBarOnScroll();

  const [chip, setChip] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const { artists: realArtists } = useArtists({ sort: "songs" });

  const goArtists = () => router.push("/settings");

  return (
    <View
      className="flex-1"
      style={{
        backgroundColor: C.screen,
        paddingTop: insets.top,
      }}
    >
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        bounces
        scrollEventThrottle={16}
        onScroll={onScroll}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 130,
        }}
      >
        {/* Music header */}

        <MusicHeader
          {...HEADER_CONTENT.home}
          active={isVisible}
          goArtists={goArtists}
        />

        {/* Chips */}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="-mx-5 mt-7 grow-0"
          contentContainerStyle={{
            paddingHorizontal: 20,
            gap: 8,
          }}
        >
          {CHIPS.map((c, i) => (
            <TouchableOpacity
              key={c}
              onPress={() => setChip(i)}
              activeOpacity={0.75}
              className={`h-10 items-center justify-center rounded-full px-5 ${
                chip === i ? "bg-amber-400" : ""
              }`}
              style={chip === i ? null : { backgroundColor: C.chip }}
            >
              <Text
                textTransform="capitalize"
                className={`text-sm font-medium ${
                  chip === i ? "" : "text-[#c4c4cc]"
                }`}
                style={chip === i ? { color: C.tabActive } : null}
              >
                {c}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Inspired for you */}

        <InspiredForYou />

        {/* Artists section */}

        <ArtistsSection
          title="Artists"
          label="Popular"
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
            Render only when Home is visible
        ───────────── */}

        <VisibleOnly visible={isVisible}>
          {/* Circle Visualizer */}
          {/* 
          <WaveVisualizer
            playing={true}
            size={300}
            label="Total hours"
            value="12,340h"
            active={isVisible}
          /> */}

          {/* DAC Stream Visualizer */}

          <DACStreamVisualizer active={isVisible} />
        </VisibleOnly>

        {/* Other components */}



        {/* <NowPlayingWidget /> */}

        <RecentGrid isScreenActive={isVisible} />
        <Spectrumcard />

        {/* ALL COMPONENTS FINISHED */}
      </ScrollView>
    </View>
  );
}
