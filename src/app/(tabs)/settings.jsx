import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
  Image as RNImage,
  Alert,
  StyleSheet,
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
  X,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import {
  addWelcomeBackgrounds,
  clearWelcomeBackgrounds,
  listWelcomeBackgrounds,
  removeWelcomeBackground,
} from "../../services/welcomeBackgrounds";
import { usePlayer } from "../../context/player-context";
import MusicHeader from "../../components/subComponents/MusicHeader";
import { HEADER_CONTENT } from "../../constants/headerContent";
// import PlayerStylePicker from '../../components/players/PlayerStylePicker';

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

/* ───────────── layout (home rhythm: 20px gutter) ───────────── */
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
function Frame({ layout, style, children }) {
  return (
    <View
      style={[
        styles.frame,
        style,
        { maxWidth: layout.maxW, paddingHorizontal: layout.padX },
      ]}
    >
      {children}
    </View>
  );
}

// same header row as home: wordmark (+ back arrow when there is somewhere to go back to)
function Header({ onBack }) {
  return (
    <View style={styles.headerRow}>
      {onBack && (
        <TouchableOpacity
          onPress={onBack}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Back"
          style={styles.backBtn}
        >
          <ArrowLeft size={26} color="#fff" strokeWidth={1.6} />
        </TouchableOpacity>
      )}

      <Text
        textTransform="capitalize"
        style={[styles.wordmark, { color: C.fg, fontFamily: WORDMARK_FONT }]}
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
        style={[styles.headline, { color: C.fg }]}
      >
        {children}
        <Text textTransform="capitalize" style={styles.headlineDot}>
          .
        </Text>
      </Text>

      {sub ? (
        <Text
          textTransform="capitalize"
          style={[styles.subText, { color: C.mut }]}
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
      style={[styles.chipsScroll, { marginHorizontal: -padX }]}
      contentContainerStyle={{ paddingHorizontal: padX, gap: 8 }}
    >
      {items.map((c, i) => (
        <TouchableOpacity
          key={c}
          onPress={() => onChange(i)}
          activeOpacity={0.75}
          style={[styles.chip, active === i ? styles.chipOn : { backgroundColor: C.chip }]}
        >
          <Text
            textTransform="capitalize"
            style={[
              styles.chipText,
              active === i ? { color: C.tabActive } : { color: "#c4c4cc" },
            ]}
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
      style={[
        styles.sectionHeader,
        first ? styles.sectionHeaderFirst : styles.sectionHeaderRest,
      ]}
    >
      <Text
        textTransform="capitalize"
        style={[styles.sectionTitle, { color: C.fg }]}
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
            style={[styles.sectionAction, { color: C.amb }]}
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
      style={styles.row}
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.rowTile}
      >
        {icon}
      </LinearGradient>

      <View style={styles.flexCol}>
        <Text
          textTransform="capitalize"
          numberOfLines={1}
          style={[styles.rowTitle, { color: C.fg }]}
        >
          {title}
        </Text>

        <Text
          textTransform="capitalize"
          numberOfLines={1}
          style={[styles.rowSub, { color: C.mut }]}
        >
          {subtitle}
        </Text>
      </View>

      <View
        style={[styles.roundBtn, { backgroundColor: C.row }]}
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
        style={[
          styles.themeCard,
          tablet ? styles.themeCardTablet : styles.themeCardPhone,
          {
            borderWidth: 2,
            borderColor: selected ? C.amb : "transparent",
          },
        ]}
      >
        <View style={styles.themeGlow} />

        <View style={styles.themeNum}>
          <Text
            textTransform="capitalize"
            style={styles.themeNumText}
          >
            {item.num}
          </Text>
        </View>

        <View
          style={[
            styles.themeCheck,
            selected ? styles.themeCheckOn : styles.themeCheckOff,
          ]}
        >
          <Check
            size={16}
            color={selected ? C.tabActive : "rgba(255,255,255,0.45)"}
            strokeWidth={2.4}
          />
        </View>

        <View style={styles.themeMeta}>
          <Text
            textTransform="capitalize"
            numberOfLines={1}
            style={styles.themeName}
          >
            {item.name}
          </Text>

          <Text
            textTransform="capitalize"
            numberOfLines={1}
            style={styles.themeSub}
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
      style={[styles.settingCard, { backgroundColor: C.chip, width: tablet ? "48.8%" : "100%" }]}
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
      style={[styles.toggle, { backgroundColor: value ? C.amb : "#2f2d3a" }]}
    >
      <View
        style={[styles.toggleKnob, value ? styles.toggleKnobOn : styles.toggleKnobOff]}
      />
    </TouchableOpacity>
  );
}

// options are separate chips that wrap, exactly like home chips (no tiny text)
function SegChips({ opts, value, onChange }) {
  return (
    <View style={styles.segWrap}>
      {opts.map((o) => {
        const on = value === o;

        return (
          <TouchableOpacity
            key={o}
            onPress={() => onChange(o)}
            activeOpacity={0.75}
            style={[styles.chip, on ? styles.chipOn : { backgroundColor: C.pill }]}
          >
            <Text
              textTransform="capitalize"
              style={[
                styles.chipText,
                on ? { color: C.tabActive } : { color: "#c4c4cc" },
              ]}
            >
              {o}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function WelcomeBackgroundsSection() {
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const next = await listWelcomeBackgrounds();
    setImages(next);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const pick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission required", "Allow photo access to add welcome backgrounds.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        quality: 0.85,
        orderedSelection: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const next = await addWelcomeBackgrounds(result.assets);
      setImages(next);
    } catch (error) {
      console.warn("Welcome background pick failed", error);
      Alert.alert("Could not add images", "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const removeOne = async (id) => {
    const next = await removeWelcomeBackground(id);
    setImages(next);
  };

  const clearAll = () => {
    if (!images.length) return;
    Alert.alert("Clear all backgrounds?", "This removes every uploaded welcome image.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear all",
        style: "destructive",
        onPress: async () => {
          const next = await clearWelcomeBackgrounds();
          setImages(next);
        },
      },
    ]);
  };

  return (
    <View style={[styles.settingCard, { backgroundColor: C.chip }]}>
      <View style={styles.betweenRow}>
        <Text style={[styles.rowTitle, { color: C.fg }]}>
          Welcome Screen Backgrounds
        </Text>
        <Text style={[styles.sectionAction, { color: C.amb }]}>
          {images.length}
        </Text>
      </View>
      <Text style={[styles.rowSub, { color: C.mut }]}>
        {images.length
          ? `${images.length} image${images.length === 1 ? "" : "s"} rotate on each launch`
          : "Uses the default welcome image until you add your own"}
      </Text>

      {images.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.bgScroll}
          contentContainerStyle={{ gap: 8 }}
        >
          {images.map((item) => (
            <View key={item.id} style={[styles.bgThumb, { backgroundColor: C.pill }]}>
              <RNImage source={{ uri: item.uri }} style={{ width: 72, height: 72 }} resizeMode="cover" />
              <TouchableOpacity
                onPress={() => removeOne(item.id)}
                activeOpacity={0.75}
                accessibilityLabel="Remove background"
                style={[styles.bgRemove, { backgroundColor: "#2a1500" }]}
              >
                <X size={14} color="#fff" strokeWidth={2.2} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.segWrap}>
        <TouchableOpacity
          onPress={pick}
          disabled={busy}
          activeOpacity={0.75}
          style={[styles.chip, styles.chipOn]}
        >
          <Text style={[styles.chipText, { color: C.tabActive }]}>
            Add Background Images
          </Text>
        </TouchableOpacity>
        {images.length ? (
          <TouchableOpacity
            onPress={clearAll}
            activeOpacity={0.75}
            style={[styles.chip, { backgroundColor: C.pill }]}
          >
            <Text style={[styles.chipText, { color: "#c4c4cc" }]}>Clear all</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function RangeControl({ value, min, max, unit, onChange }) {
  const step = unit === "%" ? 5 : 1;
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;

  return (
    <View style={styles.rangeRow}>
      <TouchableOpacity
        onPress={() => onChange(Math.max(min, value - step))}
        activeOpacity={0.75}
        style={[styles.rangeBtn, { backgroundColor: C.pill }]}
      >
        <Minus size={18} color={C.fg} strokeWidth={2} />
      </TouchableOpacity>

      <View
        style={[styles.rangeTrack, { backgroundColor: C.pill }]}
      >
        <View
          style={[styles.rangeFill, { width: `${pct}%`, backgroundColor: C.amb }]}
        />
      </View>

      <TouchableOpacity
        onPress={() => onChange(Math.min(max, value + step))}
        activeOpacity={0.75}
        style={[styles.rangeBtn, { backgroundColor: C.pill }]}
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
        style={[styles.screen, { backgroundColor: C.screen, paddingTop: insets.top }]}
      >
        <ScrollView
          style={styles.screen}
          showsVerticalScrollIndicator={false}
          bounces
          contentContainerStyle={{
            alignItems: "center",
            paddingBottom: Math.max(insets.bottom, 16) + 16,
          }}
        >
          <Frame layout={layout}>
            <Header onBack={() => setOpen(null)} />

            <Headline sub={cur.sub}>{cur.title}</Headline>

            <View style={styles.cardsWrap}>
              {cur.items.map((item) => (
                <SettingCard key={item.key} tablet={isTablet}>
                  {item.type === "toggle" ? (
                    <View style={styles.toggleRow}>
                      <View style={styles.flex1}>
                        <Text
                          textTransform="capitalize"
                          style={[styles.rowTitle, { color: C.fg }]}
                        >
                          {item.label}
                        </Text>

                        {item.hint && (
                          <Text
                            textTransform="capitalize"
                            style={[styles.rowSub, { color: C.mut }]}
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
                      <View style={styles.betweenRow}>
                        <Text
                          textTransform="capitalize"
                          style={[styles.rowTitle, { color: C.fg }]}
                        >
                          {item.label}
                        </Text>

                        <Text
                          textTransform="capitalize"
                          style={[styles.sectionAction, { color: C.amb }]}
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
                      <View style={styles.betweenRow}>
                        <Text
                          textTransform="capitalize"
                          style={[styles.rowTitle, { color: C.fg }]}
                        >
                          {item.label}
                        </Text>

                        <Text
                          textTransform="capitalize"
                          style={[styles.sectionAction, { color: C.amb }]}
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
      style={[styles.screen, { backgroundColor: C.screen, paddingTop: insets.top }]}
    >
      <ScrollView
        style={styles.screen}
        showsVerticalScrollIndicator={false}
        bounces
        contentContainerStyle={{
          alignItems: "center",
          paddingBottom: Math.max(insets.bottom, 16) + 16,
        }}
      >
        <Frame layout={layout}>
          {/* header */}


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

              <WelcomeBackgroundsSection />
            </>
          )}

          {/* reset (same chip shape as home) */}
          <TouchableOpacity
            onPress={reset}
            activeOpacity={0.75}
            style={[styles.chip, styles.resetBtn, { backgroundColor: C.chip }]}
          >
            <Text
              textTransform="capitalize"
              style={[styles.chipText, { color: C.amb }]}
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

const styles = StyleSheet.create({
  /* Frame */
  frame: { width: "100%", alignSelf: "center" },
  /* header */
  headerRow: { marginTop: 16, flexDirection: "row", alignItems: "center" },
  backBtn: { marginRight: 16 },
  wordmark: { fontSize: 24, letterSpacing: 3 },
  /* headline */
  headline: {
    marginTop: 32,
    fontSize: 44,
    fontWeight: "500",
    lineHeight: 50,
    letterSpacing: -1,
  },
  headlineDot: { color: "#ff2d55" },
  subText: { marginTop: 12, fontSize: 14, fontWeight: "500" },
  /* chips */
  chipsScroll: { marginTop: 28, flexGrow: 0 },
  chip: {
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9999,
    paddingHorizontal: 20,
  },
  chipOn: { backgroundColor: "#fbbf24" },
  chipText: { fontSize: 14, fontWeight: "500" },
  /* section header */
  sectionHeader: {
    marginHorizontal: 2,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  sectionHeaderFirst: { marginTop: 28 },
  sectionHeaderRest: { marginTop: 40 },
  sectionTitle: { fontSize: 20, fontWeight: "700" },
  sectionAction: { fontSize: 14, fontWeight: "600" },
  /* row */
  row: { marginBottom: 12, flexDirection: "row", alignItems: "center" },
  rowTile: {
    marginRight: 12,
    height: 64,
    width: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  flexCol: { minWidth: 0, flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: "700" },
  rowSub: { marginTop: 4, fontSize: 12 },
  roundBtn: {
    height: 36,
    width: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9999,
  },
  /* theme card */
  themeCard: { overflow: "hidden", borderRadius: 24 },
  themeCardTablet: { height: 170, width: 200 },
  themeCardPhone: { height: 150, width: 180 },
  themeGlow: {
    position: "absolute",
    right: -32,
    top: -32,
    height: 110,
    width: 110,
    borderRadius: 9999,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  themeNum: {
    position: "absolute",
    left: 12,
    top: 12,
    height: 36,
    width: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9999,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  themeNumText: { fontSize: 12, fontWeight: "800", color: "#ffffff" },
  themeCheck: {
    position: "absolute",
    right: 12,
    top: 12,
    height: 40,
    width: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9999,
  },
  themeCheckOn: { backgroundColor: "#fbbf24" },
  themeCheckOff: { backgroundColor: "#2b1d16" },
  themeMeta: { position: "absolute", bottom: 14, left: 14, right: 14 },
  themeName: { fontSize: 16, fontWeight: "700", color: "#ffffff" },
  themeSub: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255,255,255,0.8)",
  },
  /* settings cards */
  settingCard: { marginBottom: 12, borderRadius: 24, padding: 16 },
  toggle: {
    height: 30,
    width: 52,
    justifyContent: "center",
    borderRadius: 9999,
    paddingHorizontal: 2,
  },
  toggleKnob: { height: 26, width: 26, borderRadius: 9999, backgroundColor: "#ffffff" },
  toggleKnobOn: { alignSelf: "flex-end" },
  toggleKnobOff: { alignSelf: "flex-start" },
  segWrap: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  betweenRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  /* welcome backgrounds */
  bgScroll: { marginTop: 12, flexGrow: 0 },
  bgThumb: { overflow: "hidden", borderRadius: 16 },
  bgRemove: {
    position: "absolute",
    right: 4,
    top: 4,
    height: 24,
    width: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9999,
  },
  /* range control */
  rangeRow: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  rangeBtn: {
    height: 40,
    width: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9999,
  },
  rangeTrack: { height: 6, flex: 1, overflow: "hidden", borderRadius: 9999 },
  rangeFill: { height: "100%", borderRadius: 9999 },
  /* screen */
  screen: { flex: 1 },
  cardsWrap: {
    marginTop: 28,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  flex1: { flex: 1 },
  resetBtn: { marginTop: 24, alignSelf: "flex-start" },
});
