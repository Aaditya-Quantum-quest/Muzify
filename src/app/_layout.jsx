import { useEffect, useState } from "react";
import { Stack, useRouter } from "expo-router";
import { useFonts } from "expo-font";
import { ActivityIndicator, View, Platform, Text } from "react-native";
import * as NavigationBar from "expo-navigation-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { PlayerProvider, usePlayer } from "../context/player-context";
import { initializeDatabase } from "../databases/db";

import "../../global.css";

const BootRedirect = () => {
  const router = useRouter();
  const { onboardingStep } = usePlayer();

  useEffect(() => {
    router.replace(onboardingStep === "welcome" ? "/(public)" : "/(tabs)");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingStep]);

  return null;
};

const RootLayout = () => {
  const [fontsLoaded] = useFonts({
    Quicksand_300Light: require("../../assets/fonts/Quicksand-Light.ttf"),
    Quicksand_400Regular: require("../../assets/fonts/Quicksand-Regular.ttf"),
    Quicksand_500Medium: require("../../assets/fonts/Quicksand-Medium.ttf"),
    Quicksand_600SemiBold: require("../../assets/fonts/Quicksand-SemiBold.ttf"),
    Quicksand_700Bold: require("../../assets/fonts/Quicksand-Bold.ttf"),
    Playwrite: require("../../assets/fonts/PlaywriteITTrad-VariableFont_wght.ttf"),
    Neo: require("../../assets/fonts/Cattalague.ttf"),
  });

  const [databaseReady, setDatabaseReady] = useState(false);
  const [databaseError, setDatabaseError] = useState(null);

  useEffect(() => {
    let active = true;

    queueMicrotask(() => {
      try {
        initializeDatabase();
        // Repair then backfill sequentially so they do not share overlapping SQLite txns.
        Promise.resolve()
          .then(async () => {
            try {
              const { repairLibraryMetadata } = await import('../services/musicImporter.js');
              await repairLibraryMetadata();
            } catch (e) {
              console.warn('Metadata repair error', e);
            }
            try {
              const { backfillAllSongs } = await import('../services/artists/artistSync.js');
              await backfillAllSongs();
            } catch (e) {
              console.warn('Artist backfill error', e);
            }
            try {
              const { getArtists } = await import('../services/artists/artistRepository.js');
              const { enqueueArtist } = await import('../services/artists/enrichmentService.js');
              const artists = getArtists({ limit: 5000 });
              for (const a of artists) {
                try { enqueueArtist(a.id, 'normal'); } catch (_) {}
              }
            } catch (e) {
              console.warn('Enqueue all artists failed', e);
            }
          });
        import('../services/artists/enrichmentService.js').then(({ startEnrichmentQueue }) => {
          startEnrichmentQueue();
        });

        if (active) setDatabaseReady(true);
        console.log("Muzify database initialized successfully");
      } catch (error) {
        console.error("Database initialization failed:", error);
        if (active) setDatabaseError(error);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === "android") {
      NavigationBar.setVisibilityAsync("hidden").catch(console.warn);
    }
  }, []);

  if (databaseError) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "#05040f",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 16 }}>
            Database initialization failed.
          </Text>
          <Text style={{ color: "#ff7777", marginTop: 8 }}>
            {databaseError.message}
          </Text>
        </View>
      </GestureHandlerRootView>
    );
  }

  if (!fontsLoaded || !databaseReady) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "#05040f",
          }}
        >
          <ActivityIndicator size="large" color="#2ad0ff" />
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PlayerProvider>
        <BootRedirect />
        <Stack screenOptions={{ freezeOnBlur: true }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(public)" options={{ headerShown: false }} />
        </Stack>
      </PlayerProvider>
    </GestureHandlerRootView>
  );
};

export default RootLayout;