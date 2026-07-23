import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'assets', 'brand-logo.png');
const SPLASH_SOURCE = path.join(ROOT, 'assets', 'builtglory5.png');
const ASSETS = path.join(ROOT, 'assets');
const ANDROID_RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/** Near-white paper background threshold — keep navy/red mark only. */
const PAPER_THRESHOLD = 220;

/**
 * Crop brand-logo.png down to the house/handshake mark and make paper transparent.
 * Source is a wide paper mockup; without this, Android shows a grey rectangle icon.
 */
async function extractLogoMark() {
  const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  const out = Buffer.from(data);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * channels;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const isPaper = r >= PAPER_THRESHOLD && g >= PAPER_THRESHOLD && b >= PAPER_THRESHOLD;

      if (isPaper) {
        out[i + 3] = 0;
        continue;
      }

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error('Could not find logo mark in brand-logo.png');
  }

  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.06);
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const cropWidth = Math.min(width - left, maxX - minX + 1 + pad * 2);
  const cropHeight = Math.min(height - top, maxY - minY + 1 + pad * 2);
  const side = Math.max(cropWidth, cropHeight);

  const cropped = await sharp(out, { raw: { width, height, channels } })
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .png()
    .toBuffer();

  // Center the mark on a transparent square (do not clip when pad exceeds image edges).
  return sharp({
    create: {
      width: side,
      height: side,
      channels: 4,
      background: TRANSPARENT,
    },
  })
    .composite([
      {
        input: cropped,
        left: Math.round((side - cropWidth) / 2),
        top: Math.round((side - cropHeight) / 2),
      },
    ])
    .png()
    .toBuffer();
}

async function composeLandscapeSplash(size, { logoWidthRatio = 0.78, background = TRANSPARENT, format = 'png' } = {}) {
  const meta = await sharp(SPLASH_SOURCE).metadata();
  const aspect = meta.width / meta.height;
  const logoWidth = Math.round(size * logoWidthRatio);
  const logoHeight = Math.round(logoWidth / aspect);
  const logo = await sharp(SPLASH_SOURCE)
    .resize(logoWidth, logoHeight, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toBuffer();

  const left = Math.round((size - logoWidth) / 2);
  const top = Math.round((size - logoHeight) / 2);

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

async function composeLogo(markBuffer, size, { logoScale = 0.72, background = WHITE, format = 'png' } = {}) {
  // Adaptive icons crop outer ~18%; keep mark inside ~66% safe zone while filling it.
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

async function main() {
  const mark = await extractLogoMark();
  await writePng(path.join(ASSETS, 'logo-mark.png'), mark);

  // Full icon: white plate + mark. Adaptive foreground: transparent + larger mark.
  const icon1024 = await composeLogo(mark, 1024, { logoScale: 0.78, background: WHITE });
  const foreground1024 = await composeLogo(mark, 1024, { logoScale: 0.72, background: TRANSPARENT });
  const background1024 = await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: WHITE },
  })
    .png()
    .toBuffer();
  const monochrome1024 = await generateMonochrome(mark, 1024, 0.72);
  const favicon48 = await composeLogo(mark, 48, { logoScale: 0.78, background: WHITE });
  const splash1242 = await composeLandscapeSplash(1242, { logoWidthRatio: 0.78, background: WHITE });

  await writePng(path.join(ASSETS, 'icon.png'), icon1024);
  await writePng(path.join(ASSETS, 'adaptive-icon.png'), foreground1024);
  await writePng(path.join(ASSETS, 'android-icon-foreground.png'), foreground1024);
  await writePng(path.join(ASSETS, 'android-icon-background.png'), background1024);
  await writePng(path.join(ASSETS, 'android-icon-monochrome.png'), monochrome1024);
  await writePng(path.join(ASSETS, 'favicon.png'), favicon48);
  await writePng(path.join(ASSETS, 'splash-icon.png'), splash1242);

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
    const splash = await composeLandscapeSplash(size, { logoWidthRatio: 0.78, background: TRANSPARENT });
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
    const notification = await composeLogo(mark, size, { logoScale: 0.85, background: TRANSPARENT });
    await writePng(path.join(ANDROID_RES, `drawable-${density}`, 'notification_icon.png'), notification);
  }

  console.log('Brand icons generated successfully.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
