import { useIsFocused } from "expo-router";

export default function useScreenVisibility() {
  return useIsFocused();
}