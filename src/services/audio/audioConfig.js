import { Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  setAudioModeAsync,
  setIsAudioActiveAsync,
  requestNotificationPermissionsAsync,
} from 'expo-audio';

export const STATUS_UPDATE_INTERVAL = 250;
export const AUDIO_VISUALIZER_SETTING = 'audio_visualizer_enabled';

// `Constants.appOwnership` is deprecated and returns null in current Expo Go
// builds, so also fall back to `executionEnvironment` (Expo Go reports
// 'storeClient').
const isExpoGo =
  Constants.appOwnership === 'expo' ||
  Constants.executionEnvironment === 'storeClient';

export const audioConfig = {
  playsInSilentMode: true,
  interruptionMode: 'doNotMix',
  shouldPlayInBackground: !isExpoGo,
  keepAudioSessionActive: !isExpoGo,
};

export async function configureAudioSession() {
  try {
    await setAudioModeAsync(audioConfig);
    if (
      Platform.OS === 'android' &&
      !isExpoGo &&
      typeof requestNotificationPermissionsAsync === 'function'
    ) {
      requestNotificationPermissionsAsync().catch(() => {});
    }
    return true;
  } catch (error) {
    console.warn('[audioConfig] setAudioModeAsync failed:', error);
    return false;
  }
}

export async function deactivateAudioSession() {
  try {
    await setIsAudioActiveAsync(false);
  } catch (error) {
    console.warn('[audioConfig] setIsAudioActiveAsync failed:', error);
  }
}
