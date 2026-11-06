import * as FileSystem from "expo-file-system/legacy";

const TEXT_DECODER = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8") : null;

function decodeBytes(bytes) {
  if (!bytes || !bytes.length) return "";
  let start = 0;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    start = 2;
    let out = "";
    for (let i = start; i + 1 < bytes.length; i += 2) {
      const code = bytes[i] | (bytes[i + 1] << 8);
      if (code) out += String.fromCharCode(code);
    }
    return out.trim();
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    start = 2;
    let out = "";
    for (let i = start; i + 1 < bytes.length; i += 2) {
      const code = (bytes[i] << 8) | bytes[i + 1];
      if (code) out += String.fromCharCode(code);
    }
    return out.trim();
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) start = 3;
  const slice = bytes.subarray ? bytes.subarray(start) : bytes.slice(start);
  if (TEXT_DECODER) return TEXT_DECODER.decode(slice).replace(/\0/g, "").trim();
  let out = "";
  for (let i = 0; i < slice.length; i += 1) {
    const b = slice[i];
    if (b) out += String.fromCharCode(b);
  }
  return out.trim();
}

function base64ToBytes(b64) {
  const binary = globalThis.atob ? globalThis.atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return globalThis.btoa ? globalThis.btoa(binary) : Buffer.from(bytes).toString("base64");
}

function readU32(bytes, offset, bigEndian = true) {
  if (bigEndian) {
    return (
      ((bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]) >>>
      0
    );
  }
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function readSynchsafe(bytes, offset) {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  );
}

function ascii(bytes, offset, length) {
  let out = "";
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(bytes[offset + i]);
  return out;
}

async function readBytes(uri, position, length) {
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
    position,
    length,
  });
  return base64ToBytes(b64);
}

function parseId3Text(frame) {
  if (!frame.length) return "";
  const encoding = frame[0];
  const payload = frame.subarray(1);
  if (encoding === 1 || encoding === 2) return decodeBytes(payload);
  return decodeBytes(payload);
}

function parseApic(frame) {
  if (frame.length < 4) return null;
  let i = 1;
  while (i < frame.length && frame[i] !== 0) i += 1;
  i += 2;
  while (i < frame.length && frame[i] !== 0) i += 1;
  i += 1;
  if (i >= frame.length) return null;
  const image = frame.subarray(i);
  if (!image.length) return null;
  return `data:image/jpeg;base64,${bytesToBase64(image)}`;
}

function parseId3(bytes) {
  if (bytes.length < 10 || ascii(bytes, 0, 3) !== "ID3") return null;
  const version = bytes[3];
  const tagSize = readSynchsafe(bytes, 6);
  const end = Math.min(bytes.length, 10 + tagSize);
  const result = {};
  let offset = 10;

  while (offset + 10 < end) {
    const id = ascii(bytes, offset, 4);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const size =
      version === 4
        ? readSynchsafe(bytes, offset + 4)
        : readU32(bytes, offset + 4, true);
    offset += 10;
    if (size <= 0 || offset + size > bytes.length) break;
    const frame = bytes.subarray(offset, offset + size);
    offset += size;
    if (id === "TIT2") result.title = parseId3Text(frame);
    else if (id === "TPE1") result.artist = parseId3Text(frame);
    else if (id === "TALB") result.album = parseId3Text(frame);
    else if (id === "TPE2") result.album_artist = parseId3Text(frame);
    else if (id === "TYER" || id === "TDRC") result.year = parseId3Text(frame);
    else if (id === "TRCK") result.track_number = parseInt(parseId3Text(frame), 10) || 0;
    else if (id === "TLEN") {
      const ms = parseInt(parseId3Text(frame), 10);
      if (ms > 0) result.duration = ms;
    } else if (id === "APIC" && !result.artwork) {
      result.artwork = parseApic(frame);
    }
  }
  return result;
}

function parseMp4(bytes) {
  const result = {};
  const ilstMap = {
    "\u00a9nam": "title",
    "\u00a9ART": "artist",
    "\u00a9alb": "album",
    aART: "album_artist",
    "\u00a9day": "year",
    trkn: "track_number",
    covr: "artwork",
  };

  function walk(start, end) {
    let offset = start;
    while (offset + 8 <= end && offset + 8 <= bytes.length) {
      let size = readU32(bytes, offset, true);
      const type = ascii(bytes, offset + 4, 4);
      if (size === 1 && offset + 16 <= bytes.length) {
        size = readU32(bytes, offset + 12, true);
      }
      if (size < 8) break;
      const boxEnd = Math.min(offset + size, end, bytes.length);
      const dataStart = offset + 8;

      if (type === "moov" || type === "udta" || type === "meta" || type === "ilst" || type === "trak" || type === "mdia") {
        const inner = type === "meta" ? dataStart + 4 : dataStart;
        walk(inner, boxEnd);
      } else if (type === "mvhd" && boxEnd - dataStart >= 24) {
        const version = bytes[dataStart];
        const timescale = version === 1 ? readU32(bytes, dataStart + 20, true) : readU32(bytes, dataStart + 12, true);
        const duration = version === 1 ? readU32(bytes, dataStart + 28, true) : readU32(bytes, dataStart + 16, true);
        if (timescale > 0 && duration > 0) result.duration = Math.round((duration / timescale) * 1000);
      } else if (ilstMap[type]) {
        const key = ilstMap[type];
        let cursor = dataStart;
        while (cursor + 8 <= boxEnd) {
          const childSize = readU32(bytes, cursor, true);
          const childType = ascii(bytes, cursor + 4, 4);
          if (childType === "data" && childSize >= 16) {
            const payload = bytes.subarray(cursor + 16, Math.min(cursor + childSize, boxEnd));
            if (key === "artwork") {
              result.artwork = `data:image/jpeg;base64,${bytesToBase64(payload)}`;
            } else if (key === "track_number" && payload.length >= 6) {
              result.track_number = (payload[2] << 8) | payload[3];
            } else {
              result[key] = decodeBytes(payload);
            }
            break;
          }
          if (childSize < 8) break;
          cursor += childSize;
        }
      }
      offset += size;
    }
  }

  walk(0, bytes.length);
  return Object.keys(result).length ? result : null;
}

export async function readTagsFromFile(uri) {
  if (!uri) return {};
  try {
    const header = await readBytes(uri, 0, 64 * 1024);
    if (ascii(header, 0, 3) === "ID3") {
      const tagSize = readSynchsafe(header, 6);
      const needed = Math.min(10 + tagSize, 512 * 1024);
      const bytes = needed > header.length ? await readBytes(uri, 0, needed) : header;
      return parseId3(bytes) || {};
    }
    if (ascii(header, 4, 4) === "ftyp") {
      const more = await readBytes(uri, 0, 256 * 1024);
      return parseMp4(more) || {};
    }
    return {};
  } catch (error) {
    console.warn("JS tag read failed:", error);
    return {};
  }
}

export default { readTagsFromFile };
