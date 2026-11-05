import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  Image,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { getMetadata, getArtwork, verifyMetadata } from "../../services/audioMetadata";
import { writeMetadataAndSync } from "../../services/tagWriter";
import { useSongs } from "../../hooks/useSongs";
import { useHideTabBarOnScroll } from "../../components/ui/BottomBar";

const SongInfoScreen = () => {
  const router = useRouter();
  const songId = router.route.split("/").pop() || "";
  const songIdNum = parseInt(songId, 10);
  const [song, setSong] = useState(null);
  const [loading, setLoading] = useState(true);
  const [artwork, setArtwork] = useState(null);
  const [loadingArtwork, setLoadingArtwork] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [error, setError] = useState("");

  const onScroll = useHideTabBarOnScroll();

  useEffect(() => {
    if (!songIdNum || isNaN(songIdNum)) {
      setLoading(true);
      setError("Invalid song ID");
      return;
    }

    const fetchSongInfo = async () => {
      try {
        setLoading(true);
        setVerifying(true);

        // Load song metadata using the actual file URI from the song record
        const meta = await getMetadata(song.file_uri); // <-- FIXED: use actual content:// URI
        setSong(meta);

        // Load and verify artwork
        setArtwork(null);
        setLoadingArtwork(true);
        const art = await getArtwork(song.file_uri); // <-- FIXED: use actual content:// URI
        setArtwork(art);
        setLoadingArtwork(false);

        // Verify write actually took effect
        setVerifying(true);
        const verified = await verifyMetadata(song.file_uri); // <-- FIXED: use actual content:// URI
        setVerifying(false);

        setLoading(false);
      } catch (err) {
        console.error("Song info load failed:", err);
        setError("Failed to load song information");
        setError("Failed to load song information");
        setLoading(false);
      }
    };

    fetchSongInfo();
  }, [songId]);

  const handleEditPress = async () => {
    setEditing(true);
    setSaveStatus("");
    setError("");
  };

  const handleSavePress = async () => {
    if (!song) {
      setError("Song data not loaded");
      return;
    }

    try {
      setSaveStatus("Saving...");
      await writeMetadataAndSync(
        song.file_uri, // <-- FIXED: use actual content:// URI from song record
        {
          title: song.title || "",
          artist: song.artist || "",
          album: song.album || "",
          genre: song.genre || "",
          composer: song.composer || "",
          year: song.year || "",
          track_number: song.track_number?.toString() || "",
          comments: song.comments || "",
          artwork: artwork || "", // pass base64 if present
        },
        songIdNum
      );
      setSaveStatus("Saved successfully!");
      setEditing(false);
    } catch (err) {
      console.error("Save failed:", err);
      setError("Save failed: " + err.message);
      setSaveStatus("Save failed");
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setSaveStatus("");
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text>Loading song information...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
        <TouchableOpacity onPress={handleCancel} style={styles.button}>
          <Text style={styles.buttonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Song Information</Text>

      <View style={styles.infoRow}>
        <Text style={styles.label}>Title:</Text>
        <Text style={styles.value}>{song?.title || " — "}</Text>
      </View>

      <View style={styles.infoRow}>
        <Text style={styles.label}>Artist:</Text>
        <Text style={styles.value}>{song?.artist || " — "}</Text>
      </View>

      <View style={styles.infoRow}>
        <Text style={styles.label}>Album:</Text>
        <Text style={styles.value}>{song?.album || " — "}</Text>
      </View>

      <View style={styles.infoRow}>
        <Text style={styles.label}>Genre:</Text>
        <Text style={styles.value}>{song?.genre || " — "}</Text>
      </View>

      <View style={styles.infoRow}>
        <Text style={styles.label}>Year:</Text>
        <Text style={styles.value}>{song?.year || " — "}</Text>
      </View>

      <View style={styles.infoRow}>
        <Text style={styles.label}>Duration:</Text>
        <Text style={styles.value}>
          {song?.duration
            ? `${Math.floor(song.duration / 1000 / 60)}:${String(
              Math.floor(song.duration % 60)
                .padStart(2, "0")
            )}`
            : " — "}
        </Text>
      </View>

      <View style={styles.infoRow}>
        <Text style={styles.label}>Artwork:</Text>
        <Image
          source={artwork ? { uri: artwork } : null}
          style={styles.artwork}
          onError={() => setArtwork(null)}
        />
      </View>

      {editing && (
        <View style={styles.editContainer}>
          <Text style={styles.editHeader}>Edit Tags</Text>
          <Text style={styles.editText}>Fields marked * are editable.</Text>
          <View style={styles.fieldRow}>
            <Text style={styles.label}>Title *</Text>
            <TextInput
              style={styles.input}
              value={song?.title || ""}
              onChangeText={(text) => {
                setSong((s) => ({ ...s, title: text }));
              }}
            />
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.label}>Artist</Text>
            <TextInput
              style={styles.input}
              value={song?.artist || ""}
              onChangeText={(text) => {
                setSong((s) => ({ ...s, artist: text }));
              }}
            />
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.label}>Album</Text>
            <TextInput
              style={styles.input}
              value={song?.album || ""}
              onChangeText={(text) => {
                setSong((s) => ({ ...s, album: text }));
              }}
            />
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.label}>Genre</Text>
            <TextInput
              style={styles.input}
              value={song?.genre || ""}
              onChangeText={(text) => {
                setSong((s) => ({ ...s, genre: text }));
              }}
            />
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.label}>Year</Text>
            <TextInput
              style={styles.input}
              value={song?.year || ""}
              onChangeText={(text) => {
                setSong((s) => ({ ...s, year: text }));
              }}
            />
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.label}>Track Number</Text>
            <TextInput
              style={styles.input}
              value={song?.track_number?.toString() || ""}
              onChangeText={(text) => {
                setSong((s) => ({ ...s, track_number: text ? parseInt(text) : 0 }));
              }}
            />
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.label}>Comments</Text>
            <TextInput
              style={[styles.input, styles.multi]}
              value={song?.comments || ""}
              onChangeText={(text) => {
                setSong((s) => ({ ...s, comments: text }));
              }}
            />
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.label}>Save</Text>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSavePress}
              disabled={!song}
            >
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancel}
          >
            <Text style={styles.buttonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {saveStatus && <Text style={styles.status}>{saveStatus}</Text>}
    </ScrollView>
  );
};

export default SongInfoScreen;