import React, { useState, useEffect, useMemo } from 'react';
import { useIsFocused } from "expo-router";
import {
  Svg,
  Path,
  Circle,
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import {
  View,
  Text,
  Dimensions,
  Animated,
  PanResponder,
  TouchableOpacity,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Music } from 'lucide-react-native';


const { width: SW, height: SH } = Dimensions.get('window');

const SLIDER_WIDTH = Math.min(SW - 68, 300);
const KNOB_SIZE = 48;
const MAX_DRAG = SLIDER_WIDTH - KNOB_SIZE - 10;

// Hero disc scales with the screen so it never collides with the bottom panel
const DISC_SIZE = Math.min(SW * 0.7, SH * 0.31, 290);


// Decorative vinyl record (pure UI, uses react-native-svg already in the project)
function VinylDisc({ size }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Defs>
        <LinearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#8a5cff" />
          <Stop offset="1" stopColor="#2ad0ff" />
        </LinearGradient>
        <LinearGradient id="label" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#6b45cd" />
          <Stop offset="1" stopColor="#2ad0ff" />
        </LinearGradient>
        <RadialGradient id="body" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#1c1546" />
          <Stop offset="1" stopColor="#07051a" />
        </RadialGradient>
      </Defs>

      <Circle cx="100" cy="100" r="97" fill="url(#body)" stroke="url(#rim)" strokeWidth="2.5" />

      {[88, 80, 72, 64, 56, 48].map((r) => (
        <Circle
          key={r}
          cx="100"
          cy="100"
          r={r}
          fill="none"
          stroke="#ffffff"
          strokeOpacity={0.06}
          strokeWidth={1}
        />
      ))}

      {/* Light sheen */}
      <Path d="M100 100 L100 5 A95 95 0 0 1 175 42 Z" fill="#ffffff" fillOpacity={0.07} />
      <Path d="M100 100 L100 195 A95 95 0 0 1 25 158 Z" fill="#ffffff" fillOpacity={0.05} />

      {/* Center label */}
      <Circle cx="100" cy="100" r="34" fill="url(#label)" />
      <Circle cx="100" cy="100" r="34" fill="none" stroke="#ffffff" strokeOpacity={0.35} strokeWidth="1.5" />
      <Circle cx="100" cy="100" r="22" fill="none" stroke="#ffffff" strokeOpacity={0.25} strokeWidth="1" />
      <Circle cx="100" cy="100" r="5" fill="#05040f" />
    </Svg>
  );
}


export default function WelcomeScreen({ onGetStarted }) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();


  // Equalizer animation
  const [eqAnim] = useState(() => new Animated.Value(0));

  // Slider drag animation
  const [dragX] = useState(() => new Animated.Value(0));

  // Floating note animations
  const [note1Y] = useState(() => new Animated.Value(0));
  const [note2Y] = useState(() => new Animated.Value(0));
  const [note3Y] = useState(() => new Animated.Value(0));

  // Star twinkling animation
  const [starOpacity] = useState(() => new Animated.Value(0.4));


useEffect(() => {
  if (!isFocused) return;

  // Keep all your existing animation code here.
    // Equalizer loop
    const eqLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(eqAnim, {
          toValue: 1,
          duration: 450,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(eqAnim, {
          toValue: 0,
          duration: 450,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    );
    eqLoop.start();


    // Floating notes
    const createNoteAnim = (val, dur) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, {
            toValue: -120,
            duration: dur,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );


    const anim1 = createNoteAnim(note1Y, 7000);
    const anim2 = createNoteAnim(note2Y, 9000);
    const anim3 = createNoteAnim(note3Y, 6000);

    anim1.start();
    anim2.start();
    anim3.start();


    // Star twinkle
    const starLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(starOpacity, {
          toValue: 0.9,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(starOpacity, {
          toValue: 0.3,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    );
    starLoop.start();


   return () => {
  eqLoop.stop();
  anim1.stop();
  anim2.stop();
  anim3.stop();
  starLoop.stop();
};
}, [isFocused, eqAnim, note1Y, note2Y, note3Y, starOpacity]);


  // PanResponder for Slide to Get Started
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,

        onPanResponderMove: (_, gestureState) => {
          const newX = Math.max(0, Math.min(gestureState.dx, MAX_DRAG));
          dragX.setValue(newX);
        },

        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx >= MAX_DRAG * 0.7) {
            Animated.timing(dragX, {
              toValue: MAX_DRAG,
              duration: 150,
              useNativeDriver: false,
            }).start(() => {
              onGetStarted();
            });
          } else {
            Animated.spring(dragX, {
              toValue: 0,
              friction: 5,
              tension: 40,
              useNativeDriver: false,
            }).start();
          }
        },
      }),
    [dragX, onGetStarted]
  );


  // Equalizer spectrum heights
  const bars = [
    18, 32, 45, 60, 48, 55, 38, 52, 64, 42, 58, 36, 48, 30, 22,
  ];


  // Static twinkling stars positions
  const stars = [
    { x: 30, y: 120, s: 2 },
    { x: 80, y: 80, s: 1.5 },
    { x: 150, y: 150, s: 2.2 },
    { x: 220, y: 90, s: 1.8 },
    { x: 300, y: 140, s: 2 },
    { x: 70, y: 220, s: 1.6 },
    { x: 290, y: 260, s: 2.4 },
    { x: 320, y: 340, s: 1.5 },
    { x: 40, y: 380, s: 2 },
  ];


  return (
    <View className="relative flex-1 overflow-hidden bg-[#05040f]">
      {/* Background Aurora Orbs */}
      <View
        pointerEvents="none"
        className="absolute -left-20 top-[140px] h-[280px] w-[280px] rounded-full bg-[#6b45cd]/45"
      />

      <View
        pointerEvents="none"
        className="absolute -right-20 top-[360px] h-[260px] w-[260px] rounded-full bg-[#2ad0ff]/35"
      />

      <View
        pointerEvents="none"
        className="absolute -top-10 left-10 h-[240px] w-[240px] rounded-full bg-[#294dce]/30"
      />

      {/* Twinkling stars */}
      {stars.map((st, i) => (
        <Animated.View
          key={i}
          className="absolute bg-white"
          style={{
            left: st.x,
            top: st.y + insets.top,
            width: st.s,
            height: st.s,
            borderRadius: st.s / 2,
            opacity: starOpacity,
          }}
        />
      ))}

      {/* Brand Header */}
      <View
        className="absolute inset-x-0 items-center"
        style={{ top: insets.top + 26 }}
      >
        <View className="mb-3 flex-row items-center rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5">
          <View className="mr-2 h-1.5 w-1.5 rounded-full bg-[#2ad0ff]" />
          <Text className="text-[9px] font-bold uppercase tracking-[3px] text-[#e8e2ff]/80">
            Music for every mood
          </Text>
        </View>

        <Text className="text-center text-[44px] font-black tracking-[10px] text-[#f4efff]">
          MUSIKA
        </Text>

        <Text className="mt-1.5 text-center text-[10px] font-bold uppercase tracking-[4px] text-[#e8e2ff]/70">
          Make your life more live
        </Text>
      </View>

      {/* Hero: halo rings + vinyl + live equalizer */}
      <View
        pointerEvents="none"
        className="absolute inset-x-0 items-center"
        style={{ top: insets.top + 150 }}
      >
        <View
          className="items-center justify-center"
          style={{ width: DISC_SIZE + 90, height: DISC_SIZE + 90 }}
        >
          {/* Center Circular Glow Halo */}
          <View
            className="absolute rounded-full bg-[#7b3cff]/25"
            style={{ width: DISC_SIZE + 70, height: DISC_SIZE + 70 }}
          />
          <View
            className="absolute rounded-full border border-white/10"
            style={{ width: DISC_SIZE + 90, height: DISC_SIZE + 90 }}
          />
          <View
            className="absolute rounded-full border border-white/10"
            style={{ width: DISC_SIZE + 44, height: DISC_SIZE + 44 }}
          />

          {/* Girl with hoodie & headphones illustration */}
          {/* <Image
            source={require('../../assets/images/welcome-hero.jpg')}
            style={{ width: DISC_SIZE, height: DISC_SIZE }}
            resizeMode="contain"
          /> */}

          <View
            style={{
              shadowColor: '#7b3cff',
              shadowOffset: { width: 0, height: 16 },
              shadowOpacity: 0.7,
              shadowRadius: 28,
              elevation: 18,
            }}
          >
            <VinylDisc size={DISC_SIZE} />
          </View>
        </View>

        {/* Live Equalizer Spectrum */}
        <View className="-mt-2 h-16 flex-row items-end justify-center gap-1.5">
          {bars.map((h, idx) => (
            <Animated.View
              key={idx}
              className={`w-1 rounded-full ${idx % 3 === 0 ? 'bg-[#8a5cff]' : 'bg-[#2ad0ff]'}`}
              style={{
                height: eqAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [h * 0.35, h],
                }),
              }}
            />
          ))}
        </View>
      </View>

      {/* Floating music notes */}
      <Animated.View
        pointerEvents="none"
        className="absolute rounded-full bg-white/[0.07] p-2 opacity-90"
        style={{
          left: 24,
          bottom: SH * 0.4,
          transform: [{ translateY: note1Y }],
        }}
      ><Music size={18} color="#2ad0ff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        className="absolute rounded-full bg-white/[0.07] p-2.5 opacity-90"
        style={{
          right: 26,
          bottom: SH * 0.46,
          transform: [{ translateY: note2Y }],
        }}
      ><Music size={22} color="#8a5cff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        className="absolute rounded-full bg-white/[0.07] p-1.5 opacity-90"
        style={{
          left: SW * 0.2,
          bottom: SH * 0.52,
          transform: [{ translateY: note3Y }],
        }}
      ><Music size={16} color="#2ad0ff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Animated.View>

      {/* Bottom glass panel with CTA */}
      <View
        className="absolute inset-x-0 bottom-0 items-center rounded-t-[36px] border border-b-0 border-white/10 bg-[#0d0a22]/90 px-6 pt-3"
        style={{ paddingBottom: insets.bottom + 24 }}
      >
        <View className="mb-5 h-1 w-10 rounded-full bg-white/20" />

        <Text className="text-center text-[30px] font-extrabold tracking-tight text-[#f4efff]">
          Feel every beat.
        </Text>
        <Text className="mb-6 mt-1.5 text-center text-[13px] text-[#cfc6ff]/70">
          Millions of songs. Zero limits.
        </Text>

        {/* CTA: Slide to Get Started */}
        <View
          className="relative h-[60px] justify-center overflow-hidden rounded-[30px] border border-white/20 bg-white/[0.08]"
          style={{ width: SLIDER_WIDTH }}
        >
          {/* Animated gradient fill */}
          <Animated.View
            className="absolute inset-y-0 left-0 rounded-[30px] bg-[#6b45cd]"
            style={{
              width: Animated.add(
                dragX,
                new Animated.Value(KNOB_SIZE + 10)
              ),
            }}
          />

          {/* Slider label */}
          <Text className="pl-[38px] text-center text-[12px] font-bold uppercase tracking-[2px] text-[#f4efff]">
            Slide to get started
          </Text>

          {/* Hint chevrons */}
          <Text className="absolute right-5 text-[18px] font-bold tracking-[-2px] text-white/40">
            ›››
          </Text>

          {/* Draggable Knob */}
          <Animated.View
            className="absolute left-[5px] top-[5px] flex h-12 w-12 items-center justify-center rounded-full bg-white"
            style={{
              transform: [{ translateX: dragX }],
              shadowColor: '#6b45cd',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.6,
              shadowRadius: 10,
              elevation: 8,
            }}
            {...panResponder.panHandlers}
          >
            <TouchableOpacity
              onPress={() => onGetStarted()}
              activeOpacity={0.85}
              className="h-full w-full items-center justify-center"
            >
              <Svg
                width={20}
                height={20}
                viewBox="0 0 24 24"
                fill="none"
                stroke="#3b2fb8"
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <Path d="M5 12h14M13 6l6 6-6 6" />
              </Svg>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}