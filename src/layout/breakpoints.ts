import { useMemo } from 'react';
import { useWindowDimensions, PixelRatio } from 'react-native';

/**
 * Shared responsive breakpoints for BuiltGlory App.
 * Prefer useLayout() over hardcoded widths — these values are test points, not exclusive targets.
 */
export const BREAKPOINTS = {
  /** Very small phones (iPhone SE 1st gen, compact Android) */
  phoneSm: 360,
  /** Large phones / phablets */
  phoneLg: 430,
  /** Small tablets / large phones landscape / foldables mid */
  tabletSm: 600,
  /** Standard tablets (iPad Mini portrait, many Android tablets) */
  tablet: 768,
  /** Large tablets / iPad landscape / small desktop */
  desktop: 1024,
  /** Wide desktop / large iPad Pro landscape */
  desktopLg: 1280,
} as const;

export type LayoutBucket = 'phoneSm' | 'phone' | 'tabletSm' | 'tablet' | 'desktop';

export type LayoutInfo = {
  width: number;
  height: number;
  isLandscape: boolean;
  isPhoneSm: boolean;
  isPhone: boolean;
  isTabletSm: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  bucket: LayoutBucket;
  /** Horizontal page gutter (outer padding). */
  gutter: number;
  /** Gap between grid items. */
  gap: number;
  /** Max content width on large screens; null = full width. */
  contentMaxWidth: number | null;
  /** Effective content width after max-width clamping. */
  contentWidth: number;
  /** Property / card grid columns. */
  propertyColumns: number;
  /** Property-type picker columns (Buy/Sell type grids). */
  typeColumns: number;
  /** Spec / amenity / share-channel tile columns. */
  tileColumns: number;
  /** Featured / upcoming carousel card width. */
  carouselCardWidth: number;
  /** Home banner carousel card width. */
  bannerCardWidth: number;
  /** Property detail hero height. */
  heroHeight: number;
  /** Compact property card thumbnail size. */
  compactThumb: number;
  /** Floor-plan thumb width. */
  floorPlanThumbWidth: number;
  /** Readable body font scale hint (1 = default). */
  fontScale: number;
  /** Modal / sheet max height fraction of window. */
  sheetMaxHeight: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function gridItemWidth(availableWidth: number, columns: number, gap: number): number {
  if (columns <= 0) return availableWidth;
  return (availableWidth - gap * (columns - 1)) / columns;
}

export function resolveLayout(width: number, height: number): LayoutInfo {
  const isLandscape = width > height;
  const isPhoneSm = width < BREAKPOINTS.phoneSm;
  const isTabletSm = width >= BREAKPOINTS.tabletSm;
  const isTablet = width >= BREAKPOINTS.tablet;
  const isDesktop = width >= BREAKPOINTS.desktop;
  const isPhone = !isTabletSm;

  let bucket: LayoutBucket = 'phone';
  if (width < BREAKPOINTS.phoneSm) bucket = 'phoneSm';
  else if (width < BREAKPOINTS.tabletSm) bucket = 'phone';
  else if (width < BREAKPOINTS.tablet) bucket = 'tabletSm';
  else if (width < BREAKPOINTS.desktop) bucket = 'tablet';
  else bucket = 'desktop';

  const gutter = isDesktop ? 32 : isTablet ? 24 : isTabletSm ? 20 : 16;
  const gap = isTablet ? 14 : isTabletSm ? 12 : 10;

  // Constrain stretch on very large screens / landscape tablets.
  const contentMaxWidth = isDesktop ? 1100 : isTablet && isLandscape ? 960 : isTablet ? 840 : null;
  const contentWidth = contentMaxWidth ? Math.min(width, contentMaxWidth) : width;

  let propertyColumns = 1;
  if (width >= BREAKPOINTS.desktopLg) propertyColumns = 4;
  else if (width >= BREAKPOINTS.desktop) propertyColumns = 3;
  else if (width >= BREAKPOINTS.tablet) propertyColumns = 3;
  else if (width >= BREAKPOINTS.tabletSm) propertyColumns = 2;
  else propertyColumns = 2; // phone: 2-col featured grids where used

  // On very narrow phones keep 2 cols for featured; lists stay full-width via PropertyCard.
  if (isPhoneSm && width < 340) propertyColumns = 1;

  let typeColumns = 3;
  if (width < 340) typeColumns = 2;
  else if (width < BREAKPOINTS.phoneSm) typeColumns = 3;
  else if (width < BREAKPOINTS.tabletSm) typeColumns = 3;
  else if (width < BREAKPOINTS.tablet) typeColumns = 4;
  else if (width < BREAKPOINTS.desktop) typeColumns = 4;
  else typeColumns = 5;

  let tileColumns = 4;
  if (width < 340) tileColumns = 3;
  else if (width >= BREAKPOINTS.tablet) tileColumns = 6;
  else if (width >= BREAKPOINTS.tabletSm) tileColumns = 5;

  // Never let carousel/banner cards exceed the usable content width on small phones.
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

  const compactThumb = isTablet ? 108 : isPhoneSm ? 80 : 92;
  const floorPlanThumbWidth = isTablet ? 160 : isPhoneSm ? 112 : 132;
  const fontScale = PixelRatio.getFontScale();
  const sheetMaxHeight = height * (isLandscape ? 0.92 : 0.9);

  return {
    width,
    height,
    isLandscape,
    isPhoneSm,
    isPhone,
    isTabletSm,
    isTablet,
    isDesktop,
    bucket,
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
    compactThumb,
    floorPlanThumbWidth,
    fontScale,
    sheetMaxHeight,
  };
}

/** Reactive layout metrics — updates on rotate / split-screen / window resize. */
export function useLayout(): LayoutInfo {
  const { width, height } = useWindowDimensions();
  return useMemo(() => resolveLayout(width, height), [width, height]);
}

/** Convenience: columns for a search / browse type grid (3–5). */
export function useBrowseTypeGridLayout() {
  const layout = useLayout();
  const columns = layout.width < BREAKPOINTS.phoneSm ? 3 : layout.width < BREAKPOINTS.tabletSm ? 4 : layout.width < BREAKPOINTS.desktop ? 5 : 6;
  const pad = layout.gutter;
  const gap = layout.gap;
  const itemWidth = gridItemWidth(layout.contentWidth - pad * 2, columns, gap);
  return { columns, gap, pad, itemWidth, layout };
}
