import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, PanResponder, StyleSheet } from 'react-native';
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
  const box = size === 'lg' ? styles.btnLg : ghost ? styles.btnSm : styles.btnMd;
  const bg = ghost ? null : styles.btnBg;
  const iconSize = size === 'lg' ? 26 : 22;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        box,
        bg,
        pressed && !ghost && styles.btnPressed,
      ]}
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
  style: extraStyle,
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
      style={[styles.root, extraStyle]}
    >
      <View style={styles.topRow}>
        <Ionicons name={outputIcon} size={20} color="#ffffffe6" />
        <Ionicons name={castIcon} size={20} color="#ffffffe6" />
      </View>

      <View style={styles.titleRow}>
        <View style={styles.playDot}>
          <Ionicons name="play" size={9} color={CARD_BG} style={{ marginLeft: 1 }} />
        </View>
        <Text style={styles.titleText} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.dotText}>•</Text>
        <Text style={styles.titleText} numberOfLines={1}>
          {artist}
        </Text>
      </View>

      <View
        style={[styles.track, { height: TRACK_H }]}
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
          style={[
            styles.playhead,
            { backgroundColor: ACCENT, left: progressPx - 8, top: BASE + 2 - 8 },
          ]}
        />
      </View>

      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{formatTime(shownTime)}</Text>
        <Text style={styles.timeText}>{formatTime(duration)}</Text>
      </View>

      <View style={styles.controls}>
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

const styles = StyleSheet.create({
  root: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    borderRadius: 32,
    paddingHorizontal: 24,
    paddingBottom: 20,
    paddingTop: 16,
    backgroundColor: CARD_BG,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playDot: {
    marginRight: 8,
    height: 16,
    width: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    backgroundColor: '#ffffff',
  },
  titleText: { fontSize: 15, fontWeight: '500', color: '#ffffff' },
  dotText: { marginHorizontal: 8, fontSize: 15, color: 'rgba(255,255,255,0.7)' },
  track: { marginTop: 8 },
  playhead: {
    position: 'absolute',
    height: 16,
    width: 16,
    borderRadius: 9999,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  timeRow: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: { fontSize: 12, color: 'rgba(255,255,255,0.85)' },
  controls: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
  },
  btnLg: { height: 62, width: 62 },
  btnMd: { height: 56, width: 56 },
  btnSm: { height: 44, width: 44 },
  btnBg: { backgroundColor: 'rgba(255,255,255,0.15)' },
  btnPressed: { backgroundColor: 'rgba(255,255,255,0.25)' },
});