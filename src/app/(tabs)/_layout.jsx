import { Tabs } from "expo-router";
import "../../../global.css";

import BottomBar from "../../components/ui/BottomBar";

function AppTabBar(props) {
  const current = props.state.routes[props.state.index]?.name;
  if (current === "Player") return null;
  return <BottomBar {...props} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={AppTabBar}
      detachInactiveScreens={false}
      screenOptions={{
        headerShown: false,
        lazy: false,
        freezeOnBlur: true,
        animation: "none",
      }}
    >
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="library" options={{ title: "Library" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
      <Tabs.Screen name="statistics" options={{ title: "Statistics" }} />
      <Tabs.Screen name="Player" options={{ title: "Player", href: null }} />
    </Tabs>
  );
}
