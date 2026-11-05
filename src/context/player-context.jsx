import React, {
  createContext,
  useContext,
  useState,
  useEffect,
} from 'react';
import { playbackQueue } from '../services/audio/PlaybackQueue';

export const OnboardingStep = {
  WELCOME: 'welcome',
  PERMISSIONS: 'permissions',
  DONE: 'done',
};

const TRACKS = [
  { id: '1', title: 'Midnight Drive', artist: 'Nova Lane', duration: 214 },
  { id: '2', title: 'Golden Hour', artist: 'Mira Vale', duration: 187 },
  { id: '3', title: 'Neon Rain', artist: 'The Static', duration: 221 },
  { id: '4', title: 'Low Tide', artist: 'Kairo', duration: 176 },
  { id: '5', title: 'Wildflower', artist: 'Harbor', duration: 199 },
  { id: '6', title: 'Paper Planes', artist: 'Lumen', duration: 205 },
];

const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
  const [playerTheme, setPlayerTheme] = useState('player8');
  const [trackIdx, setTrackIdxState] = useState(0);
  const [pos, setPos] = useState(76);
  const [playing, setPlaying] = useState(true);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState('welcome');
  const [musicFolder, setMusicFolder] = useState('/Music');
  // Real-library queue. When empty the player falls back to TRACKS so the
  // UI never shows a broken "now playing" bar before a scan has run.
  const [queue, setQueue] = useState([]);
  const [queueIdx, setQueueIdx] = useState(0);

  const track = queue.length
    ? queue[queueIdx] || queue[0]
    : TRACKS[trackIdx] || TRACKS[0];

  // Real playback – connect to PlaybackQueue on mount.
  useEffect(() => {
    // Register callbacks to sync context state with the native engine.
    playbackQueue.setCallbacks({
      onPlayingChange: setPlaying,
      onPosChange: setPos,
      onTrackChange: (trackObj, idx) => {
        // When a new track is loaded, update local indices.
        setQueueIdx(idx);
        setTrackIdxState(idx);
        setPos(0);
      },
      onDurationChange: (duration) => {
        // No direct state stored for duration; the UI reads it via track.duration.
      },
    });
    // Ensure the engine is ready (configures audio session).
    playbackQueue._ensureEngine?.(); // initialize lazily.
    return () => {
      playbackQueue.destroy();
    };
  }, []);

  const togglePlay = () => playbackQueue.togglePlay();
  const toggleShuffle = () => playbackQueue.toggleShuffle();
  const toggleRepeat = () => playbackQueue.toggleRepeat();

  const goNext = () => {
    playbackQueue.goNext();
  };

  const goPrev = () => {
    playbackQueue.goPrev();
  };

  // Replace the active queue with real songs from the library.
  // `songs` is an array of song records (as returned by the song queries).
  // `startIndex` picks which song starts playing.
  const playSongs = async (songs, startIndex = 0) => {
    if (!Array.isArray(songs) || songs.length === 0) return;
    const safeIndex = Math.min(
      Math.max(0, startIndex),
      songs.length - 1
    );
    // Set the queue and start playback at the requested index.
    await playbackQueue.setQueue(songs, safeIndex);
      setQueue(songs); // sync local queue for UI
      setQueueIdx(safeIndex);
  };

  // For UI elements that need to jump to a specific track (e.g., queue selection).
  // Explicit callbacks to change JSI queue index and position if called directly.
  const setTrackFromIdx = (idx) => playbackQueue.setTrackIdx(idx);
  const seekTo = (posSec) => playbackQueue.seek(posSec);


  const completeOnboarding = (folder) => {
    if (folder) setMusicFolder(folder);
    setOnboardingStep('done');
  };

  const resetOnboarding = () => {
    setOnboardingStep('welcome');
  };

  return (
    <PlayerContext.Provider
      value={{
        playerTheme,
        setPlayerTheme,
        trackIdx,
        setTrackIdxState,
        setTrackIdx: setTrackIdxState,
        track,
        playing,
        setPlaying,
        togglePlay,
        pos,
        setPos,
        shuffle,
        toggleShuffle,
        repeat,
        toggleRepeat,
        goNext,
        goPrev,
        listOpen,
        setListOpen,
        onboardingStep,
        setOnboardingStep,
        musicFolder,
        setMusicFolder,
        playSongs,
        completeOnboarding,
        resetOnboarding,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);

  if (!context) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }

  return context;
}