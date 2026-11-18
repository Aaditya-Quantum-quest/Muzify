import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';

import DynamicNotch from './DynamicNotch';
import { usePlayer } from '../../context/player-context';
import { playbackQueue } from '../../services/audio/PlaybackQueue';

/*
 * Mounts DynamicNotch once for the whole app (root layout), fed by the real
 * player instead of its built-in demo.
 *
 * Why one host rather than a notch per screen: the island owns a 25 Hz hill
 * clock, a palette-extraction cache and hardware-volume listeners. Remounting
 * it on every navigation would drop the palette and re-seed those listeners on
 * each tab switch — the exact kind of hitch that shows up mid-animation. As a
 * sibling of <Stack> it floats above every route, so it is on "each screen"
 * without ever being mounted twice.
 */

// Queue rows are SQLite song records, while mix callers hand over lighter
// objects — same field probing the MiniPlayer already relies on.
const pickArt = (song) =>
  song?.artwork_uri ??
  song?.art ??
  song?.artwork ??
  song?.cover ??
  song?.thumbnail ??
  song?.albumArt ??
  null;

const readPosition = () => Number(playbackQueue.getCurrentPosition?.()) || 0;

function DynamicNotchHost({ top = 10 }) {
  const { track, playing, seekTo } = usePlayer();
  const [pos, setPos] = useState(0);

  // The context only resets `pos` on track change, so read the engine on an
  // interval like the MiniPlayer does. One sync also runs when playback stops,
  // otherwise the island would keep showing where the last tick landed.
  useEffect(() => {
    setPos(readPosition());
    if (!playing) return undefined;
    const id = setInterval(() => setPos(readPosition()), 250);
    return () => clearInterval(id);
  }, [playing]);

  const trackId = track?.id;
  const art = pickArt(track);
  const notchTrack = useMemo(() => {
    if (!track) return null;
    return { title: track.title, artist: track.artist, art };
  }, [Boolean(track), track?.id, track?.title, track?.artist, art]);

  useEffect(() => {
    // Zero, not readPosition(): the engine may still report the previous
    // track's offset for a frame after a queue jump.
    setPos(0);
  }, [trackId]);

  const duration =
    Number(track?.duration) > 0
      ? Number(track.duration)
      : Number(playbackQueue.engine?.getDuration?.()) || 1;

  const handleSeek = useCallback(
    (seconds) => {
      seekTo?.(seconds);
    },
    [seekTo],
  );

  if (!track) return null;

  return (
    <DynamicNotch
      track={notchTrack}
      playing={!!playing}
      position={pos}
      duration={duration}
      onSeek={handleSeek}
      top={top}
    />
  );
}

export default memo(DynamicNotchHost);
