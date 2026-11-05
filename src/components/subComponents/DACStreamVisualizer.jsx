
import React, { useEffect, useRef, useState } from "react";

import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";


/* ───────────── constants ───────────── */

const GOLD = "#d9a362";

const MONO = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

const CAPSULES = [
  { id: 0, color: "#A07E52", w: 20, max: 48, label: "Sub" },
  { id: 1, color: "#D99B26", w: 18, max: 42, label: "Bass 1" },
  { id: 2, color: "#E5BF88", w: 20, max: 46, label: "Bass 2" },
  { id: 3, color: "#C9A170", w: 18, max: 40, label: "Low Mid" },
  { id: 4, color: "#EBD2B2", w: 16, max: 36, label: "Mid 1" },
  { id: 5, color: "#E8A2A8", w: 18, max: 44, label: "Mid 2" },
  { id: 6, color: "#D90038", w: 22, max: 52, label: "High Mid" },
  { id: 7, color: "#E5A962", w: 20, max: 46, label: "Presence" },
  { id: 8, color: "#9E7A52", w: 18, max: 38, label: "High 1" },
  { id: 9, color: "#D99B26", w: 18, max: 42, label: "High 2" },
  { id: 10, color: "#E5BF88", w: 18, max: 40, label: "Treble" },
  { id: 11, color: "#7E756B", w: 22, max: 48, label: "Air" },
];


const BAR_AREA_H = 80;

// Limit React updates to approximately 30 FPS.
const FRAME_INTERVAL = 1000 / 30;

/* ───────────── optimized animation hook ───────────── */

function useSpectrum(isPlaying, jitter, active = true) {
  const jitterRef = useRef(jitter);

  const currentHeights = useRef(
    CAPSULES.map((cap) => cap.max * 0.5)
  );

  const [frame, setFrame] = useState({
    heights: CAPSULES.map((cap) => cap.max * 0.5),
    glows: CAPSULES.map(() => 0.5),
    pulse: 1,
  });

  // Update jitter without restarting the animation loop.
  useEffect(() => {
    jitterRef.current = jitter;
  }, [jitter]);

  useEffect(() => {
    // Don't start animation when paused or screen is inactive.
    if (!isPlaying || !active) {
      return undefined;
    }

    let rafId = null;
    let time = 0;
    let step = 0;
    let lastFrameTime = 0;

    const loop = (timestamp) => {
      // Skip unnecessary React updates.
      if (timestamp - lastFrameTime >= FRAME_INTERVAL) {
        lastFrameTime = timestamp;

        time += 0.08;
        step += 1;

        const heights = CAPSULES.map((cap, i) => {
          const wave1 = Math.sin(time * 3.0 + i * 0.7) * 0.35;

          const wave2 = Math.cos(time * 5.2 - i * 0.4) * 0.25;

          const rhythm =
            step % (i % 2 === 0 ? 10 : 14) === 0
              ? 0.4
              : 0;

          const noise =
            (Math.random() - 0.5) *
            (jitterRef.current * 0.18);

          const scale = Math.max(
            0.18,
            Math.min(1, 0.4 + wave1 + wave2 + rhythm + noise)
          );

          const target = cap.max * scale;

          // Smooth movement.
          currentHeights.current[i] +=
            (target - currentHeights.current[i]) * 0.5;

          return currentHeights.current[i];
        });

        const glows = heights.map((height, i) =>
          Math.min(
            1,
            Math.max(0.2, height / CAPSULES[i].max)
          )
        );

        setFrame({
          heights,
          glows,
          pulse: 0.55 + 0.45 * Math.sin(time * 1.6),
        });
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    // Always cancel the animation on cleanup.
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
  }, [isPlaying, active]);

  return frame;
}

/* ───────────── DAC stream banner ───────────── */

export function AcousticDacStream({
  sampleRate = "Direct DSD 5.6MHz",
  headroom = 4.2,
  jitter = 0.8,
  isPlaying = true,
  active = true,
  onToggle,
}) {
  const { heights, glows, pulse } = useSpectrum(
    isPlaying,
    jitter,
    active
  );

  const isAnimating = isPlaying && active;

  return (
    <View className="w-full overflow-hidden rounded-2xl border border-neutral-800 bg-[#0d0d0f] p-5">

      {/* Top row */}

      <View className="mb-5 flex-row items-center justify-between">

        <View
          className="flex-1 flex-row items-center"
          style={{ gap: 10 }}
        >
          <View
            style={{
              height: 10,
              width: 10,
              borderRadius: 5,
              backgroundColor: GOLD,
              opacity: isAnimating ? pulse : 0.4,
              shadowColor: GOLD,
              shadowOpacity: isAnimating ? 0.9 : 0,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 0 },
              elevation: isAnimating ? 4 : 0,
            }}
          />

          <Text
            className="font-bold uppercase"
            numberOfLines={1}
            style={{
              color: GOLD,
              fontFamily: MONO,
              fontSize: 13,
              letterSpacing: 2.4,
            }}
          >
            Acoustic DAC Stream
          </Text>
        </View>

        <Text
          className="text-xs font-medium text-neutral-400"
          style={{
            fontFamily: MONO,
            letterSpacing: 1,
          }}
        >
          {sampleRate}
        </Text>

      </View>

      {/* Animated capsules */}

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onToggle}
        disabled={!onToggle}
        className="flex-row items-center justify-between px-1"
        style={{ height: BAR_AREA_H }}
      >
        {CAPSULES.map((cap, i) => (
          <View
            key={cap.id}
            className="flex-1 items-center justify-center"
            style={{ height: BAR_AREA_H }}
          >
            <View
              style={{
                height: heights[i],
                width: cap.w,
                borderRadius: cap.w / 2,
                backgroundColor: cap.color,
                shadowColor: cap.color,
                shadowOpacity: 0.65,
                shadowRadius: 10 * glows[i],
                shadowOffset: { width: 0, height: 0 },
                elevation: 3,
              }}
            />
          </View>
        ))}
      </TouchableOpacity>

      {/* Bottom readout */}

      <View className="mt-5 flex-row items-center justify-between border-t border-neutral-900 pt-4">

        <Text
          className="text-xs text-neutral-400"
          style={{ fontFamily: MONO }}
        >
          Headroom:{" "}
          <Text className="font-semibold text-neutral-200">
            +{headroom.toFixed(1)} dB
          </Text>
        </Text>

        <Text
          className="text-xs text-neutral-400"
          style={{ fontFamily: MONO }}
        >
          Jitter:{" "}
          <Text className="font-semibold text-neutral-200">
            {"< "}
            {jitter.toFixed(1)} ps RMS
          </Text>
        </Text>

      </View>

    </View>
  );
}

/* ───────────── main screen ───────────── */

export default function DACStreamVisualizer({
  active = true,
}) {
  const insets = useSafeAreaInsets();

  const [isPlaying, setIsPlaying] = useState(true);

  const [sampleRate, setSampleRate] = useState(
    "Direct DSD 5.6MHz"
  );

  const [headroom, setHeadroom] = useState(4.2);

  const [jitter, setJitter] = useState(0.8);




  return (
    <View
      className="flex-1 bg-[#070708]"
      style={{ paddingTop: insets.top }}
    >


      {/* Content */}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: insets.bottom + 40,
          gap: 16,
        }}
      >

        <AcousticDacStream
          sampleRate={sampleRate}
          headroom={headroom}
          jitter={jitter}
          isPlaying={isPlaying}
          active={active}
          onToggle={() =>
            setIsPlaying((previous) => !previous)
          }
        />

        {/* Presets */}

     

      </ScrollView>

    </View>
  );
}
