import * as FileSystem from "expo-file-system/legacy";
import { getFilenameFromUri } from "./folderScanner.js";
import { getSavedMusicFolder } from "./musicFolder.js";

const READ_CACHE_DIR = FileSystem.cacheDirectory + "saf-read/";
const COVER_PREF = [
  "cover.jpg",
  "cover.jpeg",
  "cover.png",
  "cover.webp",
  "folder.jpg",
  "folder.jpeg",
  "folder.png",
  "album.jpg",
  "album.jpeg",
  "album.png",
  "front.jpg",
  "front.jpeg",
  "front.png",
  "artwork.jpg",
  "artwork.jpeg",
  "artwork.png",
  "albumart.jpg",
  "albumart.jpeg",
  "albumart.png",
];
const COVER_NAMES = new Set(COVER_PREF);
const AUDIO_EXT = new Set([".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg", ".opus", ".mp4"]);

const MPEG_BITRATE = {
  1: {
    1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0],
    2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0],
    3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
  },
  2: {
    1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0],
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
    3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
  },
};
const MPEG_SR = {
  1: [44100, 48000, 32000, 0],
  2: [22050, 24000, 16000, 0],
  25: [11025, 12000, 8000, 0],
};

let dirReady = null;
const copyInFlight = new Map();
let lastRead = { uri: null, promise: null };
let folderCoverIndex = null;

function hashUri(uri) {
  let hash = 0;
  for (let i = 0; i < uri.length; i++) {
    hash = ((hash << 5) - hash) + uri.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function extOf(uri) {
  const name = getFilenameFromUri(uri) || "";
  const match = name.match(/\.[a-zA-Z0-9]{2,5}$/);
  return match ? match[0].toLowerCase() : "";
}

async function ensureReadDir() {
  if (dirReady) return dirReady;
  dirReady = (async () => {
    const info = await FileSystem.getInfoAsync(READ_CACHE_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(READ_CACHE_DIR, { intermediates: true });
    }
  })();
  return dirReady;
}

function padB64(s) {
  const m = s.length % 4;
  return m ? s + "=".repeat(4 - m) : s;
}

function base64ToBytes(b64) {
  const binary = globalThis.atob(padB64(b64.replace(/[\r\n]/g, "")));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes) {
  const chunk = 0x2000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return globalThis.btoa(binary);
}

async function readBytes(fileUri, position, length) {
  if (length <= 0) return new Uint8Array(0);
  const b64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
    position,
    length,
  });
  return base64ToBytes(b64);
}

export async function copyToReadableFile(uri) {
  if (!uri) return null;
  if (uri.startsWith("file://")) return uri;
  if (uri.startsWith("/") && !uri.startsWith("/content")) {
    return `file://${uri}`;
  }

  const existing = copyInFlight.get(uri);
  if (existing) return existing;

  const job = (async () => {
    await ensureReadDir();
    const dest = `${READ_CACHE_DIR}f_${hashUri(uri)}${extOf(uri)}`;
    try {
      const info = await FileSystem.getInfoAsync(dest);
      if (info.exists) return dest;
      await FileSystem.copyAsync({ from: uri, to: dest });
      return dest;
    } catch (error) {
      console.warn("SAF copy failed:", error);
      return null;
    }
  })();

  copyInFlight.set(uri, job);
  try {
    return await job;
  } finally {
    copyInFlight.delete(uri);
  }
}

export async function ensureReadableUri(uri) {
  if (!uri) return null;
  if (uri.startsWith("file://")) return uri;
  return copyToReadableFile(uri);
}

export async function releaseReadableCopy(uri) {
  if (!uri || uri.startsWith("file://")) return;
  try {
    const dest = `${READ_CACHE_DIR}f_${hashUri(uri)}${extOf(uri)}`;
    await FileSystem.deleteAsync(dest, { idempotent: true });
  } catch {
    // ignore
  }
}

function latin1(bytes, start, end) {
  let s = "";
  for (let i = start; i < end && i < bytes.length; i++) {
    if (bytes[i] === 0) break;
    s += String.fromCharCode(bytes[i]);
  }
  return s;
}

function decodeUtf8(bytes, start, end) {
  let last = end;
  while (last > start && bytes[last - 1] === 0) last--;
  if (typeof TextDecoder !== "undefined") {
    try {
      return new TextDecoder("utf-8").decode(bytes.subarray(start, last));
    } catch {
      // fall through
    }
  }
  let s = "";
  for (let i = start; i < last; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function decodeId3Text(bytes, offset, end) {
  if (offset >= end) return "";
  const enc = bytes[offset];
  const start = offset + 1;
  if (enc === 0) return latin1(bytes, start, end);
  if (enc === 3) {
    return decodeUtf8(bytes, start, end);
  }
  if (enc === 1 || enc === 2) {
    let i = start;
    if (enc === 1 && i + 1 < end && ((bytes[i] === 0xff && bytes[i + 1] === 0xfe) || (bytes[i] === 0xfe && bytes[i + 1] === 0xff))) {
      i += 2;
    }
    const le = enc === 1;
    let s = "";
    for (; i + 1 < end; i += 2) {
      const code = le ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1];
      if (code === 0) break;
      s += String.fromCharCode(code);
    }
    return s;
  }
  return latin1(bytes, start, end);
}

function synchsafe(b, i) {
  return ((b[i] & 0x7f) << 21) | ((b[i + 1] & 0x7f) << 14) | ((b[i + 2] & 0x7f) << 7) | (b[i + 3] & 0x7f);
}

function be32(b, i) {
  return ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
}

function ascii(b, i, n) {
  let s = "";
  for (let k = 0; k < n && i + k < b.length; k++) s += String.fromCharCode(b[i + k]);
  return s;
}

function parseId3(bytes) {
  const out = {};
  if (bytes.length < 10 || ascii(bytes, 0, 3) !== "ID3") return { tags: out, tagSize: 0 };

  const ver = bytes[3];
  const flags = bytes[5];
  const bodySize = synchsafe(bytes, 6);
  const headerSize = 10;
  const tagSize = headerSize + bodySize + ((flags & 0x10) ? 10 : 0);
  const body = bytes.subarray(headerSize, Math.min(bytes.length, headerSize + bodySize));

  if (ver === 2) {
    let i = 0;
    while (i + 6 <= body.length) {
      const id = ascii(body, i, 3);
      if (!id.trim() || id[0] === "\u0000") break;
      const size = (body[i + 3] << 16) | (body[i + 4] << 8) | body[i + 5];
      i += 6;
      if (size <= 0 || i + size > body.length) break;
      const frame = body.subarray(i, i + size);
      i += size;
      if (id === "TT2") out.title = decodeId3Text(frame, 0, frame.length);
      else if (id === "TP1") out.artist = decodeId3Text(frame, 0, frame.length);
      else if (id === "TAL") out.album = decodeId3Text(frame, 0, frame.length);
      else if (id === "TP2") out.album_artist = decodeId3Text(frame, 0, frame.length);
      else if (id === "TCM") out.composer = decodeId3Text(frame, 0, frame.length);
      else if (id === "TCO") out.genre = decodeId3Text(frame, 0, frame.length);
      else if (id === "TYE") out.year = decodeId3Text(frame, 0, frame.length);
      else if (id === "TRK") out.track_number = parseInt(decodeId3Text(frame, 0, frame.length), 10) || 0;
      else if (id === "PIC" && !out.artworkDataUri) out.artworkDataUri = parsePicV2(frame);
    }
    return { tags: out, tagSize };
  }

  let i = 0;
  while (i + 10 <= body.length) {
    const id = ascii(body, i, 4);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const size = ver === 4 ? synchsafe(body, i + 4) : be32(body, i + 4);
    const frameFlags = (body[i + 8] << 8) | body[i + 9];
    i += 10;
    if (size <= 0 || i + size > body.length) break;
    const compressed = ver === 4 ? (frameFlags & 0x0008) : (frameFlags & 0x0080);
    const frame = body.subarray(i, i + size);
    i += size;
    if (compressed) continue;
    if (id === "TIT2") out.title = decodeId3Text(frame, 0, frame.length);
    else if (id === "TPE1") out.artist = decodeId3Text(frame, 0, frame.length);
    else if (id === "TALB") out.album = decodeId3Text(frame, 0, frame.length);
    else if (id === "TPE2") out.album_artist = decodeId3Text(frame, 0, frame.length);
    else if (id === "TCOM") out.composer = decodeId3Text(frame, 0, frame.length);
    else if (id === "TCON") out.genre = decodeId3Text(frame, 0, frame.length).replace(/^\(\d+\)/, "").trim();
    else if (id === "TDRC" || id === "TYER" || id === "TDRL") out.year = decodeId3Text(frame, 0, frame.length);
    else if (id === "TRCK") out.track_number = parseInt(decodeId3Text(frame, 0, frame.length), 10) || 0;
    else if (id === "APIC" && !out.artworkDataUri) out.artworkDataUri = parseApic(frame);
  }
  return { tags: out, tagSize };
}

function parseApic(frame) {
  if (frame.length < 4) return null;
  const enc = frame[0];
  let i = 1;
  while (i < frame.length && frame[i] !== 0) i++;
  const mime = latin1(frame, 1, i).toLowerCase() || "image/jpeg";
  i += 1;
  if (i >= frame.length) return null;
  i += 1;
  if (enc === 1 || enc === 2) {
    while (i + 1 < frame.length && !(frame[i] === 0 && frame[i + 1] === 0)) i += 2;
    i += 2;
  } else {
    while (i < frame.length && frame[i] !== 0) i++;
    i += 1;
  }
  if (i >= frame.length) return null;
  const pic = frame.subarray(i);
  if (pic.length < 16) return null;
  const kind = mime.includes("png") ? "image/png" : "image/jpeg";
  return `data:${kind};base64,${bytesToBase64(pic)}`;
}

function parsePicV2(frame) {
  if (frame.length < 6) return null;
  let i = 1;
  i += 3;
  i += 1;
  while (i < frame.length && frame[i] !== 0) i++;
  i += 1;
  const pic = frame.subarray(i);
  if (pic.length < 16) return null;
  return `data:image/jpeg;base64,${bytesToBase64(pic)}`;
}

function parseId3v1(bytes) {
  if (bytes.length < 128) return {};
  const tag = bytes.subarray(bytes.length - 128);
  if (ascii(tag, 0, 3) !== "TAG") return {};
  const title = latin1(tag, 3, 33).trim();
  const artist = latin1(tag, 33, 63).trim();
  const album = latin1(tag, 63, 93).trim();
  const year = latin1(tag, 93, 97).trim();
  const out = {};
  if (title) out.title = title;
  if (artist) out.artist = artist;
  if (album) out.album = album;
  if (year) out.year = year;
  return out;
}

function mpegVersion(bits) {
  if (bits === 3) return 1;
  if (bits === 2) return 2;
  if (bits === 0) return 25;
  return 0;
}

function parseMpegFrame(header) {
  if (header.length < 4) return null;
  if (header[0] !== 0xff || (header[1] & 0xe0) !== 0xe0) return null;
  const ver = mpegVersion((header[1] >> 3) & 3);
  const layer = 4 - ((header[1] >> 1) & 3);
  const bitrateIdx = (header[2] >> 4) & 0xf;
  const srIdx = (header[2] >> 2) & 3;
  const padding = (header[2] >> 1) & 1;
  const channelMode = (header[3] >> 6) & 3;
  if (!ver || layer < 1 || layer > 3) return null;
  const brTableVer = ver === 1 ? 1 : 2;
  const bitrate = MPEG_BITRATE[brTableVer]?.[layer]?.[bitrateIdx] || 0;
  const sampleRate = MPEG_SR[ver]?.[srIdx] || 0;
  if (!bitrate || !sampleRate) return null;
  const samplesPerFrame = layer === 1 ? 384 : layer === 2 ? 1152 : ver === 1 ? 1152 : 576;
  const coeff = layer === 1 ? 12 : 144;
  const frameSize = Math.floor((coeff * bitrate * 1000) / sampleRate) + padding;
  return { ver, layer, bitrate, sampleRate, channelMode, samplesPerFrame, frameSize };
}

function xingOffset(frame) {
  if (frame.ver === 1) return frame.channelMode === 3 ? 21 : 36;
  return frame.channelMode === 3 ? 13 : 21;
}

function parseXingDuration(bytes, id3Size, fileSize) {
  const start = id3Size;
  if (start + 4 >= bytes.length) return 0;
  let offset = -1;
  const limit = Math.min(bytes.length - 4, start + 8192);
  for (let i = start; i < limit; i++) {
    if (bytes[i] === 0xff && (bytes[i + 1] & 0xe0) === 0xe0) {
      offset = i;
      break;
    }
  }
  if (offset < 0) return 0;
  const frame = parseMpegFrame(bytes.subarray(offset, offset + 4));
  if (!frame) return 0;
  const searchEnd = Math.min(bytes.length - 8, offset + 64);
  let xoff = -1;
  for (let i = offset + xingOffset(frame) - 4; i < searchEnd; i++) {
    if (i < 0) continue;
    const tag = ascii(bytes, i, 4);
    if (tag === "Xing" || tag === "Info") {
      xoff = i;
      break;
    }
  }
  if (xoff >= 0 && xoff + 16 <= bytes.length) {
    const flags = be32(bytes, xoff + 4);
    if (flags & 1) {
      const frames = be32(bytes, xoff + 8);
      if (frames > 0 && frame.sampleRate) {
        return Math.round((frames * frame.samplesPerFrame * 1000) / frame.sampleRate);
      }
    }
  }
  if (fileSize > 0 && frame.bitrate) {
    const audioSize = fileSize - id3Size;
    return Math.round((audioSize * 8) / frame.bitrate);
  }
  return 0;
}

function walkAtoms(bytes, start, end, visit) {
  let i = start;
  while (i + 8 <= end) {
    let size = be32(bytes, i);
    const type = ascii(bytes, i + 4, 4);
    let header = 8;
    if (size === 1) {
      if (i + 16 > end) break;
      const hi = be32(bytes, i + 8);
      const lo = be32(bytes, i + 12);
      size = hi * 0x100000000 + lo;
      header = 16;
    } else if (size === 0) {
      size = end - i;
    }
    if (size < header) break;
    const atomEnd = Math.min(end, i + size);
    visit(type, bytes, i + header, atomEnd, i, size);
    if (i + size > end) break;
    i += size;
  }
}

function parseMp4(bytes) {
  const tags = {};
  let durationMs = 0;

  const readIlst = (buf, start, end) => {
    walkAtoms(buf, start, end, (type, b, s, e) => {
      let payload = null;
      walkAtoms(b, s, e, (inner, ib, is, ie) => {
        if (inner === "data" && ie - is >= 8) payload = ib.subarray(is + 8, ie);
      });
      if (!payload) return;
      const text = decodeUtf8(payload, 0, payload.length).replace(/\u0000/g, "").trim();
      if (type === "\u00a9nam") tags.title = text;
      else if (type === "\u00a9ART") tags.artist = text;
      else if (type === "\u00a9alb") tags.album = text;
      else if (type === "aART") tags.album_artist = text;
      else if (type === "\u00a9wrt") tags.composer = text;
      else if (type === "\u00a9gen" || type === "gnre") tags.genre = text;
      else if (type === "\u00a9day") tags.year = text;
      else if (type === "trkn" && payload.length >= 4) tags.track_number = (payload[2] << 8) | payload[3];
      else if (type === "covr" && !tags.artworkDataUri && payload.length > 16) {
        const isPng = payload[0] === 0x89 && payload[1] === 0x50;
        const mime = isPng ? "image/png" : "image/jpeg";
        tags.artworkDataUri = `data:${mime};base64,${bytesToBase64(payload)}`;
      }
    });
  };

  const readMoov = (buf, start, end) => {
    walkAtoms(buf, start, end, (type, b, s, e) => {
      if (type === "mvhd" && e - s >= 20) {
        const version = b[s];
        if (version === 1 && e - s >= 32) {
          const timescale = be32(b, s + 20);
          const durHi = be32(b, s + 24);
          const durLo = be32(b, s + 28);
          const duration = durHi * 0x100000000 + durLo;
          if (timescale > 0) durationMs = Math.round((duration / timescale) * 1000);
        } else {
          const timescale = be32(b, s + 12);
          const duration = be32(b, s + 16);
          if (timescale > 0) durationMs = Math.round((duration / timescale) * 1000);
        }
      } else if (type === "udta") {
        walkAtoms(b, s, e, (t2, b2, s2, e2) => {
          if (t2 === "meta") {
            const metaStart = s2 + 4;
            walkAtoms(b2, metaStart, e2, (t3, b3, s3, e3) => {
              if (t3 === "ilst") readIlst(b3, s3, e3);
            });
          }
        });
      } else if (type === "meta") {
        walkAtoms(b, s + 4, e, (t2, b2, s2, e2) => {
          if (t2 === "ilst") readIlst(b2, s2, e2);
        });
      }
    });
  };

  walkAtoms(bytes, 0, bytes.length, (type, b, s, e) => {
    if (type === "moov") readMoov(b, s, e);
  });

  return { tags, durationMs };
}

function parseFlacDuration(bytes) {
  if (bytes.length < 42 || ascii(bytes, 0, 4) !== "fLaC") return 0;
  const sr = ((bytes[18] << 12) | (bytes[19] << 4) | (bytes[20] >> 4)) >>> 0;
  const hi = bytes[21] & 0x0f;
  const lo = ((bytes[22] << 24) | (bytes[23] << 16) | (bytes[24] << 8) | bytes[25]) >>> 0;
  const samples = hi * 0x100000000 + lo;
  if (!sr || !samples) return 0;
  return Math.round((samples / sr) * 1000);
}

function findAtomOffset(bytes, type) {
  const t0 = type.charCodeAt(0);
  const t1 = type.charCodeAt(1);
  const t2 = type.charCodeAt(2);
  const t3 = type.charCodeAt(3);
  for (let i = 0; i + 8 <= bytes.length; i++) {
    if (bytes[i + 4] === t0 && bytes[i + 5] === t1 && bytes[i + 6] === t2 && bytes[i + 7] === t3) {
      return i;
    }
  }
  return -1;
}

async function readJsTagsUncached(uri) {
  const empty = {};
  const readable = await ensureReadableUri(uri);
  if (!readable) return empty;

  let size = 0;
  try {
    const info = await FileSystem.getInfoAsync(readable);
    if (info?.exists && typeof info.size === "number") size = info.size;
  } catch {
    return empty;
  }
  if (!size) return empty;

  const headLen = Math.min(size, 512 * 1024);
  const head = await readBytes(readable, 0, headLen);
  let tags = {};
  let durationMs = 0;
  let id3Size = 0;

  if (ascii(head, 0, 3) === "ID3") {
    const declared = 10 + synchsafe(head, 6);
    const need = Math.min(size, Math.max(declared + 8192, 64 * 1024), 2 * 1024 * 1024);
    const id3Buf = need > head.length ? await readBytes(readable, 0, need) : head;
    const parsed = parseId3(id3Buf);
    tags = parsed.tags;
    id3Size = parsed.tagSize;
    const xingSrc = id3Buf.length >= id3Size + 8192 ? id3Buf : await readBytes(readable, 0, Math.min(size, id3Size + 8192));
    durationMs = parseXingDuration(xingSrc, id3Size, size);
  } else if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) {
    durationMs = parseXingDuration(head, 0, size);
  }

  if (ascii(head, 4, 4) === "ftyp" || ascii(head, 4, 4) === "moov") {
    let mp4 = parseMp4(head);
    if (!mp4.durationMs || Object.keys(mp4.tags).length === 0) {
      const tailLen = Math.min(size, 2 * 1024 * 1024);
      const tailPos = Math.max(0, size - tailLen);
      const tail = await readBytes(readable, tailPos, tailLen);
      const moovAt = findAtomOffset(tail, "moov");
      if (moovAt >= 0) {
        mp4 = parseMp4(tail.subarray(moovAt));
      }
    }
    tags = { ...mp4.tags, ...tags };
    if (mp4.durationMs > 0) durationMs = mp4.durationMs;
  }

  if (ascii(head, 0, 4) === "fLaC") {
    const flacMs = parseFlacDuration(head);
    if (flacMs > 0) durationMs = flacMs;
  }

  if (!tags.title || !tags.artist) {
    const tail = await readBytes(readable, Math.max(0, size - 128), Math.min(128, size));
    const v1 = parseId3v1(tail);
    tags = { ...v1, ...tags };
  }

  if (durationMs > 0) tags.duration = durationMs;
  return tags;
}

export async function readJsTags(uri) {
  if (!uri) return {};
  if (lastRead.uri === uri && lastRead.promise) return lastRead.promise;
  const promise = readJsTagsUncached(uri).catch((err) => {
    console.warn("JS tag read failed:", err);
    return {};
  });
  lastRead = { uri, promise };
  return promise;
}

export async function readJsArtwork(uri) {
  const tags = await readJsTags(uri);
  return tags.artworkDataUri || null;
}

export async function getDurationSeconds(uri) {
  const tags = await readJsTags(uri);
  const n = Number(tags.duration) || 0;
  if (n <= 0) return 0;
  if (n > 10000) return Math.round(n / 1000);
  return Math.round(n);
}

function isCoverName(filename) {
  return COVER_NAMES.has(String(filename || "").toLowerCase());
}

function coverRank(filename) {
  const idx = COVER_PREF.indexOf(String(filename || "").toLowerCase());
  return idx === -1 ? COVER_PREF.length : idx;
}

async function isLikelyDirectory(uri) {
  try {
    await FileSystem.StorageAccessFramework.readDirectoryAsync(uri);
    return true;
  } catch {
    return false;
  }
}

async function walkFolderCovers(folderUri, map) {
  let entries;
  try {
    entries = await FileSystem.StorageAccessFramework.readDirectoryAsync(folderUri);
  } catch {
    return;
  }

  const audios = [];
  const covers = [];
  const dirs = [];

  for (const entry of entries) {
    const name = (getFilenameFromUri(entry) || "").toLowerCase();
    const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
    if (AUDIO_EXT.has(ext)) audios.push(entry);
    else if (isCoverName(name)) covers.push(entry);
    else dirs.push(entry);
  }

  if (covers.length && audios.length) {
    covers.sort((a, b) => coverRank(getFilenameFromUri(a)) - coverRank(getFilenameFromUri(b)));
    const cover = covers[0];
    for (const audio of audios) map.set(audio, cover);
  }

  for (const dir of dirs) {
    if (await isLikelyDirectory(dir)) {
      await walkFolderCovers(dir, map);
    }
  }
}

async function buildFolderCoverIndex() {
  const saved = getSavedMusicFolder();
  if (!saved?.uri) return new Map();
  const map = new Map();
  await walkFolderCovers(saved.uri, map);
  return map;
}

export async function findFolderCover(fileUri) {
  if (!fileUri) return null;
  try {
    if (!folderCoverIndex) folderCoverIndex = await buildFolderCoverIndex();
    return folderCoverIndex.get(fileUri) || null;
  } catch (err) {
    console.warn("Folder cover lookup failed:", err);
    return null;
  }
}

export function resetFolderCoverIndex() {
  folderCoverIndex = null;
}

export async function readTagsFromFile(uri) {
  const tags = await readJsTags(uri);
  if (!tags) return {};
  return {
    ...tags,
    artwork: tags.artworkDataUri || tags.artwork || null,
  };
}

export default {
  copyToReadableFile,
  ensureReadableUri,
  releaseReadableCopy,
  readJsTags,
  readJsArtwork,
  readTagsFromFile,
  getDurationSeconds,
  findFolderCover,
  resetFolderCoverIndex,
};
