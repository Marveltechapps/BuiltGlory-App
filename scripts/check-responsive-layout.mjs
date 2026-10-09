/**
 * Lightweight layout resolution smoke checks (no RN runtime required).
 * Run: node scripts/check-responsive-layout.mjs
 */
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mirror of resolveLayout math for CI-friendly checks without transpiling TS.
const BREAKPOINTS = {
  phoneSm: 360,
  phoneLg: 430,
  tabletSm: 600,
  tablet: 768,
  desktop: 1024,
  desktopLg: 1280,
};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function gridItemWidth(availableWidth, columns, gap) {
  if (columns <= 0) return availableWidth;
  return (availableWidth - gap * (columns - 1)) / columns;
}

function resolveLayout(width, height) {
  const isLandscape = width > height;
  const isPhoneSm = width < BREAKPOINTS.phoneSm;
  const isTabletSm = width >= BREAKPOINTS.tabletSm;
  const isTablet = width >= BREAKPOINTS.tablet;
  const isDesktop = width >= BREAKPOINTS.desktop;

  const gutter = isDesktop ? 32 : isTablet ? 24 : isTabletSm ? 20 : 16;
  const gap = isTablet ? 14 : isTabletSm ? 12 : 10;
  const contentMaxWidth = isDesktop ? 1100 : isTablet && isLandscape ? 960 : isTablet ? 840 : null;
  const contentWidth = contentMaxWidth ? Math.min(width, contentMaxWidth) : width;

  let propertyColumns = 2;
  if (width >= BREAKPOINTS.desktopLg) propertyColumns = 4;
  else if (width >= BREAKPOINTS.desktop) propertyColumns = 3;
  else if (width >= BREAKPOINTS.tablet) propertyColumns = 3;
  else if (width >= BREAKPOINTS.tabletSm) propertyColumns = 2;
  if (isPhoneSm && width < 340) propertyColumns = 1;

  let typeColumns = 3;
  if (width < 340) typeColumns = 2;
  else if (width < BREAKPOINTS.tabletSm) typeColumns = 3;
  else if (width < BREAKPOINTS.desktop) typeColumns = 4;
  else typeColumns = 5;

  let tileColumns = 4;
  if (width < 340) tileColumns = 3;
  else if (width >= BREAKPOINTS.tablet) tileColumns = 6;
  else if (width >= BREAKPOINTS.tabletSm) tileColumns = 5;

  const usableCardWidth = Math.max(180, contentWidth - gutter * 2);

  const carouselCardWidth = clamp(
    Math.round(contentWidth * (isTablet ? 0.38 : isTabletSm ? 0.42 : 0.68)),
    Math.min(isPhoneSm ? 200 : 220, usableCardWidth),
    Math.min(usableCardWidth, isDesktop ? 320 : isTablet ? 300 : 280),
  );

  const bannerCardWidth = clamp(
    Math.round(contentWidth * (isTablet ? 0.55 : isTabletSm ? 0.62 : 0.78)),
    Math.min(isPhoneSm ? 220 : 240, usableCardWidth),
    Math.min(usableCardWidth, isDesktop ? 480 : isTablet ? 420 : 340),
  );

  const shortSide = Math.min(width, height);
  const heroHeight = clamp(
    Math.round(shortSide * (isLandscape ? 0.42 : isTablet ? 0.38 : 0.52)),
    isLandscape ? 180 : 220,
    isTablet ? 360 : 300,
  );

  return {
    width,
    height,
    isLandscape,
    isPhoneSm,
    isTabletSm,
    isTablet,
    isDesktop,
    gutter,
    gap,
    contentMaxWidth,
    contentWidth,
    propertyColumns,
    typeColumns,
    tileColumns,
    carouselCardWidth,
    bannerCardWidth,
    heroHeight,
  };
}

const VIEWPORTS = [
  [320, 568, 'iPhone SE / small Android'],
  [360, 800, 'Common Android'],
  [375, 812, 'iPhone X/11/12 mini'],
  [390, 844, 'iPhone 12/13/14'],
  [414, 896, 'iPhone XR/11'],
  [430, 932, 'iPhone 14/15 Pro Max'],
  [600, 1024, 'Android tablet sm'],
  [768, 1024, 'iPad portrait'],
  [820, 1180, 'iPad Air'],
  [834, 1194, 'iPad Pro 11'],
  [1024, 1366, 'iPad Pro 12.9'],
  [1024, 768, 'Desktop / iPad landscape'],
  [1280, 720, 'Desktop HD'],
  [1366, 768, 'Laptop'],
  [1440, 900, 'Desktop'],
  [1920, 1080, 'Full HD'],
  // Landscape phones
  [812, 375, 'iPhone landscape'],
  [932, 430, 'Large phone landscape'],
];

let failed = 0;
console.log('BuiltGlory responsive layout matrix\n');
console.log(
  [
    'label'.padEnd(28),
    'WxH'.padEnd(12),
    'props'.padStart(5),
    'types'.padStart(5),
    'tiles'.padStart(5),
    'gutter'.padStart(7),
    'banner'.padStart(7),
    'card'.padStart(6),
    'hero'.padStart(6),
    'maxW'.padStart(6),
  ].join(' '),
);

for (const [w, h, label] of VIEWPORTS) {
  const L = resolveLayout(w, h);
  const typeItem = gridItemWidth(L.contentWidth - L.gutter * 2, L.typeColumns, L.gap);
  const propItem = gridItemWidth(L.contentWidth - L.gutter * 2, L.propertyColumns, L.gap);

  const ok =
    typeItem > 0 &&
    propItem > 0 &&
    L.bannerCardWidth <= L.contentWidth - L.gutter &&
    L.carouselCardWidth <= L.contentWidth - L.gutter &&
    L.heroHeight >= 160 &&
    L.heroHeight <= Math.max(h, w) &&
    (L.contentMaxWidth == null || L.contentWidth <= L.contentMaxWidth + 0.5);

  if (!ok) failed += 1;

  console.log(
    [
      (ok ? '✓ ' : '✗ ') + label.padEnd(26),
      `${w}x${h}`.padEnd(12),
      String(L.propertyColumns).padStart(5),
      String(L.typeColumns).padStart(5),
      String(L.tileColumns).padStart(5),
      String(L.gutter).padStart(7),
      String(L.bannerCardWidth).padStart(7),
      String(L.carouselCardWidth).padStart(6),
      String(L.heroHeight).padStart(6),
      String(L.contentMaxWidth ?? '-').padStart(6),
    ].join(' '),
  );
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}: ${VIEWPORTS.length - failed}/${VIEWPORTS.length} viewports OK`);
process.exit(failed === 0 ? 0 : 1);
