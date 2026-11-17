#!/usr/bin/env node
// xenaxio: the app's icons, splash, notification icon and in-app logos from the Xenaxio mark.
// Run by hand when the mark changes; the results are committed.
//
//   node scripts/xenaxio-icons.mjs --webmail <webmail checkout>
//
// Sources in the webmail: public/xenrooms/icon-512.png (the mark, transparent) and
// public/xenrooms/icon-maskable-512.png (the mark on its dark field). The logos keep
// Bulwark's file names, so the screens that show them need no change.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = process.argv.indexOf('--webmail');
if (at === -1) throw new Error('--webmail is required');
const webmail = path.resolve(process.argv[at + 1]);
const sharp = createRequire(path.join(webmail, 'package.json'))('sharp');
const MARK = path.join(webmail, 'public/xenrooms/icon-512.png');
const FIELD = path.join(webmail, 'public/xenrooms/icon-maskable-512.png');
const res = path.join(ROOT, 'android/app/src/main/res');
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const png = (input, size) => sharp(input).resize(size, size, { kernel: 'lanczos3' }).png({ compressionLevel: 9 });
/** The mark at `scale` of a transparent square of `size`. */
async function padded(size, scale) {
  const inner = Math.round(size * scale);
  const mark = await sharp(MARK).resize(inner, inner).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: mark, gravity: 'center' }]).png({ compressionLevel: 9 });
}
async function silhouette(size, scale) {
  const base = await (await padded(size, scale)).toBuffer();
  const alpha = await sharp(base).ensureAlpha().extractChannel(3).raw().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 3, background: { r: 255, g: 255, b: 255 } } }).joinChannel(alpha, { raw: { width: size, height: size, channels: 1 } }).png({ compressionLevel: 9 });
}

// Expo: the iOS icon is opaque (the dark field), Android's adaptive foreground keeps to its safe zone.
await (await png(FIELD, 1024)).flatten({ background: '#050b1a' }).toFile(path.join(ROOT, 'assets/icon.png'));
await (await padded(1024, 0.62)).toFile(path.join(ROOT, 'assets/adaptive-icon.png'));
await (await padded(1024, 0.6)).toFile(path.join(ROOT, 'assets/splash-icon.png'));
await png(MARK, 128).toFile(path.join(ROOT, 'assets/favicon.png'));
for (const name of ['Bulwark Logo Color.png', 'Bulwark Logo Dark.png', 'Bulwark Logo White.png']) {
  await png(MARK, 512).toFile(path.join(ROOT, 'assets/logos', name));
}

// Android, kept by hand in this repository.
const round = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><circle cx="256" cy="256" r="256"/></svg>');
rmSync(path.join(res, 'drawable/ic_notification.xml'), { force: true });
for (const [density, k] of Object.entries(DENSITIES)) {
  const dir = path.join(res, `mipmap-${density}`);
  mkdirSync(dir, { recursive: true });
  await sharp(FIELD).resize(Math.round(48 * k), Math.round(48 * k)).webp({ lossless: true }).toFile(path.join(dir, 'ic_launcher.webp'));
  const circle = await sharp(FIELD).resize(512, 512).composite([{ input: round, blend: 'dest-in' }]).png().toBuffer();
  await sharp(circle).resize(Math.round(48 * k), Math.round(48 * k)).webp({ lossless: true }).toFile(path.join(dir, 'ic_launcher_round.webp'));
  await (await padded(Math.round(108 * k), 0.6)).webp({ lossless: true }).toFile(path.join(dir, 'ic_launcher_foreground.webp'));
  const drawable = path.join(res, `drawable-${density}`);
  mkdirSync(drawable, { recursive: true });
  await (await padded(Math.round(288 * k), 0.75)).toFile(path.join(drawable, 'splashscreen_logo.png'));
  await (await silhouette(Math.round(24 * k), 0.92)).toFile(path.join(drawable, 'ic_notification.png'));
}
console.log('[xenaxio-icons] done');
