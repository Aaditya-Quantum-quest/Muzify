import { useState } from "react";
import { useIsFocused } from "expo-router";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  PermissionsAndroid,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, Check, Folder, Music } from "lucide-react-native";

import * as FileSystem from "expo-file-system/legacy";
import { saveSetting } from "../databases/queries/settings";


// UI-only: a reusable permission card
function PermCard({ step, icon, tint, title, desc, done, children }) {
  return (
    <View
      className={`mb-3.5 rounded-[26px] border-[1.5px] p-[18px] ${
        done
          ? "border-[#2ad0ff]/40 bg-[#2ad0ff]/[0.07]"
          : "border-white/[0.09] bg-white/[0.05]"
      }`}
    >
      <View className="flex-row items-start gap-3.5">
        <View
          className="h-12 w-12 items-center justify-center rounded-[17px]"
          style={{ backgroundColor: tint }}
        >
          {icon}
        </View>

        <View className="flex-1">
          <Text className="text-[15px] font-bold text-white">{title}</Text>
          <Text className="mt-1 text-xs leading-[18px] text-[#9eabbc]">
            {desc}
          </Text>
        </View>

        <View
          className={`h-[26px] w-[26px] items-center justify-center rounded-full border-[1.5px] ${
            done ? "border-[#1b8a5a] bg-[#1b8a5a]" : "border-white/20"
          }`}
        >
          {done ? (
            <Check size={14} color="#fff" strokeWidth={3} />
          ) : (
            <Text className="text-[11px] font-extrabold text-[#9eabbc]">
              {step}
            </Text>
          )}
        </View>
      </View>

      {children}
    </View>
  );
}


export default function PermissionsScreen({ onFinish }) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const [notificationGranted, setNotificationGranted] = useState(false);
  const [storageGranted, setStorageGranted] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [songsFound, setSongsFound] = useState(null);

  // Request Notification permission
  const handleRequestNotification = async () => {
    try {
      if (Platform.OS === "android" && Platform.Version >= 33) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );

        setNotificationGranted(granted === PermissionsAndroid.RESULTS.GRANTED);
      } else {
        setNotificationGranted(true);
      }
    } catch {
      setNotificationGranted(true);
    }
  };

  // Request Storage / Media permission
  const handleRequestStorage = async () => {
    try {
      if (Platform.OS !== "android") {
        setStorageGranted(true);
        return;
      }

      const permission =
        Platform.Version >= 33
          ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO
          : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

      if (!permission) {
        console.error("Storage permission is not available.");
        return;
      }

      // Check whether permission is already granted
      const alreadyGranted = await PermissionsAndroid.check(permission);

      if (alreadyGranted) {
        setStorageGranted(true);
        console.log("Storage permission already granted");
        return;
      }

      // Request permission
      const result = await PermissionsAndroid.request(permission);

      console.log("Storage permission result:", result);

      setStorageGranted(result === PermissionsAndroid.RESULTS.GRANTED);
    } catch (error) {
      console.error("Storage permission error:", error);
    }
  };

  // Select folder & simulate live scanning
  const handleSelectFolder = async () => {
    try {
      const result =
        await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

      if (result.granted) {
        const folder = {
          name: result.directoryUri.split("/").pop() || "Music Folder",
          uri: result.directoryUri,
        };

        // Save folder information in SQLite
        saveSetting("music_folder_uri", folder.uri);
        saveSetting("music_folder_name", folder.name);

        setSelectedFolder(folder);
        setSongsFound(null);
        setIsScanning(false);

        console.log("Music folder saved:", folder);
      }
    } catch (error) {
      console.error("Folder selection failed:", error);
    }
  };

  const allReady = selectedFolder !== null && !isScanning;

  // UI-only: progress derived from existing state
  const doneCount = [
    notificationGranted,
    storageGranted,
    selectedFolder !== null,
  ].filter(Boolean).length;

  if (!isFocused) {
  return null;
}

  return (
    <View
      className="flex-1 bg-[#05040f]"
      style={{
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 16,
      }}
    >
      {/* Background ambient glow */}
      <View
        pointerEvents="none"
        className="absolute inset-x-0 top-0 h-[300px] rounded-b-[180px] bg-[#6b45cd]/25"
      />
      <View
        pointerEvents="none"
        className="absolute -right-20 top-[420px] h-[240px] w-[240px] rounded-full bg-[#2ad0ff]/15"
      />

      {/* Header */}
      <View className="mb-2 px-6">
        <View className="self-start rounded-full border border-[#2ad0ff]/30 bg-[#2ad0ff]/[0.12] px-3 py-1.5">
          <Text className="text-[10px] font-extrabold uppercase tracking-[2.5px] text-[#2ad0ff]">
            QUICK SETUP
          </Text>
        </View>

        <Text className="mt-3 text-[28px] font-extrabold text-[#f4efff]">
          Permissions & Access
        </Text>

        <Text className="mt-1.5 text-[13px] leading-[19px] text-[#9eabbc]">
          Grant permissions to play music seamlessly and choose your music
          folder to import tracks.
        </Text>

        {/* Progress */}
        <View className="mt-4 flex-row items-center gap-2">
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              className={`h-[5px] flex-1 rounded-full ${
                i < doneCount ? "bg-[#2ad0ff]" : "bg-white/10"
              }`}
            />
          ))}
          <Text className="ml-1 text-[11px] font-bold text-[#c9c0ee]">
            {doneCount}/3
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Card 1: Notifications */}
        <PermCard
          step={1}
          done={notificationGranted}
          tint="rgba(42,208,255,0.15)"
          icon={<Bell size={22} color="#2ad0ff" strokeWidth={2} />}
          title="Notification Access"
          desc="Show lock screen controls, status bar playback progress, and artist notifications."
        >
          <TouchableOpacity
            onPress={handleRequestNotification}
            disabled={notificationGranted}
            activeOpacity={0.8}
            className={`mt-3.5 items-center justify-center rounded-2xl py-3.5 ${
              notificationGranted ? "bg-[#1b8a5a]" : "bg-[#6b45cd]"
            }`}
          >
            {notificationGranted ? (
              <View className="flex-row items-center gap-2">
                <Check size={16} color="#fff" strokeWidth={3} />
                <Text className="text-[13px] font-bold text-white">
                  Permission Granted
                </Text>
              </View>
            ) : (
              <Text className="text-[13px] font-bold text-white">
                Allow Notifications
              </Text>
            )}
          </TouchableOpacity>
        </PermCard>

        {/* Card 2: Storage Access */}
        <PermCard
          step={2}
          done={storageGranted}
          tint="rgba(107,69,205,0.25)"
          icon={<Folder size={22} color="#8a5cff" strokeWidth={2} />}
          title="Storage & Audio Access"
          desc="Read songs, playlists, album artwork, and audio files stored on your device."
        >
          <TouchableOpacity
            onPress={handleRequestStorage}
            disabled={storageGranted}
            activeOpacity={0.8}
            className={`mt-3.5 items-center justify-center rounded-2xl py-3.5 ${
              storageGranted ? "bg-[#1b8a5a]" : "bg-[#6b45cd]"
            }`}
          >
            {storageGranted ? (
              <View className="flex-row items-center gap-2">
                <Check size={16} color="#fff" strokeWidth={3} />
                <Text className="text-[13px] font-bold text-white">
                  Storage Granted
                </Text>
              </View>
            ) : (
              <Text className="text-[13px] font-bold text-white">
                Grant Storage Permission
              </Text>
            )}
          </TouchableOpacity>
        </PermCard>

        {/* Card 3: Select Music Folder */}
        <PermCard
          step={3}
          done={selectedFolder !== null}
          tint="rgba(228,159,51,0.2)"
          icon={<Music size={22} color="#e49f33" strokeWidth={2} />}
          title="Select Music Folder"
          desc="Select the folder containing your songs to scan and populate your library."
        >
          {/* Selected folder row */}
          {selectedFolder && (
            <View className="mt-3.5 flex-row items-center gap-2.5 rounded-[14px] bg-[#e49f33]/[0.12] px-3 py-2.5">
              <Folder size={16} color="#e49f33" strokeWidth={2} />
              <Text
                numberOfLines={1}
                className="flex-1 text-xs font-semibold text-[#f2c277]"
              >
                {selectedFolder.name}
              </Text>
            </View>
          )}

          {/* Folder button */}
          <TouchableOpacity
            onPress={handleSelectFolder}
            activeOpacity={0.75}
            className={`mt-3.5 items-center justify-center rounded-2xl border py-3.5 ${
              selectedFolder
                ? "border-[#e49f33] bg-[#e49f33]"
                : "border-white/10 bg-white/[0.08]"
            }`}
          >
            <Text
              className={`text-[13px] ${
                selectedFolder
                  ? "font-bold text-[#2a1500]"
                  : "font-semibold text-[#d6d6de]"
              }`}
            >
              {selectedFolder ? "Change Folder" : "Choose Music Folder"}
            </Text>
          </TouchableOpacity>

          {/* Scanning status */}
          {isScanning && (
            <View className="mt-3 flex-row items-center gap-2.5 rounded-xl bg-[#2ad0ff]/10 p-2.5">
              <ActivityIndicator color="#2ad0ff" size="small" />

              <Text className="text-xs font-semibold text-[#2ad0ff]">
                Scanning {selectedFolder?.name} for songs...
              </Text>
            </View>
          )}

          {/* Songs found status */}
          {songsFound !== null && !isScanning && (
            <View className="mt-3 flex-row items-center gap-2 rounded-xl bg-[#2ad0ff]/15 p-2.5">
              <Check size={16} color="#2ad0ff" strokeWidth={3} />

              <Text className="text-xs font-bold text-[#2ad0ff]">
                Found {songsFound} songs in {selectedFolder?.name}
              </Text>
            </View>
          )}
        </PermCard>
      </ScrollView>

      {/* Bottom CTA */}
      <View className="mt-1.5 items-center px-5">
        <TouchableOpacity
          onPress={() => {
            if (allReady) {
              onFinish(selectedFolder);
            }
          }}
          activeOpacity={0.85}
          className={`w-full items-center justify-center rounded-[22px] py-[17px] ${
            allReady ? "bg-[#2ad0ff]" : "bg-[#6b45cd]/60"
          }`}
          style={{
            shadowColor: allReady ? "#2ad0ff" : "#6b45cd",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: allReady ? 0.55 : 0.3,
            shadowRadius: 18,
            elevation: 10,
          }}
        >
          <Text
            className={`text-[15px] font-extrabold ${
              allReady ? "text-[#05040f]" : "text-white/80"
            }`}
          >
            {allReady
              ? "Complete Setup & Go Home →"
              : "Continue to Home Screen →"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            console.log("Setup skipped");
          }}
          className="mt-1 py-2.5"
        >
        </TouchableOpacity>
      </View>
    </View>
  );
}