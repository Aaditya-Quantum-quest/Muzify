import * as FileSystem from "expo-file-system/legacy";
import { getSetting, saveSetting } from "../databases/queries/settings";

const LIST_KEY = "welcome_backgrounds";
const INDEX_KEY = "welcome_background_index";
const DIR = `${FileSystem.documentDirectory || ""}welcome-backgrounds/`;

let launchResolved = false;
let launchUri = null;
let launchPromise = null;

function readList() {
  try {
    const raw = getSetting(LIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => item?.id && item?.uri) : [];
  } catch {
    return [];
  }
}

function writeList(items) {
  saveSetting(LIST_KEY, JSON.stringify(items));
}

function readLastIndex() {
  const raw = getSetting(INDEX_KEY);
  const n = raw == null ? -1 : Number.parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : -1;
}

function writeLastIndex(index) {
  saveSetting(INDEX_KEY, String(index));
}

export function nextBackgroundIndex(last, length) {
  if (!length) return 0;
  const safe = Number.isFinite(last) && last >= 0 && last < length ? last : -1;
  return (safe + 1) % length;
}

async function ensureDir() {
  if (!FileSystem.documentDirectory) return false;
  const info = await FileSystem.getInfoAsync(DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
  }
  return true;
}

async function fileExists(uri) {
  if (!uri) return false;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return !!info.exists;
  } catch {
    return false;
  }
}

async function pruneMissing(items) {
  const kept = [];
  for (const item of items) {
    if (await fileExists(item.uri)) kept.push(item);
  }
  if (kept.length !== items.length) writeList(kept);
  return kept;
}

function extFromUri(uri, mimeType) {
  const fromMime = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/gif": "gif",
  }[mimeType];
  if (fromMime) return fromMime;
  const match = String(uri).match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return (match?.[1] || "jpg").toLowerCase();
}

export async function listWelcomeBackgrounds() {
  return pruneMissing(readList());
}

export async function addWelcomeBackgrounds(assets) {
  if (!Array.isArray(assets) || assets.length === 0) return listWelcomeBackgrounds();
  const ready = await ensureDir();
  const items = readList();

  for (let i = 0; i < assets.length; i += 1) {
    const asset = assets[i];
    const src = asset?.uri;
    if (!src) continue;
    const id = `bg_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`;
    if (ready) {
      const dest = `${DIR}${id}.${extFromUri(src, asset.mimeType)}`;
      try {
        await FileSystem.copyAsync({ from: src, to: dest });
        const copied = await FileSystem.getInfoAsync(dest);
        if (copied.exists) {
          items.push({ id, uri: dest, name: asset.fileName || id });
          continue;
        }
      } catch (error) {
        console.warn("Failed to copy welcome background", error);
      }
    }
    items.push({ id, uri: src, name: asset.fileName || id });
  }

  writeList(items);
  return items;
}

export async function removeWelcomeBackground(id) {
  const items = readList();
  const target = items.find((item) => item.id === id);
  const next = items.filter((item) => item.id !== id);
  if (target?.uri?.startsWith(DIR)) {
    try {
      await FileSystem.deleteAsync(target.uri, { idempotent: true });
    } catch (error) {
      console.warn("Failed to delete welcome background", error);
    }
  }
  writeList(next);
  if (readLastIndex() >= next.length) writeLastIndex(next.length ? next.length - 1 : -1);
  return next;
}

export async function clearWelcomeBackgrounds() {
  const items = readList();
  for (const item of items) {
    if (!item.uri?.startsWith(DIR)) continue;
    try {
      await FileSystem.deleteAsync(item.uri, { idempotent: true });
    } catch (error) {
      console.warn("Failed to clear welcome background", error);
    }
  }
  writeList([]);
  writeLastIndex(-1);
  return [];
}

export async function consumeLaunchBackground() {
  if (launchResolved) return launchUri;
  if (launchPromise) return launchPromise;

  launchPromise = (async () => {
    const images = await pruneMissing(readList());
    if (!images.length) {
      launchUri = null;
      launchResolved = true;
      return null;
    }
    const index = nextBackgroundIndex(readLastIndex(), images.length);
    writeLastIndex(index);
    launchUri = images[index].uri;
    launchResolved = true;
    return launchUri;
  })();

  try {
    return await launchPromise;
  } finally {
    launchPromise = null;
  }
}
