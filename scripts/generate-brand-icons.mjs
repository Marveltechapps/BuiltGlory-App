import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'assets', 'brand-logo.png');
const ASSETS = path.join(ROOT, 'assets');
const ANDROID_RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/** Near-white paper background threshold — keep navy/red mark only. */
const PAPER_THRESHOLD = 220;

/**
 * Find non-empty content bounds. Treat near-white (and optional transparent) as empty.
 * Ignore sparse specks so a few paper-grain pixels cannot shift the crop.
 */
function contentBounds(data, width, height, channels, { paperThreshold = null, minLineInk = 5 } = {}) {
  const colCounts = new Array(width).fill(0);
  const rowCounts = new Array(height).fill(0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * channels;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = channels > 3 ? data[i + 3] : 255;

      if (a < 10) continue;
      if (paperThreshold != null && r >= paperThreshold && g >= paperThreshold && b >= paperThreshold) {
        continue;
      }

      colCounts[x] += 1;
      rowCounts[y] += 1;
    }
  }

  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;

  for (let x = 0; x < width; x += 1) {
    if (colCounts[x] >= minLineInk) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  for (let y = 0; y < height; y += 1) {
    if (rowCounts[y] >= minLineInk) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error('Could not find non-empty content bounds');
  }

  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/** Place a PNG buffer centered on a square canvas with equal padding. */
async function centerOnSquare(inputPng, { padRatio = 0.06, background = TRANSPARENT } = {}) {
  const { data, info } = await sharp(inputPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bounds = contentBounds(data, info.width, info.height, info.channels);
  const cropped = await sharp(inputPng)
    .extract(bounds)
    .png()
    .toBuffer();

  const side = Math.max(bounds.width, bounds.height) + Math.round(Math.max(bounds.width, bounds.height) * padRatio) * 2;

  return sharp({
    create: {
      width: side,
      height: side,
      channels: 4,
      background,
    },
  })
    .composite([
      {
        input: cropped,
        left: Math.round((side - bounds.width) / 2),
        top: Math.round((side - bounds.height) / 2),
      },
    ])
    .png()
    .toBuffer();
}

/**
 * Crop brand-logo.png down to the house/handshake mark and make paper transparent.
 * Source is a wide paper mockup; without this, Android shows a grey rectangle icon.
 */
async function extractLogoMark() {
  const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const out = Buffer.from(data);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * channels;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const isPaper = r >= PAPER_THRESHOLD && g >= PAPER_THRESHOLD && b >= PAPER_THRESHOLD;
      if (isPaper) out[i + 3] = 0;
    }
  }

  const transparentPng = await sharp(out, { raw: { width, height, channels } }).png().toBuffer();
  return centerOnSquare(transparentPng, { padRatio: 0.06, background: TRANSPARENT });
}

async function composeLogo(markBuffer, size, { logoScale = 0.72, background = WHITE, format = 'png' } = {}) {
  const logoSize = Math.round(size * logoScale);
  const logo = await sharp(markBuffer)
    .resize(logoSize, logoSize, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toBuffer();

  const left = Math.round((size - logoSize) / 2);
  const top = Math.round((size - logoSize) / 2);

  let pipeline = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  }).composite([{ input: logo, left, top }]);

  if (format === 'webp') {
    return pipeline.webp({ quality: 95 }).toBuffer();
  }

  return pipeline.png().toBuffer();
}

async function writePng(targetPath, buffer) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, buffer);
}

async function writeWebp(targetPath, buffer) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, buffer);
}

async function generateMonochrome(markBuffer, size, logoScale = 0.72) {
  const logoSize = Math.round(size * logoScale);
  const logo = await sharp(markBuffer)
    .resize(logoSize, logoSize, { fit: 'contain', background: TRANSPARENT })
    .grayscale()
    .threshold(180)
    .png()
    .toBuffer();

  const left = Math.round((size - logoSize) / 2);
  const top = Math.round((size - logoSize) / 2);

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: TRANSPARENT,
    },
  })
    .composite([{ input: logo, left, top }])
    .png()
    .toBuffer();
}

/** Android status-bar / Expo notification icon: white silhouette on transparent. */
async function generateNotificationIcon(markBuffer, size, logoScale = 0.85) {
  const logoSize = Math.round(size * logoScale);
  const { data, info } = await sharp(markBuffer)
    .resize(logoSize, logoSize, { fit: 'contain', background: TRANSPARENT })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] > 10) {
      out[i] = 255;
      out[i + 1] = 255;
      out[i + 2] = 255;
    }
  }

  const whiteLogo = await sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();

  const left = Math.round((size - logoSize) / 2);
  const top = Math.round((size - logoSize) / 2);

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: TRANSPARENT,
    },
  })
    .composite([{ input: whiteLogo, left, top }])
    .png()
    .toBuffer();
}

async function androidResExists() {
  try {
    await fs.access(ANDROID_RES);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await fs.access(SOURCE);

  const mark = await extractLogoMark();
  await writePng(path.join(ASSETS, 'logo-mark.png'), mark);

  // Full icon: white plate + mark. Adaptive foreground: transparent + mark inside the 66% safe zone.
  const icon1024 = await composeLogo(mark, 1024, { logoScale: 0.78, background: WHITE });
  const foreground1024 = await composeLogo(mark, 1024, { logoScale: 0.72, background: TRANSPARENT });
  const background1024 = await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: WHITE },
  })
    .png()
    .toBuffer();
  const monochrome1024 = await generateMonochrome(mark, 1024, 0.72);
  const favicon48 = await composeLogo(mark, 48, { logoScale: 0.78, background: WHITE });
  const play512 = await composeLogo(mark, 512, { logoScale: 0.78, background: WHITE });
  const notification96 = await generateNotificationIcon(mark, 96, 0.85);
  // Expo Go / legacy splash uses contain on the full image — keep the mark ~58% so it stays centered and not full-bleed.
  const splash1242 = await composeLogo(mark, 1242, { logoScale: 0.58, background: WHITE });

  await writePng(path.join(ASSETS, 'icon.png'), icon1024);
  await writePng(path.join(ASSETS, 'adaptive-icon.png'), foreground1024);
  await writePng(path.join(ASSETS, 'android-icon-foreground.png'), foreground1024);
  await writePng(path.join(ASSETS, 'android-icon-background.png'), background1024);
  await writePng(path.join(ASSETS, 'android-icon-monochrome.png'), monochrome1024);
  await writePng(path.join(ASSETS, 'favicon.png'), favicon48);
  await writePng(path.join(ASSETS, 'play-store-icon.png'), play512);
  await writePng(path.join(ASSETS, 'notification-icon.png'), notification96);
  await writePng(path.join(ASSETS, 'splash-icon.png'), splash1242);

  if (await androidResExists()) {
    const mipmapSizes = {
      mdpi: 48,
      hdpi: 72,
      xhdpi: 96,
      xxhdpi: 144,
      xxxhdpi: 192,
    };

    for (const [density, size] of Object.entries(mipmapSizes)) {
      const dir = path.join(ANDROID_RES, `mipmap-${density}`);
      const launcher = await composeLogo(mark, size, { logoScale: 0.78, background: WHITE, format: 'webp' });
      const foreground = await composeLogo(mark, size, { logoScale: 0.72, background: TRANSPARENT, format: 'webp' });
      const background = await sharp({
        create: { width: size, height: size, channels: 4, background: WHITE },
      })
        .webp({ quality: 95 })
        .toBuffer();
      const monochrome = await generateMonochrome(mark, size, 0.72);
      const monochromeWebp = await sharp(monochrome).webp({ quality: 95 }).toBuffer();

      await writeWebp(path.join(dir, 'ic_launcher.webp'), launcher);
      await writeWebp(path.join(dir, 'ic_launcher_round.webp'), launcher);
      await writeWebp(path.join(dir, 'ic_launcher_foreground.webp'), foreground);
      await writeWebp(path.join(dir, 'ic_launcher_background.webp'), background);
      await writeWebp(path.join(dir, 'ic_launcher_monochrome.webp'), monochromeWebp);
    }

    const splashSizes = {
      mdpi: 200,
      hdpi: 300,
      xhdpi: 400,
      xxhdpi: 600,
      xxxhdpi: 800,
    };

    for (const [density, size] of Object.entries(splashSizes)) {
      const splash = await composeLogo(mark, size, { logoScale: 0.72, background: TRANSPARENT });
      await writePng(path.join(ANDROID_RES, `drawable-${density}`, 'splashscreen_logo.png'), splash);
    }

    const notificationSizes = {
      mdpi: 24,
      hdpi: 36,
      xhdpi: 48,
      xxhdpi: 72,
      xxxhdpi: 96,
    };

    for (const [density, size] of Object.entries(notificationSizes)) {
      const notification = await generateNotificationIcon(mark, size, 0.85);
      await writePng(path.join(ANDROID_RES, `drawable-${density}`, 'notification_icon.png'), notification);
    }
  }

  console.log('Brand icons generated from assets/brand-logo.png');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
