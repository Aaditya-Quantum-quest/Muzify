import { Platform } from 'react-native';
import {
  setAudioModeAsync,
  setIsAudioActiveAsync,
  requestNotificationPermissionsAsync,
} from 'expo-audio';

export const STATUS_UPDATE_INTERVAL = 250;

export const audioConfig = {
  playsInSilentMode: true,
  interruptionMode: 'doNotMix',
  shouldPlayInBackground: true,
  keepAudioSessionActive: true,
};

export async function configureAudioSession() {
  try {
    await setAudioModeAsync(audioConfig);
    if (Platform.OS === 'android' && typeof requestNotificationPermissionsAsync === 'function') {
      requestNotificationPermissionsAsync().catch((error) => {
        console.warn('[audioConfig] notification permission failed:', error);
      });
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
