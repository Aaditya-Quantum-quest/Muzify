import React, { memo, useCallback, useMemo, useState } from "react";
import { useIsFocused } from "expo-router";
import {
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowRight, Bell, Check, Folder, Music } from "lucide-react-native";

import * as FileSystem from "expo-file-system/legacy";
import { saveSetting } from "../databases/queries/settings";

/*
 * Performance notes
 * - useIsFocused: nothing renders while the screen is not focused. State lives in
 *   this component, so progress is kept when the screen comes back.
 * - Static page: no Animated, no ActivityIndicator, no ripple, no layout animation.
 *   Press feedback is an instant opacity change (active:opacity-*), not an animation.
 * - Every section is a memo'd component that receives primitives and stable
 *   callbacks, so a tap re-renders only the parts whose data changed.
 * - Handlers are useCallback'd, permission logic is pure module-level functions,
 *   and colors / styles / config are module-level constants.
 * - Logging is dev-only.
 */

// Set FONT_MEDIUM to your loaded medium-weight font. FONT_REGULAR = undefined uses the system font.
const FONT_MEDIUM = "Quicksand_500Medium";
const FONT_REGULAR = undefined;

const ACCENT = "#e49f33";
const INK = "#14100a";
const TEXT_PRIMARY = "#f4efe6";
const ICON_MUTED = "#6f675d";
const TOTAL_STEPS = 3;

const SCROLL_CONTENT_STYLE = {
  paddingHorizontal: 22,
  paddingTop: 24,
  paddingBottom: 16,
};

const log = __DEV__ ? console.log : () => {};

/* ------------------------- permission helpers ------------------------- */

async function requestNotificationPermission() {
  try {
    if (Platform.OS === "android" && Platform.Version >= 33) {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true;
  } catch {
    return true;
  }
}

// Resolves to true / false, or null when nothing should change.
async function requestStoragePermission() {
  try {
    if (Platform.OS !== "android") return true;

    const permission =
      Platform.Version >= 33
        ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO
        : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

    if (!permission) {
      console.error("Storage permission is not available.");
      return null;
    }

    if (await PermissionsAndroid.check(permission)) {
      log("Storage permission already granted");
      return true;
    }

    const result = await PermissionsAndroid.request(permission);
    log("Storage permission result:", result);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch (error) {
    console.error("Storage permission error:", error);
    return null;
  }
}

// Display only: "primary%3AMusic" becomes "Music". The saved value is not changed.
function prettyFolderName(name) {
  try {
    const decoded = decodeURIComponent(name);
    const i = decoded.lastIndexOf(":");
    return i >= 0 && i < decoded.length - 1 ? decoded.slice(i + 1) : decoded;
  } catch {
    return name;
  }
}

/* ----------------------------- primitives ----------------------------- */

const Step = memo(function Step({
  index,
  title,
  Icon,
  description,
  done,
  isLast,
  children,
}) {
  return (
    <View className="flex-row gap-4">
      {/* rail */}
      <View className="w-9 items-center">
        <View
          className={`h-9 w-9 items-center justify-center rounded-full border ${
            done ? "border-[#e49f33] bg-[#e49f33]" : "border-white/20"
          }`}
        >
          {done ? (
            <Check size={16} color={INK} strokeWidth={3} />
          ) : (
            <Text
              className="text-sm text-[#f4efe6]"
              style={{ fontFamily: FONT_REGULAR }}
            >
              {index}
            </Text>
          )}
        </View>
        {!isLast && (
          <View
            className={`my-2 w-px flex-1 ${
              done ? "bg-[#e49f33]" : "bg-white/[0.12]"
            }`}
          />
        )}
      </View>

      {/* body */}
      <View className={`flex-1 ${isLast ? "pb-1.5" : "pb-[30px]"}`}>
        <View className="min-h-[36px] flex-row items-center justify-between">
          <Text
            className="text-[19px] text-[#f4efe6]"
            style={{ fontFamily: FONT_MEDIUM }}
          >
            {title}
          </Text>
          <Icon size={20} color={ICON_MUTED} strokeWidth={2} />
        </View>
        <Text
          className="mt-1 text-[13px] leading-[19px] text-[#9a9186]"
          style={{ fontFamily: FONT_REGULAR }}
        >
          {description}
        </Text>
        {children}
      </View>
    </View>
  );
});

const OutlineButton = memo(function OutlineButton({
  label,
  onPress,
  secondary = false,
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={`mt-4 w-full items-center justify-center rounded-[14px] border active:opacity-70 ${
        secondary
          ? "h-11 border-white/[0.12]"
          : "h-12 border-white/[0.22]"
      }`}
    >
      <Text
        className={`text-sm ${
          secondary ? "text-[#b3a794]" : "text-[#f4efe6]"
        }`}
        style={{ fontFamily: FONT_MEDIUM }}
      >
        {label}
      </Text>
    </Pressable>
  );
});

const GrantedRow = memo(function GrantedRow({ label }) {
  return (
    <View className="mt-3.5 flex-row items-center gap-2">
      <Check size={16} color={ACCENT} strokeWidth={3} />
      <Text
        className="text-sm text-[#e49f33]"
        style={{ fontFamily: FONT_MEDIUM }}
      >
        {label}
      </Text>
    </View>
  );
});

/* ------------------------------- header ------------------------------- */

const Progress = memo(function Progress({ doneCount }) {
  return (
    <View className="mb-7 mt-[22px] flex-row items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          className={`h-[3px] flex-1 rounded-sm ${
            i < doneCount ? "bg-[#e49f33]" : "bg-white/[0.12]"
          }`}
        />
      ))}
      <Text
        className="ml-2 text-[13px] text-[#9a9186]"
        style={{ fontFamily: FONT_REGULAR }}
      >
        {doneCount} of {TOTAL_STEPS} ready
      </Text>
    </View>
  );
});

const Header = memo(function Header({ doneCount }) {
  return (
    <>
      <Text
        className="text-[34px] leading-[38px] text-[#f4efe6]"
        style={{ fontFamily: FONT_MEDIUM }}
      >
        {"Permissions\nand access"}
      </Text>
      <Text
        className="mt-2.5 text-sm leading-[21px] text-[#9a9186]"
        style={{ fontFamily: FONT_REGULAR }}
      >
        Grant permissions to play music seamlessly and choose your music folder
        to import tracks.
      </Text>
      <Progress doneCount={doneCount} />
    </>
  );
});

/* -------------------------------- steps -------------------------------- */

const NotificationStep = memo(function NotificationStep({ granted, onPress }) {
  return (
    <Step
      index={1}
      title="Notification access"
      Icon={Bell}
      description="Show lock screen controls, status bar playback progress, and artist notifications."
      done={granted}
    >
      {granted ? (
        <GrantedRow label="Permission granted" />
      ) : (
        <OutlineButton label="Allow notifications" onPress={onPress} />
      )}
    </Step>
  );
});

const StorageStep = memo(function StorageStep({ granted, onPress }) {
  return (
    <Step
      index={2}
      title="Storage and audio access"
      Icon={Folder}
      description="Read songs, playlists, album artwork, and audio files stored on your device."
      done={granted}
    >
      {granted ? (
        <GrantedRow label="Storage granted" />
      ) : (
        <OutlineButton label="Grant storage permission" onPress={onPress} />
      )}
    </Step>
  );
});

const FolderStep = memo(function FolderStep({
  folderName,
  isScanning,
  songsFound,
  onPress,
}) {
  const hasFolder = folderName !== null;
  const label = useMemo(
    () => (hasFolder ? prettyFolderName(folderName) : ""),
    [hasFolder, folderName],
  );

  return (
    <Step
      index={3}
      title="Select music folder"
      Icon={Music}
      description="Select the folder containing your songs to scan and populate your library."
      done={hasFolder}
      isLast
    >
      {hasFolder ? (
        <>
          <View className="mt-4 flex-row items-center gap-2.5 rounded-[14px] bg-[#e49f33]/10 px-3.5 py-3">
            <Folder size={18} color={ACCENT} strokeWidth={2} />
            <Text
              numberOfLines={1}
              className="flex-1 text-[13px] text-[#f0c277]"
              style={{ fontFamily: FONT_MEDIUM }}
            >
              {label}
            </Text>
          </View>

          {isScanning && (
            <View className="mt-2.5 flex-row items-center gap-2">
              <View className="h-[7px] w-[7px] rounded-full bg-[#e49f33]" />
              <Text
                className="flex-1 text-[13px] text-[#b3a794]"
                style={{ fontFamily: FONT_REGULAR }}
              >
                {`Scanning ${label} for songs…`}
              </Text>
            </View>
          )}

          {songsFound !== null && !isScanning && (
            <View className="mt-2.5 flex-row items-center gap-2">
              <Check size={16} color={ACCENT} strokeWidth={3} />
              <Text
                className="flex-1 text-[13px] text-[#b3a794]"
                style={{ fontFamily: FONT_REGULAR }}
              >
                {`Found ${songsFound} songs in ${label}`}
              </Text>
            </View>
          )}

          <OutlineButton label="Change folder" onPress={onPress} secondary />
        </>
      ) : (
        <OutlineButton label="Choose music folder" onPress={onPress} />
      )}
    </Step>
  );
});

/* -------------------------------- footer -------------------------------- */

const FooterCta = memo(function FooterCta({ ready, onPress }) {
  const iconColor = ready ? INK : "#8d857a";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !ready }}
      className={`h-14 w-full flex-row items-center justify-center gap-2 rounded-[18px] active:opacity-85 ${
        ready ? "bg-[#e49f33]" : "bg-white/[0.07]"
      }`}
    >
      <Text
        className={`text-[15px] ${ready ? "text-[#14100a]" : "text-[#8d857a]"}`}
        style={{ fontFamily: FONT_MEDIUM }}
      >
        {ready ? "Complete setup and go home" : "Continue to home screen"}
      </Text>
      <ArrowRight size={18} color={iconColor} strokeWidth={2} />
    </Pressable>
  );
});

/* -------------------------------- screen -------------------------------- */

export default function PermissionsScreen({ onFinish }) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const [notificationGranted, setNotificationGranted] = useState(false);
  const [storageGranted, setStorageGranted] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [songsFound, setSongsFound] = useState(null);

  const handleRequestNotification = useCallback(async () => {
    setNotificationGranted(await requestNotificationPermission());
  }, []);

  const handleRequestStorage = useCallback(async () => {
    const granted = await requestStoragePermission();
    if (granted !== null) setStorageGranted(granted);
  }, []);

  const handleSelectFolder = useCallback(async () => {
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

        log("Music folder saved:", folder);
      }
    } catch (error) {
      console.error("Folder selection failed:", error);
    }
  }, []);

  const hasFolder = selectedFolder !== null;
  const allReady = hasFolder && !isScanning;
  const doneCount =
    (notificationGranted ? 1 : 0) + (storageGranted ? 1 : 0) + (hasFolder ? 1 : 0);

  // Keep the latest values reachable from a stable callback.
  const finish = useCallback(() => {
    if (allReady) onFinish?.(selectedFolder);
  }, [allReady, onFinish, selectedFolder]);

  // Hooks above always run; nothing is rendered while the screen is unfocused.
  if (!isFocused) return null;

  return (
    <View
      className="flex-1 bg-[#0b0a09]"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}
    >
      <View className="w-full max-w-[560px] flex-1 self-center">
        <ScrollView
          contentContainerStyle={SCROLL_CONTENT_STYLE}
          showsVerticalScrollIndicator={false}
          overScrollMode="never"
        >
          <Header doneCount={doneCount} />

          <NotificationStep
            granted={notificationGranted}
            onPress={handleRequestNotification}
          />
          <StorageStep
            granted={storageGranted}
            onPress={handleRequestStorage}
          />
          <FolderStep
            folderName={selectedFolder ? selectedFolder.name : null}
            isScanning={isScanning}
            songsFound={songsFound}
            onPress={handleSelectFolder}
          />
        </ScrollView>

        <View className="px-[22px] pt-3">
          <FooterCta ready={allReady} onPress={finish} />
        </View>
      </View>
    </View>
  );
}