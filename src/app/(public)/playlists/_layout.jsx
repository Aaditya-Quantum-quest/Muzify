import { Platform } from "react-native";
import { Stack } from "expo-router";

export default function PlaylistsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: Platform.OS === "ios" ? "default" : "slide_from_right",
        animationMatchesGesture: true,
        gestureEnabled: true,
        contentStyle: { backgroundColor: "#0b0b0e" },
        freezeOnBlur: true,
      }}
    />
  );
}
