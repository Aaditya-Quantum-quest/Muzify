import { Tabs } from "expo-router";
import { View } from "react-native";
import "../../../global.css";

import BottomBar from "../../components/ui/BottomBar";
import MiniPlayer from "../../components/ui/MiniPlayer";

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => (
        <View>
          <MiniPlayer />
          <BottomBar {...props} />
        </View>
      )}
      screenOptions={{
        headerShown: false,
        lazy: true,
        freezeOnBlur: true,
      }}
    >
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="library" options={{ title: "Library" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
      <Tabs.Screen name="statistics" options={{ title: "Statistics" }} />
      <Tabs.Screen name="Player" options={{ title: "Player" }} />
    </Tabs>
  );
}
