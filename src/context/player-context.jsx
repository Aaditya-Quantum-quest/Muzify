import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { playbackQueue } from '../services/audio/PlaybackQueue';

export const OnboardingStep = {
  WELCOME: 'welcome',
  PERMISSIONS: 'permissions',
  DONE: 'done',
};

const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
  const [playerTheme, setPlayerTheme] = useState('player8');
  const [trackIdx, setTrackIdxState] = useState(0);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState('welcome');
  const [musicFolder, setMusicFolder] = useState('/Music');
  const [queue, setQueue] = useState([]);
  const [queueIdx, setQueueIdx] = useState(0);

  // Real queue only: nothing has been played yet until playSongs fills it.
  const track = queue.length ? queue[queueIdx] || queue[0] : null;

  useEffect(() => {
    playbackQueue.setCallbacks({
      onPlayingChange: setPlaying,
      onShuffleChange: setShuffle,
      onRepeatChange: setRepeat,
      onTrackChange: (trackObj, idx) => {
        setQueueIdx(idx);
        setTrackIdxState(idx);
        setPos(0);
      },
    });
    playbackQueue._ensureEngine?.();
    playbackQueue.engine?.ensureAudioSession?.();
    return () => {
      playbackQueue.setCallbacks({});
    };
  }, []);

  const togglePlay = useCallback(() => {
    playbackQueue.togglePlay();
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffle(playbackQueue.toggleShuffle());
  }, []);

  const toggleRepeat = useCallback(() => {
    setRepeat(playbackQueue.toggleRepeat());
  }, []);

  const goNext = useCallback(() => {
    playbackQueue.goNext();
  }, []);

  const goPrev = useCallback(() => {
    playbackQueue.goPrev();
  }, []);

  const playSongs = useCallback((songs, startIndex = 0) => {
    if (!Array.isArray(songs) || songs.length === 0) return;
    const safeIndex = Math.min(Math.max(0, startIndex), songs.length - 1);
    playbackQueue.setQueue(songs, safeIndex);
    setPlaying(true);
    setTimeout(() => {
      setQueue(songs);
      setQueueIdx(safeIndex);
      setTrackIdxState(safeIndex);
      setPos(0);
    }, 0);
  }, []);

  const setTrackFromIdx = useCallback((idx) => {
    playbackQueue.setTrackIdx(idx);
  }, []);

  const seekTo = useCallback((posSec) => {
    playbackQueue.seek(posSec);
  }, []);

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
        setTrackIdx: setTrackFromIdx,
        track,
        playing,
        setPlaying,
        togglePlay,
        pos,
        setPos,
        seekTo,
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
        queue,
        queueIdx,
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
