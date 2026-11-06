import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, PanResponder } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

const ACCENT = '#ec5565';
const CARD_BG = '#3f2a2e';
const TRACK_H = 80;
const BASE = 70;
const AMP = 46;

const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));

const formatTime = (s) => {
  const total = Math.max(0, Math.floor(s));
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const sec = String(total % 60).padStart(2, '0');
  return `${m}:${sec}`;
};

// Builds one smooth wave layer from x = 0 to the playhead. The wave tapers
// toward the playhead so it settles into the progress line.
function wavePath(width, progressPx, layer, phase) {
  if (progressPx < 2 || width <= 0) return '';
  const pts = [];
  const scale = 400 / width;
  const progressU = progressPx * scale;
  for (let x = 0; x <= progressPx; x += 3) {
    const u = x * scale;
    const env = 0.55 + 0.45 * Math.sin((Math.PI * u) / 400);
    const taper = Math.min(1, (progressU - u) / 60);
    const crest =
      0.45 + 0.55 * Math.sin(u * (0.03 + layer * 0.006) + phase * (1 + layer * 0.4) + layer * 1.7);
    const drift = 0.7 + 0.3 * Math.sin(u * 0.012 + layer + phase * 0.3);
    const h = Math.max(0, AMP * env * taper * crest * drift);
    pts.push(`${x},${(BASE - h).toFixed(1)}`);
  }
  return `M0,${BASE} L${pts.join(' L')} L${progressPx},${BASE} Z`;
}

function RoundButton({ icon, label, onPress, size = 'md', active = false, ghost = false }) {
  const box = size === 'lg' ? 'h-[62px] w-[62px]' : ghost ? 'h-11 w-11' : 'h-14 w-14';
  const bg = ghost ? '' : 'bg-white/15 active:bg-white/25';
  const iconSize = size === 'lg' ? 26 : 22;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className={`${box} ${bg} items-center justify-center rounded-full`}
    >
      <Ionicons name={icon} size={iconSize} color={active ? '#ff8a96' : '#ffffff'} />
    </Pressable>
  );
}

export default function NowPlayingWidget({
  title = 'StarBoy',
  artist = 'The Weeknd',
  duration = 227,
  position = 0,
  isPlaying = false,
  shuffleOn = false,
  outputIcon = 'headset-outline',
  castIcon = 'volume-medium-outline',
  onPlayPause,
  onPrev,
  onNext,
  onShuffle,
  onClose,
  onSeek,
  className = '',
  isScreenActive = true,
}) {
  const [width, setWidth] = useState(0);
  const [phase, setPhase] = useState(0);
  const [dragP, setDragP] = useState(null);

  const widthRef = useRef(0);
  const dragRef = useRef(null);
  const startRef = useRef(0);
  const seekRef = useRef({ onSeek, duration });
  useEffect(() => {
    seekRef.current = { onSeek, duration };
  }, [onSeek, duration]);

  useEffect(() => {
    if (!isPlaying || !isScreenActive) return undefined;
    let raf;
    let last = 0;
    const tick = (now) => {
      if (now - last > 33) {
        last = now;
        setPhase((now / 1000) * 2.2);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, isScreenActive]);

  const [pan, setPan] = useState(null);
  useEffect(() => {
    setPan(
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          startRef.current = e.nativeEvent.locationX;
          const p = clamp(startRef.current / (widthRef.current || 1));
          dragRef.current = p;
          setDragP(p);
        },
        onPanResponderMove: (_, g) => {
          const p = clamp((startRef.current + g.dx) / (widthRef.current || 1));
          dragRef.current = p;
          setDragP(p);
        },
        onPanResponderRelease: () => {
          const { onSeek: seek, duration: d } = seekRef.current;
          if (seek && dragRef.current != null) seek(dragRef.current * d);
          dragRef.current = null;
          setDragP(null);
        },
        onPanResponderTerminate: () => {
          dragRef.current = null;
          setDragP(null);
        },
      })
    );
  }, []);

  const progress = dragP ?? clamp(duration > 0 ? position / duration : 0);
  const progressPx = progress * width;
  const shownTime = dragP != null ? dragP * duration : position;

  return (
    <View
      className={`w-full max-w-[600px] self-center rounded-[32px] px-6 pb-5 pt-4 ${className}`}
      style={{ backgroundColor: CARD_BG }}
    >
      <View className="flex-row items-center justify-between">
        <Ionicons name={outputIcon} size={20} color="#ffffffe6" />
        <Ionicons name={castIcon} size={20} color="#ffffffe6" />
      </View>

      <View className="mt-0.5 flex-row items-center justify-center">
        <View className="mr-2 h-4 w-4 items-center justify-center rounded-full bg-white">
          <Ionicons name="play" size={9} color={CARD_BG} style={{ marginLeft: 1 }} />
        </View>
        <Text className="text-[15px] font-medium text-white" numberOfLines={1}>
          {title}
        </Text>
        <Text className="mx-2 text-[15px] text-white/70">•</Text>
        <Text className="text-[15px] font-medium text-white" numberOfLines={1}>
          {artist}
        </Text>
      </View>

      <View
        className="mt-2"
        style={{ height: TRACK_H }}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          widthRef.current = w;
          setWidth(w);
        }}
        {...(pan?.panHandlers ?? {})}
      >
        {width > 0 && (
          <Svg width={width} height={TRACK_H} pointerEvents="none">
            <Rect x={0} y={BASE} width={width} height={4} rx={2} fill="#ffffff52" />
            <Path d={wavePath(width, progressPx, 2, phase + 2.6)} fill={ACCENT} fillOpacity={0.3} />
            <Path d={wavePath(width, progressPx, 1, phase + 1.3)} fill={ACCENT} fillOpacity={0.5} />
            <Path d={wavePath(width, progressPx, 0, phase)} fill={ACCENT} fillOpacity={0.9} />
            <Rect x={0} y={BASE} width={progressPx} height={4} rx={2} fill={ACCENT} />
          </Svg>
        )}
        <View
          pointerEvents="none"
          className="absolute h-4 w-4 rounded-full border-2 border-white"
          style={{ backgroundColor: ACCENT, left: progressPx - 8, top: BASE + 2 - 8 }}
        />
      </View>

      <View className="mt-1 flex-row justify-between">
        <Text className="text-xs text-white/85">{formatTime(shownTime)}</Text>
        <Text className="text-xs text-white/85">{formatTime(duration)}</Text>
      </View>

      <View className="mt-3 flex-row items-center justify-between px-1">
        <RoundButton ghost icon="shuffle" label="Shuffle" active={shuffleOn} onPress={onShuffle} />
        <RoundButton icon="play-skip-back" label="Previous" onPress={onPrev} />
        <RoundButton
          size="lg"
          icon={isPlaying ? 'pause' : 'play'}
          label={isPlaying ? 'Pause' : 'Play'}
          onPress={onPlayPause}
        />
        <RoundButton icon="play-skip-forward" label="Next" onPress={onNext} />
        <RoundButton ghost icon="close" label="Close" onPress={onClose} />
      </View>
    </View>
  );
}