import React, { memo, useCallback, useMemo, useState } from "react";

import {
  View,
  Text,
  Image,
  Pressable,
  FlatList,
  TouchableOpacity,
} from "react-native";

import { Mic } from "lucide-react-native";
import * as Haptics from "expo-haptics";

const AMBER = "#e49f33";
const MUTED = "#8c8a98";

const TINTS = [
  ["#3b2a14", "#e49f33"],
  ["#33202b", "#ec6f8e"],
  ["#1d2f33", "#5fc8d6"],
  ["#2a2a3d", "#a3a0ff"],
  ["#2a3321", "#9bd16b"],
  ["#3a2420", "#ff8a6b"],
];

const SKELETON_ITEMS = [0, 1, 2, 3, 4];

// Generate a stable color based on artist name
const tintFor = (name = "") => {
  const safeName = typeof name === "string" ? name : "";

  let hash = 0;

  for (let i = 0; i < safeName.length; i += 1) {
    hash = (hash * 31 + safeName.charCodeAt(i)) >>> 0;
  }

  return TINTS[hash % TINTS.length];
};

// Generate artist initials
const initialsOf = (name = "") => {
  return (typeof name === "string" ? name : "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
};

// Safely trigger haptic feedback
const triggerHaptic = () => {
  try {
    Haptics.selectionAsync().catch(() => {});
  } catch (error) {
    // Ignore haptic errors on unsupported devices
  }
};

/* ---------------- Artist Item ---------------- */

const ArtistItem = memo(function ArtistItem({
  artist,
  size,
  selected,
  onPress,
}) {
  const [failed, setFailed] = useState(false);

  const name =
    typeof artist?.name === "string" ? artist.name : "Unknown Artist";

  const [bg, fg] = tintFor(name);

  const image = artist?.image;

  const validImage =
    !failed &&
    (typeof image === "number" ||
      (typeof image === "string" && /^https?:\/\//i.test(image.trim())));

  const imageSource =
    typeof image === "number"
      ? image
      : typeof image === "string"
        ? { uri: image.trim() }
        : null;

  const handlePress = useCallback(() => {
    triggerHaptic();
    onPress?.(artist);
  }, [artist, onPress]);

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={name}
      className="items-center active:opacity-70"
      style={{ width: size }}
    >
      <View style={{ width: size, height: size }}>
        <View
          className="overflow-hidden rounded-full items-center justify-center"
          style={{
            width: size,
            height: size,
            backgroundColor: validImage ? "#17171b" : bg,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
          }}
        >
          {validImage && imageSource ? (
            <Image
              source={imageSource}
              style={{
                width: size,
                height: size,
              }}
              resizeMode="cover"
              onError={() => setFailed(true)}
            />
          ) : (
            <Text
              style={{
                color: fg,
                fontSize: size * 0.3,
                fontWeight: "600",
              }}
            >
              {initialsOf(name)}
            </Text>
          )}
        </View>

        {selected && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: -5,
              left: -5,
              right: -5,
              bottom: -5,
              borderRadius: (size + 10) / 2,
              borderWidth: 2,
              borderColor: AMBER,
            }}
          />
        )}
      </View>

      <Text
        numberOfLines={1}
        className="mt-3.5 text-center text-[13px] font-bold tracking-wide"
        style={{
          width: size + 12,
          color: selected ? AMBER : "#e5e5e5",
        }}
      >
        {name}
      </Text>

      {artist?.info ? (
        <Text
          numberOfLines={1}
          className="mt-0.5 text-center text-[11px]"
          style={{
            width: size + 12,
            color: MUTED,
          }}
        >
          {artist.info}
        </Text>
      ) : null}
    </Pressable>
  );
});

/* ---------------- Skeleton Item ---------------- */

const SkeletonItem = memo(function SkeletonItem({ size }) {
  return (
    <View className="items-center" style={{ width: size }}>
      <View
        className="rounded-full bg-white/5"
        style={{
          width: size,
          height: size,
        }}
      />

      <View
        className="mt-3.5 h-2.5 rounded-full bg-white/5"
        style={{ width: size * 0.7 }}
      />

      <View
        className="mt-2 h-2 rounded-full bg-white/5"
        style={{ width: size * 0.45 }}
      />
    </View>
  );
});

/* ---------------- Gap ---------------- */

const Gap = memo(function Gap({ gap }) {
  return <View style={{ width: gap }} />;
});

/* ---------------- Artists Section ---------------- */

const ArtistsSection = memo(function ArtistsSection({
  title = "Artists",
  label = "Popular",
  icon: Icon = Mic,
  titleColor = "#f5f5f5",
  labelFontFamily,

  artists = [],
  selectedId = null,
  loading = false,

  avatarSize = 88,
  gap = 18,
  inset = 20,
  snap = true,

  onArtistPress,
  onSeeAll,

  className = "",
}) {
  // Protect FlatList from invalid data
  const safeArtists = useMemo(() => {
    if (!Array.isArray(artists)) return [];

    return artists.filter((artist) => artist && typeof artist === "object");
  }, [artists]);

  const renderItem = useCallback(
    ({ item }) => (
      <ArtistItem
        artist={item}
        size={avatarSize}
        selected={selectedId != null && String(item.id) === String(selectedId)}
        onPress={onArtistPress}
      />
    ),
    [avatarSize, selectedId, onArtistPress],
  );

  const renderGap = useCallback(() => <Gap gap={gap} />, [gap]);

  const keyExtractor = useCallback((item, index) => {
    return String(item.id ?? item.name ?? index);
  }, []);

  const listProps = useMemo(
    () =>
      snap
        ? {
            snapToInterval: avatarSize + gap,
            decelerationRate: "fast",
            snapToAlignment: "start",
          }
        : {},
    [snap, avatarSize, gap],
  );

  if (!loading && safeArtists.length === 0) {
    return null;
  }

  const listHeight = avatarSize + 70;

  return (
    <View className={className}>
      {/* Header */}

      <View className="mb-3 mt-5 flex-row items-center justify-between">
        <TouchableOpacity
          activeOpacity={0.6}
          onPress={onSeeAll}
          disabled={!onSeeAll}
          accessibilityRole="button"
          accessibilityLabel={`See all ${String(title).toLowerCase()}`}
          className="flex-row items-center"
        >
          <Icon
            size={20}
            color="#fbbf24"
            strokeWidth={2}
            style={{ marginRight: 8 }}
          />

          <Text
            className="text-3xl font-medium tracking-widest"
            style={{
              color: titleColor,
              textTransform: "capitalize",
              fontFamily: "Quicksand_500Medium",
            }}
          >
            {title}
          </Text>
        </TouchableOpacity>

        {label ? (
          <Text
            style={{
              color: "#8a8a94",
              fontFamily: labelFontFamily,
              fontSize: 10,
              letterSpacing: 1.5,
              textTransform: "uppercase",
            }}
          >
            {label}
          </Text>
        ) : null}
      </View>

      {/* Loading State */}

      {loading ? (
        <View
          className="flex-row"
          style={{
            paddingHorizontal: inset,
            columnGap: gap,
            height: listHeight,
          }}
        >
          {SKELETON_ITEMS.map((item) => (
            <SkeletonItem key={item} size={avatarSize} />
          ))}
        </View>
      ) : (
        /* Artists List */

        <FlatList
          horizontal
          data={safeArtists}
          extraData={selectedId}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ItemSeparatorComponent={renderGap}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: inset,
            paddingVertical: 6,
          }}
          style={{ height: listHeight }}
          scrollEnabled
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"

          // Rendering optimization
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={5}
          updateCellsBatchingPeriod={50}

          // Helps FlatList calculate item positions
          getItemLayout={(_, index) => ({
            length: avatarSize + gap,
            offset: (avatarSize + gap) * index,
            index,
          })}

          removeClippedSubviews={false}
          {...listProps}
        />
      )}
    </View>
  );
});

export default ArtistsSection;
