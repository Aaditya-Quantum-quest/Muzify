import { useEffect, useState } from "react";
import { File } from "expo-file-system";
/*
 * Artwork palette extraction.
 *
 * Reads the cached album-art file for a song, decodes it with the already
 * linked react-native-skia (no new native dependency), downsamples it, and
 * distills 4 colors that share the artwork's dominant hue — a dark shade, two
 * midtones and a light highlight — suitable for a gradient border / button
 * background on the dark UI. The lightest stop is always kept bright enough
 * for the dark "View Details" label to stay readable, regardless of what
 * colors the artwork contains.
 *
 * Everything is cached per URI and failures resolve to null so callers can
 * fall back to their static accent gradient.
 */

const SAMPLE = 48; // downsampled grid used for color statistics
const MAX_ARTWORK_BYTES = 8 * 1024 * 1024;

let skiaPromise = null;
const loadSkia = () => {
  if (!skiaPromise) {
    // Lazy import: keeps web (no CanvasKit) and any Skia hiccup from
    // breaking the app — extraction simply falls back to the static colors.
    // The whole namespace is kept because ColorType / AlphaType are top-level
    // enum exports of the package, NOT members of the Skia object.
    skiaPromise = import("@shopify/react-native-skia")
      .then((m) => (m.Skia && m.ColorType && m.AlphaType ? m : null))
      .catch(() => null);
  }
  return skiaPromise;
};

/* ------------------------------ color math ------------------------------ */

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h: h * 360, s, l };
}

function hslToHex(h, s, l) {
  const hn = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t) => {
    let tn = t;
    tn = ((tn % 1) + 1) % 1;
    let v;
    if (tn < 1 / 6) v = p + (q - p) * 6 * tn;
    else if (tn < 1 / 2) v = q;
    else if (tn < 2 / 3) v = p + (q - p) * (2 / 3 - tn) * 6;
    else v = p;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  };
  const toHex = (v) => v.toString(16).padStart(2, "0");
  return `#${toHex(channel(hn + 1 / 3))}${toHex(channel(hn))}${toHex(channel(hn - 1 / 3))}`;
}

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];

/* ---------------------------- pixel sampling ---------------------------- */

function samplePixels(Skia, ColorType, AlphaType, image) {
  const colorType = ColorType.RGBA_8888;
  const w = image.width();
  const h = image.height();
  if (!(w > 0 && h > 0)) return null;

  // Preferred path: draw into a tiny offscreen surface and read that.
  try {
    const surface = Skia.Surface.MakeOffscreen(SAMPLE, SAMPLE);
    if (surface) {
      const canvas = surface.getCanvas();
      canvas.scale(SAMPLE / w, SAMPLE / h);
      canvas.drawImage(image, 0, 0);
      const snapshot = surface.makeImageSnapshot();
      let pixels = null;
      for (const alphaType of [AlphaType.Unpremul, AlphaType.Premul]) {
        pixels = snapshot.readPixels(0, 0, {
          width: SAMPLE,
          height: SAMPLE,
          colorType,
          alphaType,
        });
        if (pixels && pixels.length >= SAMPLE * SAMPLE * 4) break;
      }
      snapshot.dispose();
      surface.dispose();
      if (pixels && pixels.length >= SAMPLE * SAMPLE * 4) return pixels;
    }
  } catch {
    // fall through to the full-size read
  }

  // Fallback: read the decoded image directly and let the quantizer stride
  // over it (only reached when offscreen surfaces are unavailable).
  try {
    for (const alphaType of [AlphaType.Unpremul, AlphaType.Premul]) {
      const pixels = image.readPixels(0, 0, { width: w, height: h, colorType, alphaType });
      if (pixels && pixels.length >= w * h * 4) return pixels;
    }
  } catch {
    // no pixel access on this platform
  }
  return null;
}

/* ----------------------------- quantization ----------------------------- */

function buildPalette(pixels, count) {
  const n = Math.floor(pixels.length / 4);
  if (!n) return null;

  const BUCKETS = 12; // 30° hue sectors
  const bucketWeight = new Float64Array(BUCKETS);
  const family = []; // { h, s, l, w } of the dominant sector
  let grayL = 0;
  let grayN = 0;

  for (let i = 0; i < n; i += 1) {
    const a = pixels[i * 4 + 3];
    if (a < 100) continue;
    const { h, s, l } = rgbToHsl(pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]);
    if (s < 0.08) {
      grayL += l;
      grayN += 1;
      continue;
    }
    // Colorful, not-too-dark pixels carry the most information.
    const w = s * s * (0.25 + 0.75 * Math.min(1, l * 1.8));
    bucketWeight[Math.min(BUCKETS - 1, Math.floor(h / (360 / BUCKETS)))] += w;
    family.push({ h, s, l, w });
  }

  if (family.length < n * 0.05) {
    // Essentially monochrome artwork: neutral ramp around its brightness.
    const avgL = grayN ? grayL / grayN : 0.5;
    const lo = Math.min(0.42, Math.max(0.24, avgL * 0.7));
    const hi = Math.max(lo + 0.42, Math.min(0.94, avgL + 0.4));
    return ramp(0, 0.1, lo, hi, count);
  }

  let dominant = 0;
  for (let i = 1; i < BUCKETS; i += 1) {
    if (bucketWeight[i] > bucketWeight[dominant]) dominant = i;
  }
  const center = (dominant + 0.5) * (360 / BUCKETS);

  // Circular mean hue of the dominant family + its luminance spread.
  let sin = 0;
  let cos = 0;
  let satW = 0;
  let includedW = 0;
  const ls = [];
  for (const p of family) {
    let d = Math.abs(p.h - center);
    if (d > 180) d = 360 - d;
    if (d > 30) continue;
    sin += Math.sin((p.h * Math.PI) / 180) * p.w;
    cos += Math.cos((p.h * Math.PI) / 180) * p.w;
    satW += p.s * p.w;
    includedW += p.w;
    ls.push(p.l);
  }
  if (!ls.length) return ramp(0, 0.1, 0.3, 0.9, count);

  const hue = ((Math.atan2(sin, cos) * 180) / Math.PI + 360) % 360;
  const sat = Math.min(1, Math.max(0.35, (satW / (includedW || 1)) * 1.15));

  ls.sort((a, b) => a - b);
  let lo = Math.min(0.42, Math.max(0.24, quantile(ls, 0.15)));
  let hi = Math.max(lo + 0.4, Math.min(0.94, Math.max(0.74, quantile(ls, 0.9))));
  hi = Math.min(0.94, Math.max(hi, lo + 0.4));

  return ramp(hue, sat, lo, hi, count);
}

// count evenly spaced stops from dark to light. Saturation tapers toward the
// highlight so the lightest stop reads creamy instead of garish.
function ramp(h, s, lo, hi, count) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 1 : i / (count - 1);
    out.push(hslToHex(h, s * (1 - 0.45 * t), lo + (hi - lo) * t));
  }
  return out;
}

/* ------------------------------- pipeline ------------------------------- */

async function extractPalette(uri, count = 4) {
  const skia = await loadSkia();
  if (!skia) return null;
  const { Skia, ColorType, AlphaType } = skia;

  // Load the encoded image. Skia reads the file natively, which sidesteps
  // expo-file-system's URI decoding quirks with Expo Go's doubly-encoded
  // cache paths (legacy readAsStringAsync rejects them as "isn't readable").
  let data = null;
  try {
    data = await Skia.Data.fromURI(uri);
  } catch {
    data = null;
  }
  if (!data) {
    // Fall back to the modern File API read.
    try {
      const file = new File(uri);
      if (file.exists && file.size > 0 && file.size <= MAX_ARTWORK_BYTES) {
        data = Skia.Data.fromBase64(await file.base64());
      }
    } catch {
      data = null;
    }
  }
  if (!data) {
    console.warn("[palette] could not read artwork file:", uri);
    return null;
  }

  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) return null;

  const pixels = samplePixels(Skia, ColorType, AlphaType, image);
  if (!pixels) return null;
  return buildPalette(pixels, count);
}

const resolvedCache = new Map();
const pending = new Map();

export function getArtworkPalette(uri, count = 4) {
  if (!uri) return Promise.resolve(null);
  if (resolvedCache.has(uri)) return Promise.resolve(resolvedCache.get(uri));
  if (pending.has(uri)) return pending.get(uri);

  const task = extractPalette(uri, count)
    .then((palette) => {
      resolvedCache.set(uri, palette);
      pending.delete(uri);
      return palette;
    })
    .catch((error) => {
      pending.delete(uri);
      console.warn("[palette] extraction failed:", uri, error?.message ?? error);
      return null;
    });
  pending.set(uri, task);
  return task;
}

export function clearArtworkPaletteCache() {
  resolvedCache.clear();
}

// React hook: null until the palette (or a failure) resolves. Callers keep
// their static accent colors as the fallback so nothing flashes.
export function useArtworkPalette(uri) {
  const [entry, setEntry] = useState(null);
  useEffect(() => {
    if (!uri) return undefined;
    let cancelled = false;
    getArtworkPalette(uri).then((palette) => {
      if (!cancelled) setEntry({ uri, palette });
    });
    return () => {
      cancelled = true;
    };
  }, [uri]);
  return entry && entry.uri === uri ? entry.palette : null;
}
