import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useIsFocused } from "expo-router";
import {
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowRight, AudioLines, Bell, Check, Folder, Music } from "lucide-react-native";
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
} from "expo-audio";

import * as FileSystem from "expo-file-system/legacy";
import { getSetting, saveSetting } from "../databases/queries/settings";
import { AUDIO_VISUALIZER_SETTING } from "../services/audio/audioConfig";

/*
 * Performance notes
 * - useIsFocused: nothing renders while the screen is not focused. State lives in
 *   this component, so progress is kept when the screen comes back.
 * - Static page: no Animated, no ActivityIndicator, no ripple, no layout animation.
 *   Press feedback is an instant opacity change (activeOpacity), not an animation.
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
const TOTAL_STEPS = 4;

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
    <View style={styles.step}>
      {/* rail */}
      <View style={styles.rail}>
        <View
          style={[
            styles.railDot,
            done ? styles.railDotDone : styles.railDotIdle,
          ]}
        >
          {done ? (
            <Check size={16} color={INK} strokeWidth={3} />
          ) : (
            <Text
              style={[styles.stepIndex, { fontFamily: FONT_REGULAR }]}
            >
              {index}
            </Text>
          )}
        </View>
        {!isLast && (
          <View
            style={[
              styles.railLine,
              done ? styles.railLineDone : styles.railLineIdle,
            ]}
          />
        )}
      </View>

      {/* body */}
      <View style={[styles.stepBody, isLast ? styles.stepBodyLast : styles.stepBodyNotLast]}>
        <View style={styles.stepHeader}>
          <Text
            style={[styles.stepTitle, { fontFamily: FONT_MEDIUM }]}
          >
            {title}
          </Text>
          <Icon size={20} color={ICON_MUTED} strokeWidth={2} />
        </View>
        <Text
          style={[styles.stepDesc, { fontFamily: FONT_REGULAR }]}
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
  disabled = false,
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      activeOpacity={0.7}
      style={[
        styles.outlineBtn,
        secondary ? styles.outlineBtnSecondary : styles.outlineBtnPrimary,
      ]}
    >
      <Text
        style={[
          styles.outlineText,
          secondary ? styles.outlineTextSecondary : styles.outlineTextPrimary,
          { fontFamily: FONT_MEDIUM },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
});

const GrantedRow = memo(function GrantedRow({ label }) {
  return (
    <View style={styles.grantedRow}>
      <Check size={16} color={ACCENT} strokeWidth={3} />
      <Text
        style={[styles.grantedText, { fontFamily: FONT_MEDIUM }]}
      >
        {label}
      </Text>
    </View>
  );
});

/* ------------------------------- header ------------------------------- */

const Progress = memo(function Progress({ doneCount }) {
  return (
    <View style={styles.progress}>
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={[
            styles.progressBar,
            i < doneCount ? styles.progressBarOn : styles.progressBarOff,
          ]}
        />
      ))}
      <Text
        style={[styles.progressText, { fontFamily: FONT_REGULAR }]}
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
        style={[styles.headline, { fontFamily: FONT_MEDIUM }]}
      >
        {"Permissions\nand access"}
      </Text>
      <Text
        style={[styles.subhead, { fontFamily: FONT_REGULAR }]}
      >
        Grant permissions to play music seamlessly, choose your music folder,
        and optionally enable the live song visualizer.
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

const AudioSamplingStep = memo(function AudioSamplingStep({
  enabled,
  permissionGranted,
  requesting,
  onPress,
}) {
  const isEnabled = enabled && permissionGranted;

  return (
    <Step
      index={3}
      title="Live song visualizer"
      Icon={AudioLines}
      description="Analyze the song playing in Muzify to animate the visualizer. Audio is processed on this device and is never recorded or saved."
      done={isEnabled}
    >
      <OutlineButton
        label={
          requesting
            ? "Requesting audio access..."
            : isEnabled
              ? "Disable live visualizer"
              : "Enable live visualizer"
        }
        onPress={onPress}
        secondary={isEnabled}
        disabled={requesting}
      />
      {isEnabled ? (
        <GrantedRow label="Live song analysis enabled" />
      ) : null}
    </Step>
  );
});

const FolderStep = memo(function FolderStep({
  index = 3,
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
      index={index}
      title="Select music folder"
      Icon={Music}
      description="Select the folder containing your songs to scan and populate your library."
      done={hasFolder}
      isLast
    >
      {hasFolder ? (
        <>
          <View style={styles.folderCard}>
            <Folder size={18} color={ACCENT} strokeWidth={2} />
            <Text
              numberOfLines={1}
              style={[styles.folderName, { fontFamily: FONT_MEDIUM }]}
            >
              {label}
            </Text>
          </View>

          {isScanning && (
            <View style={styles.statusRow}>
              <View style={styles.scanDot} />
              <Text
                style={[styles.statusText, { fontFamily: FONT_REGULAR }]}
              >
                {`Scanning ${label} for songs…`}
              </Text>
            </View>
          )}

          {songsFound !== null && !isScanning && (
            <View style={styles.statusRow}>
              <Check size={16} color={ACCENT} strokeWidth={3} />
              <Text
                style={[styles.statusText, { fontFamily: FONT_REGULAR }]}
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
      activeOpacity={0.85}
      style={[styles.cta, ready ? styles.ctaReady : styles.ctaIdle]}
    >
      <Text
        style={[
          styles.ctaText,
          ready ? styles.ctaTextReady : styles.ctaTextIdle,
          { fontFamily: FONT_MEDIUM },
        ]}
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
  const [audioSamplingEnabled, setAudioSamplingEnabled] = useState(
    () => getSetting(AUDIO_VISUALIZER_SETTING) === "true",
  );
  const [audioSamplingPermissionGranted, setAudioSamplingPermissionGranted] =
    useState(Platform.OS !== "android");
  const [requestingAudioSampling, setRequestingAudioSampling] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "android") return undefined;
    let mounted = true;
    getRecordingPermissionsAsync()
      .then(({ granted }) => {
        if (mounted) setAudioSamplingPermissionGranted(granted);
      })
      .catch((error) => {
        console.warn("Audio sampling permission lookup failed:", error);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleRequestNotification = useCallback(async () => {
    setNotificationGranted(await requestNotificationPermission());
  }, []);

  const handleRequestStorage = useCallback(async () => {
    const granted = await requestStoragePermission();
    if (granted !== null) setStorageGranted(granted);
  }, []);

  const handleToggleAudioSampling = useCallback(async () => {
    if (audioSamplingEnabled && audioSamplingPermissionGranted) {
      saveSetting(AUDIO_VISUALIZER_SETTING, "false");
      setAudioSamplingEnabled(false);
      return;
    }

    setRequestingAudioSampling(true);
    try {
      const granted =
        Platform.OS === "android"
          ? audioSamplingPermissionGranted ||
            (await requestRecordingPermissionsAsync()).granted
          : true;

      setAudioSamplingPermissionGranted(granted);
      if (granted) {
        saveSetting(AUDIO_VISUALIZER_SETTING, "true");
        setAudioSamplingEnabled(true);
      }
    } catch (error) {
      console.warn("Audio sampling permission request failed:", error);
    } finally {
      setRequestingAudioSampling(false);
    }
  }, [audioSamplingEnabled, audioSamplingPermissionGranted]);

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
    (notificationGranted ? 1 : 0) +
    (storageGranted ? 1 : 0) +
    (audioSamplingEnabled && audioSamplingPermissionGranted ? 1 : 0) +
    (hasFolder ? 1 : 0);

  // Keep the latest values reachable from a stable callback.
  const finish = useCallback(() => {
    if (allReady) onFinish?.(selectedFolder);
  }, [allReady, onFinish, selectedFolder]);

  // Hooks above always run; nothing is rendered while the screen is unfocused.
  if (!isFocused) return null;

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top, paddingBottom: insets.bottom + 16 },
      ]}
    >
      <View style={styles.container}>
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
          <AudioSamplingStep
            enabled={audioSamplingEnabled}
            permissionGranted={audioSamplingPermissionGranted}
            requesting={requestingAudioSampling}
            onPress={handleToggleAudioSampling}
          />
          <FolderStep
            index={4}
            folderName={selectedFolder ? selectedFolder.name : null}
            isScanning={isScanning}
            songsFound={songsFound}
            onPress={handleSelectFolder}
          />
        </ScrollView>

        <View style={styles.footer}>
          <FooterCta ready={allReady} onPress={finish} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0b0a09" },
  container: { width: "100%", maxWidth: 560, flex: 1, alignSelf: "center" },
  footer: { paddingHorizontal: 22, paddingTop: 12 },

  step: { flexDirection: "row", gap: 16 },
  rail: { width: 36, alignItems: "center" },
  railDot: {
    height: 36,
    width: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9999,
    borderWidth: 1,
  },
  railDotDone: { borderColor: "#e49f33", backgroundColor: "#e49f33" },
  railDotIdle: { borderColor: "rgba(255,255,255,0.2)" },
  railLine: { marginVertical: 8, width: 1, flex: 1 },
  railLineDone: { backgroundColor: "#e49f33" },
  railLineIdle: { backgroundColor: "rgba(255,255,255,0.12)" },
  stepBody: { flex: 1 },
  stepBodyLast: { paddingBottom: 6 },
  stepBodyNotLast: { paddingBottom: 30 },
  stepHeader: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepIndex: { fontSize: 14, color: "#f4efe6" },
  stepTitle: { fontSize: 19, color: "#f4efe6" },
  stepDesc: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    color: "#9a9186",
  },

  outlineBtn: {
    marginTop: 16,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
  },
  outlineBtnSecondary: { height: 44, borderColor: "rgba(255,255,255,0.12)" },
  outlineBtnPrimary: { height: 48, borderColor: "rgba(255,255,255,0.22)" },
  outlineText: { fontSize: 14 },
  outlineTextSecondary: { color: "#b3a794" },
  outlineTextPrimary: { color: "#f4efe6" },

  grantedRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  grantedText: { fontSize: 14, color: "#e49f33" },

  progress: {
    marginBottom: 28,
    marginTop: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  progressBar: { height: 3, flex: 1, borderRadius: 2 },
  progressBarOn: { backgroundColor: "#e49f33" },
  progressBarOff: { backgroundColor: "rgba(255,255,255,0.12)" },
  progressText: { marginLeft: 8, fontSize: 13, color: "#9a9186" },

  headline: { fontSize: 34, lineHeight: 38, color: "#f4efe6" },
  subhead: { marginTop: 10, fontSize: 14, lineHeight: 21, color: "#9a9186" },

  folderCard: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    backgroundColor: "rgba(228,159,51,0.1)",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  folderName: { flex: 1, fontSize: 13, color: "#f0c277" },
  statusRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  scanDot: {
    height: 7,
    width: 7,
    borderRadius: 9999,
    backgroundColor: "#e49f33",
  },
  statusText: { flex: 1, fontSize: 13, color: "#b3a794" },

  cta: {
    height: 56,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 18,
  },
  ctaReady: { backgroundColor: "#e49f33" },
  ctaIdle: { backgroundColor: "rgba(255,255,255,0.07)" },
  ctaText: { fontSize: 15 },
  ctaTextReady: { color: "#14100a" },
  ctaTextIdle: { color: "#8d857a" },
});
