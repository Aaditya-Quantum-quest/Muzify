import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
} from "react-native";

import { scanSelectedFolder } from "../../services/folderScanner";

import {
  selectMusicFolder,
  getSavedMusicFolder,
} from "../../services/musicFolder.js";

import { getSetting } from "../../databases/queries/settings.js";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useIsFocused } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { cssInterop } from "nativewind";
import {
  ArrowLeft,
  ChevronRight,
  Folder,
  Music,
  Check,
  ALargeSmall,
  Image,
  SquareStack,
  Play,
  Minus,
  Plus,
} from "lucide-react-native";
import { usePlayer } from "../../context/player-context";
import MusicHeader from "../../components/subComponents/MusicHeader";
import { HEADER_CONTENT } from "../../constants/headerContent";
// import PlayerStylePicker from '../../components/players/PlayerStylePicker';

// same as the home screen: lets <LinearGradient className="..." /> work
cssInterop(LinearGradient, { className: "style" });

/* ───────────── palette (identical to the home screen + 2 helpers) ───────────── */
const C = {
  screen: "#0b0b0e",
  btn: "#1f1e26",
  chip: "#1a1a20",
  row: "#19181f", // idle round button (home play buttons)
  pill: "#24232c", // inactive pill sitting on a chip-coloured card
  line: "#262431",
  fg: "#f4f4f6",
  mut: "#8a8a94",
  amb: "#fbbf24", // amber-400
  tabActive: "#2a1500",
};

const WORDMARK_FONT = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

/* ───────────── layout (home rhythm: 20px gutter, 130px bottom) ───────────── */
const BOTTOM_PAD = 130;
const TABLET_MIN = 768;
const TABLET_MAX_W = 840;

function useLayout() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isTablet = width >= TABLET_MIN;

  return {
    insets,
    isTablet,
    padX: Math.max(20, insets.left, insets.right), // 20 like home, clear of landscape notches
    maxW: isTablet ? TABLET_MAX_W : undefined,
  };
}

const testScan = async () => {
  try {
    const folderUri = getSetting("music_folder");

    if (!folderUri) {
      console.log("No music folder selected");
      return;
    }

    const files = await scanSelectedFolder(folderUri);

    console.log("Found music:", files.length);
  } catch (error) {
    console.error("Folder scan error:", error);
  }
};

/* ───────────── data (unchanged) ───────────── */
const PLAYER_SCREENS = [
  {
    id: "retro",
    num: "01",
    name: "Retro",
    subtitle: "Warm vinyl tones",
    badge: "Vinyl",
    accent: "#ec6f8e",
    description: "Classic record-player vibe with amber accents.",
  },
  {
    id: "neon",
    num: "02",
    name: "Neon",
    subtitle: "Electric glow",
    badge: "Neon",
    accent: "#26c6da",
    description: "Cyan and magenta neon bars.",
  },
  {
    id: "minimal",
    num: "03",
    name: "Minimal",
    subtitle: "Clean and calm",
    badge: "Flat",
    accent: "#8b6cf0",
    description: "Soft lavender, no clutter.",
  },
  {
    id: "darkwave",
    num: "04",
    name: "Darkwave",
    subtitle: "Deep indigo",
    badge: "Dark",
    accent: "#6a4fd8",
    description: "Indigo waves on near-black.",
  },
  {
    id: "sunset",
    num: "05",
    name: "Sunset",
    subtitle: "Orange hour",
    badge: "Warm",
    accent: "#e0803a",
    description: "Sunset gradient, laid-back.",
  },
  {
    id: "forest",
    num: "06",
    name: "Forest",
    subtitle: "Green escape",
    badge: "Nature",
    accent: "#4fd88a",
    description: "Mint and emerald, calm.",
  },
  {
    id: "midnight",
    num: "07",
    name: "Midnight",
    subtitle: "Deep blue",
    badge: "Deep",
    accent: "#4f8fd8",
    description: "Ocean blue, late-night.",
  },
  {
    id: "candy",
    num: "08",
    name: "Candy",
    subtitle: "Sweet pop",
    badge: "Pop",
    accent: "#ec6f8e",
    description: "Pink and tangerine, playful.",
  },
];

const CATS = [
  {
    id: "font",
    title: "Font",
    sub: "Text style and lyrics",
    grad: ["#ec6f8e", "#f0a343"],
    icon: <ALargeSmall size={26} color="white" strokeWidth={1.6} />,
    items: [
      {
        label: "Font style",
        type: "seg",
        key: "fontStyle",
        opts: ["Jakarta", "Playfair", "Space", "Lora", "Caveat"],
      },
      {
        label: "Font size",
        type: "range",
        key: "fontSize",
        min: 12,
        max: 24,
        unit: "px",
      },
      {
        label: "Lyrics alignment",
        type: "seg",
        key: "lyAlign",
        opts: ["Left", "Center", "Right"],
      },
      {
        label: "Accent lyrics highlight",
        type: "toggle",
        key: "lyAccent",
        hint: "Colour the line that is playing",
      },
    ],
  },
  {
    id: "art",
    title: "Album art",
    sub: "Size, corners and shadows",
    grad: ["#5b3fa0", "#8b6cf0"],
    icon: <Image size={26} color="white" strokeWidth={1.6} />,
    items: [
      {
        label: "Album art size",
        type: "range",
        key: "aaSize",
        min: 0,
        max: 100,
        unit: "%",
      },
      {
        label: "Art transition",
        type: "seg",
        key: "aaTrans",
        opts: ["None", "Fade", "Slide", "Zoom"],
      },
      {
        label: "Player art corners",
        type: "range",
        key: "plCorner",
        min: 0,
        max: 100,
        unit: "%",
      },
      {
        label: "Player art shadow",
        type: "range",
        key: "plShadow",
        min: 0,
        max: 100,
        unit: "%",
      },
    ],
  },
  {
    id: "nav",
    title: "Navigation",
    sub: "Bar style, shape and seek bar",
    grad: ["#1f9a9a", "#3cc0b8"],
    icon: <SquareStack size={26} color="white" strokeWidth={1.6} />,
    items: [
      {
        label: "Navigation style",
        type: "seg",
        key: "navStyle",
        opts: ["Floating", "Full width"],
      },
      {
        label: "Background style",
        type: "seg",
        key: "navBg",
        opts: ["Default", "Translucent", "Gradient"],
      },
      {
        label: "Navigation width",
        type: "range",
        key: "navWidth",
        min: 60,
        max: 100,
        unit: "%",
      },
      {
        label: "Navigation corners",
        type: "range",
        key: "navCorner",
        min: 0,
        max: 30,
        unit: "px",
      },
    ],
  },
  {
    id: "ctl",
    title: "Player controls",
    sub: "Buttons, icons and seek bar",
    grad: ["#e0803a", "#a8321f"],
    icon: <Play size={26} color="white" fill="white" strokeWidth={1.6} />,
    items: [
      {
        label: "Button style",
        type: "seg",
        key: "btnStyle",
        opts: ["Solid", "Tonal", "Outline", "Gradient", "Flat"],
      },
      {
        label: "Button size",
        type: "range",
        key: "btnSize",
        min: 36,
        max: 56,
        unit: "px",
      },
      {
        label: "Play button width",
        type: "range",
        key: "btnWidth",
        min: 100,
        max: 160,
        unit: "%",
      },
      {
        label: "Previous/next icons",
        type: "seg",
        key: "skipIcon",
        opts: ["Arrow", "Dot"],
      },
    ],
  },
];

const STORAGE_ROWS = [
  {
    id: "folder",
    grad: ["#38bdf8", "#0284c7"],
    icon: <Folder size={26} color="#fff" strokeWidth={1.8} />,
  },
  {
    id: "intro",
    grad: ["#a78bfa", "#7c3aed"],
    icon: <Music size={26} color="#fff" strokeWidth={1.8} />,
  },
];

const DEFAULTS = {
  fontStyle: "Jakarta",
  fontSize: 16,
  lyAlign: "Center",
  lyAccent: true,
  aaSize: 55,
  aaTrans: "Fade",
  plCorner: 30,
  plShadow: 40,
  navStyle: "Floating",
  navBg: "Default",
  navWidth: 96,
  navCorner: 25,
  btnStyle: "Solid",
  btnSize: 46,
  btnWidth: 100,
  skipIcon: "Arrow",
};





const handleSelectFolder = async () => {
  const folder = await selectMusicFolder();

  if (folder) {
    console.log("Selected music folder:", folder);
  }
};

const folder = getSavedMusicFolder();

if (folder) {
  console.log("Saved folder URI:", folder.uri);
}












const TABS = ["All", "Player", "Customize", "Storage"];

// darken a #rrggbb colour (f = 0..1) for the 2nd gradient stop
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) =>
    Math.round(v * (1 - f))
      .toString(16)
      .padStart(2, "0");
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
};

console.log("Music folder saved:");
console.log("Selected music folder:");
/* ───────────── building blocks ───────────── */
// centres content on tablets, keeps the gutter everywhere
function Frame({ layout, className = "", children }) {
  return (
    <View
      className={`w-full self-center ${className}`}
      style={{ maxWidth: layout.maxW, paddingHorizontal: layout.padX }}
    >
      {children}
    </View>
  );
}

// same header row as home: wordmark (+ back arrow when there is somewhere to go back to)
function Header({ onBack }) {
  return (
    <View className="mt-4 flex-row items-center">
      {onBack && (
        <TouchableOpacity
          onPress={onBack}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Back"
          className="mr-4"
        >
          <ArrowLeft size={26} color="#fff" strokeWidth={1.6} />
        </TouchableOpacity>
      )}

      <Text
        textTransform="capitalize"
        className="text-2xl tracking-[3px]"
        style={{ color: C.fg, fontFamily: WORDMARK_FONT }}
      >
        N MUSIC
      </Text>
    </View>
  );
}

// same big headline as "Good Music Today."
function Headline({ children, sub }) {
  return (
    <>
      <Text
        textTransform="capitalize"
        className="mt-8 text-[44px] font-medium leading-[50px] tracking-tighter"
        style={{ color: C.fg }}
      >
        {children}
        <Text textTransform="capitalize" className="text-[#ff2d55]">
          .
        </Text>
      </Text>

      {sub ? (
        <Text
          textTransform="capitalize"
          className="mt-3 text-sm font-medium"
          style={{ color: C.mut }}
        >
          {sub}
        </Text>
      ) : null}
    </>
  );
}

// same chips as home
function Chips({ items, active, onChange, padX }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="mt-7 grow-0"
      style={{ marginHorizontal: -padX }}
      contentContainerStyle={{ paddingHorizontal: padX, gap: 8 }}
    >
      {items.map((c, i) => (
        <TouchableOpacity
          key={c}
          onPress={() => onChange(i)}
          activeOpacity={0.75}
          className={`h-10 items-center justify-center rounded-full px-5 ${
            active === i ? "bg-amber-400" : ""
          }`}
          style={active === i ? null : { backgroundColor: C.chip }}
        >
          <Text
            textTransform="capitalize"
            className={`text-sm font-medium ${active === i ? "" : "text-[#c4c4cc]"}`}
            style={active === i ? { color: C.tabActive } : null}
          >
            {c}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// same section header as home (title + amber action)
function SectionHeader({ title, actionLabel = "See all", onAction, first }) {
  return (
    <View
      className={`mx-0.5 mb-3 flex-row items-baseline justify-between ${
        first ? "mt-7" : "mt-10"
      }`}
    >
      <Text
        textTransform="capitalize"
        className="text-xl font-bold"
        style={{ color: C.fg }}
      >
        {title}
      </Text>

      {onAction && (
        <TouchableOpacity
          onPress={onAction}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text
            textTransform="capitalize"
            className="text-sm font-semibold"
            style={{ color: C.amb }}
          >
            {actionLabel}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// same row as home's PlaylistRow: 64px gradient tile, title, subtitle, round button
function Row({ gradient, icon, title, subtitle, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="mb-3 flex-row items-center"
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="mr-3 h-16 w-16 items-center justify-center rounded-2xl"
      >
        {icon}
      </LinearGradient>

      <View className="min-w-0 flex-1">
        <Text
          textTransform="capitalize"
          numberOfLines={1}
          className="text-base font-bold"
          style={{ color: C.fg }}
        >
          {title}
        </Text>

        <Text
          textTransform="capitalize"
          numberOfLines={1}
          className="mt-1 text-xs"
          style={{ color: C.mut }}
        >
          {subtitle}
        </Text>
      </View>

      <View
        className="h-9 w-9 items-center justify-center rounded-full"
        style={{ backgroundColor: C.row }}
      >
        <ChevronRight size={16} color="#fff" strokeWidth={2} />
      </View>
    </TouchableOpacity>
  );
}

// same look as home's MiniCard, used for the player style rail
function ThemeCard({ item, selected, onPress, tablet }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <LinearGradient
        colors={[item.accent, shade(item.accent, 0.5)]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 1, y: 1 }}
        className={`${tablet ? "h-[170px] w-[200px]" : "h-[150px] w-[180px]"} overflow-hidden rounded-3xl`}
        style={{
          borderWidth: 2,
          borderColor: selected ? C.amb : "transparent",
        }}
      >
        <View className="absolute -right-8 -top-8 h-[110px] w-[110px] rounded-full bg-white/10" />

        <View className="absolute left-3 top-3 h-9 w-9 items-center justify-center rounded-full bg-white/20">
          <Text
            textTransform="capitalize"
            className="text-xs font-extrabold text-white"
          >
            {item.num}
          </Text>
        </View>

        <View
          className={`absolute right-3 top-3 h-10 w-10 items-center justify-center rounded-full ${
            selected ? "bg-amber-400" : "bg-[#2b1d16]"
          }`}
        >
          <Check
            size={16}
            color={selected ? C.tabActive : "rgba(255,255,255,0.45)"}
            strokeWidth={2.4}
          />
        </View>

        <View className="absolute bottom-3.5 left-3.5 right-3.5">
          <Text
            textTransform="capitalize"
            numberOfLines={1}
            className="text-base font-bold text-white"
          >
            {item.name}
          </Text>

          <Text
            textTransform="capitalize"
            numberOfLines={1}
            className="mt-1 text-xs font-medium text-white/80"
          >
            {item.subtitle}
          </Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

/* ───────────── controls (detail view) ───────────── */
function SettingCard({ children, tablet }) {
  return (
    <View
      className="mb-3 rounded-3xl p-4"
      style={{ backgroundColor: C.chip, width: tablet ? "48.8%" : "100%" }}
    >
      {children}
    </View>
  );
}

function SettingToggle({ value, onChange }) {
  return (
    <TouchableOpacity
      onPress={() => onChange(!value)}
      activeOpacity={0.8}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      className="h-[30px] w-[52px] justify-center rounded-full px-0.5"
      style={{ backgroundColor: value ? C.amb : "#2f2d3a" }}
    >
      <View
        className={`h-[26px] w-[26px] rounded-full bg-white ${
          value ? "self-end" : "self-start"
        }`}
      />
    </TouchableOpacity>
  );
}

// options are separate chips that wrap, exactly like home chips (no tiny text)
function SegChips({ opts, value, onChange }) {
  return (
    <View className="mt-3 flex-row flex-wrap gap-2">
      {opts.map((o) => {
        const on = value === o;

        return (
          <TouchableOpacity
            key={o}
            onPress={() => onChange(o)}
            activeOpacity={0.75}
            className={`h-10 items-center justify-center rounded-full px-5 ${
              on ? "bg-amber-400" : ""
            }`}
            style={on ? null : { backgroundColor: C.pill }}
          >
            <Text
              textTransform="capitalize"
              className={`text-sm font-medium ${on ? "" : "text-[#c4c4cc]"}`}
              style={on ? { color: C.tabActive } : null}
            >
              {o}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function RangeControl({ value, min, max, unit, onChange }) {
  const step = unit === "%" ? 5 : 1;
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;

  return (
    <View className="mt-3 flex-row items-center gap-3">
      <TouchableOpacity
        onPress={() => onChange(Math.max(min, value - step))}
        activeOpacity={0.75}
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: C.pill }}
      >
        <Minus size={18} color={C.fg} strokeWidth={2} />
      </TouchableOpacity>

      <View
        className="h-1.5 flex-1 overflow-hidden rounded-full"
        style={{ backgroundColor: C.pill }}
      >
        <View
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: C.amb }}
        />
      </View>

      <TouchableOpacity
        onPress={() => onChange(Math.min(max, value + step))}
        activeOpacity={0.75}
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: C.pill }}
      >
        <Plus size={18} color={C.fg} strokeWidth={2} />
      </TouchableOpacity>
    </View>
  );
}

/* ───────────── screen ───────────── */
export default function SettingsScreen() {
  const layout = useLayout();
  const { insets, isTablet, padX } = layout;
  const router = useRouter();
  const isFocused = useIsFocused();
  const { playerTheme, setPlayerTheme, musicFolder, setOnboardingStep } =
    usePlayer();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [open, setOpen] = useState(null);
  const [tab, setTab] = useState(0);
  const [s, setS] = useState({ ...DEFAULTS });

  const set = (k, v) => setS((prev) => ({ ...prev, [k]: v }));

  const reset = () => setS({ ...DEFAULTS });

  const cur = CATS.find((c) => c.id === open) ?? null;
  const currentTheme =
    PLAYER_SCREENS.find((p) => p.id === playerTheme) || PLAYER_SCREENS[7];

  const canGoBack =
    typeof router.canGoBack === "function" && router.canGoBack();
  const goArtists = () => router.push("/artists");
  const showSec = (name) => tab === 0 || TABS[tab] === name;

  // ── Detail view ──
  if (cur) {
    return (
      <View
        className="flex-1"
        style={{ backgroundColor: C.screen, paddingTop: insets.top }}
      >
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          bounces
          contentContainerStyle={{
            alignItems: "center",
            paddingBottom: BOTTOM_PAD,
          }}
        >
          <Frame layout={layout}>
            <Header onBack={() => setOpen(null)} />

            <Headline sub={cur.sub}>{cur.title}</Headline>

            <View className="mt-7 flex-row flex-wrap justify-between">
              {cur.items.map((item) => (
                <SettingCard key={item.key} tablet={isTablet}>
                  {item.type === "toggle" ? (
                    <View className="flex-row items-center justify-between gap-3">
                      <View className="flex-1">
                        <Text
                          textTransform="capitalize"
                          className="text-base font-bold"
                          style={{ color: C.fg }}
                        >
                          {item.label}
                        </Text>

                        {item.hint && (
                          <Text
                            textTransform="capitalize"
                            className="mt-1 text-xs"
                            style={{ color: C.mut }}
                          >
                            {item.hint}
                          </Text>
                        )}
                      </View>

                      <SettingToggle
                        value={Boolean(s[item.key])}
                        onChange={(v) => set(item.key, v)}
                      />
                    </View>
                  ) : item.type === "seg" ? (
                    <>
                      <View className="flex-row items-baseline justify-between">
                        <Text
                          textTransform="capitalize"
                          className="text-base font-bold"
                          style={{ color: C.fg }}
                        >
                          {item.label}
                        </Text>

                        <Text
                          textTransform="capitalize"
                          className="text-sm font-semibold"
                          style={{ color: C.amb }}
                        >
                          {String(s[item.key])}
                        </Text>
                      </View>

                      <SegChips
                        opts={item.opts}
                        value={String(s[item.key])}
                        onChange={(v) => set(item.key, v)}
                      />
                    </>
                  ) : (
                    <>
                      <View className="flex-row items-baseline justify-between">
                        <Text
                          textTransform="capitalize"
                          className="text-base font-bold"
                          style={{ color: C.fg }}
                        >
                          {item.label}
                        </Text>

                        <Text
                          textTransform="capitalize"
                          className="text-sm font-semibold"
                          style={{ color: C.amb }}
                        >
                          {Number(s[item.key])}
                          {item.unit ?? ""}
                        </Text>
                      </View>

                      <RangeControl
                        value={Number(s[item.key])}
                        min={item.min ?? 0}
                        max={item.max ?? 100}
                        unit={item.unit ?? ""}
                        onChange={(v) => set(item.key, v)}
                      />
                    </>
                  )}
                </SettingCard>
              ))}
            </View>
          </Frame>
        </ScrollView>
      </View>
    );
  }

  // ── List view ──
  return (
    <View
      className="flex-1"
      style={{ backgroundColor: C.screen, paddingTop: insets.top }}
    >
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        bounces
        contentContainerStyle={{
          alignItems: "center",
          paddingBottom: BOTTOM_PAD,
        }}
      >
        <Frame layout={layout}>
          {/* header */}

          {/* headline */}

          <TouchableOpacity onPress={testScan}>
            <Text style={{ color: "white" }}>Test Music Scan</Text>
          </TouchableOpacity>

          <MusicHeader {...HEADER_CONTENT.settings} goArtists={goArtists} active={isFocused} />

          {/* chips */}
          <Chips items={TABS} active={tab} onChange={setTab} padX={padX} />


          {/* ── System customization ── */}
          {showSec("Customize") && (
            <>
              <SectionHeader first={tab !== 0} title="System customization" />

              {CATS.map((cat) => {
                const summary = cat.items
                  .filter((i) => i.type !== "toggle")
                  .slice(0, 2)
                  .map((i) => String(s[i.key]))
                  .join(", ");

                return (
                  <Row
                    key={cat.id}
                    gradient={cat.grad}
                    icon={cat.icon}
                    title={cat.title}
                    subtitle={summary}
                    onPress={() => setOpen(cat.id)}
                  />
                );
              })}
            </>
          )}

          {/* ── Storage & permissions ── */}
          {showSec("Storage") && (
            <>
              <SectionHeader first={tab !== 0} title="Storage & permissions" />

              <Row
                gradient={STORAGE_ROWS[0].grad}
                icon={STORAGE_ROWS[0].icon}
                title="Music Library Folder"
                subtitle={`${musicFolder || "/Music"} • Tap to change folder or permissions`}
                onPress={() => setOnboardingStep("permissions")}
              />

              <Row
                gradient={STORAGE_ROWS[1].grad}
                icon={STORAGE_ROWS[1].icon}
                title="Replay Welcome Intro"
                subtitle="Experience the Musika intro screen again"
                onPress={() => setOnboardingStep("welcome")}
              />
            </>
          )}

          {/* reset (same chip shape as home) */}
          <TouchableOpacity
            onPress={reset}
            activeOpacity={0.75}
            className="mt-6 h-10 items-center justify-center self-start rounded-full px-5"
            style={{ backgroundColor: C.chip }}
          >
            <Text
              textTransform="capitalize"
              className="text-sm font-medium"
              style={{ color: C.amb }}
            >
              Reset to defaults
            </Text>
          </TouchableOpacity>
        </Frame>
      </ScrollView>

      {/* Style Picker Modal */}
      {/* <PlayerStylePicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
      /> */}
    </View>
  );
}
