import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { gridItemWidth, useLayout } from './breakpoints';

/**
 * Centers content and applies a max-width on tablets/desktop so layouts
 * do not stretch edge-to-edge on large screens.
 */
export function ResponsiveContent({
  children,
  className = '',
  style,
  padHorizontal = true,
}: {
  children: React.ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  padHorizontal?: boolean;
}) {
  const layout = useLayout();
  return (
    <View
      className={`w-full self-center ${className}`}
      style={[
        {
          maxWidth: layout.contentMaxWidth ?? undefined,
          paddingHorizontal: padHorizontal ? layout.gutter : 0,
          width: '100%',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * Fluid wrapping grid. Prefer this over hardcoded 31% / 47% / 22% widths.
 * Children should fill the cell (width 100%).
 */
export function ResponsiveGrid({
  children,
  columns,
  gap,
  className = '',
  style,
}: {
  children: React.ReactNode;
  columns: number;
  gap?: number;
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const layout = useLayout();
  const g = gap ?? layout.gap;
  const items = React.Children.toArray(children).filter(Boolean);
  const pct = `${100 / Math.max(1, columns)}%` as `${number}%`;

  return (
    <View className={`flex-row flex-wrap ${className}`} style={[{ rowGap: g, columnGap: g }, style]}>
      {items.map((child, index) => (
        <View
          key={index}
          style={{
            width: pct,
            // Compensate gap so N columns still fit: subtract proportional gap share via flex basis calc-like approach
            // RN doesn't support CSS calc; approximate with maxWidth + flexGrow.
            flexGrow: 0,
            flexShrink: 0,
            // Use margin trick when columnGap unsupported on older RN — columnGap is supported in RN 0.71+
            maxWidth: pct,
          }}
        >
          {/* Inner wrapper shrinks for gap so N * width + (N-1)*gap ≈ 100% */}
          <View style={{ marginRight: 0, flex: 1 }}>{child}</View>
        </View>
      ))}
    </View>
  );
}

/**
 * Accurate equal-width cells using pixel math (best for cards / type tiles).
 */
export function MeasuredGrid({
  children,
  columns,
  gap,
  availableWidth,
  className = '',
  style,
  itemStyle,
}: {
  children: React.ReactNode;
  columns: number;
  gap?: number;
  availableWidth: number;
  className?: string;
  style?: StyleProp<ViewStyle>;
  itemStyle?: StyleProp<ViewStyle>;
}) {
  const layout = useLayout();
  const g = gap ?? layout.gap;
  const itemWidth = gridItemWidth(availableWidth, columns, g);
  const items = React.Children.toArray(children).filter(Boolean);

  return (
    <View className={`flex-row flex-wrap ${className}`} style={[{ gap: g }, style]}>
      {items.map((child, index) => (
        <View key={index} style={[{ width: itemWidth }, itemStyle]}>
          {child}
        </View>
      ))}
    </View>
  );
}

/** Pixel-accurate grid metrics from current layout. */
export function useGridMetrics(columns: number, options?: { gap?: number; horizontalPadding?: number }) {
  const layout = useLayout();
  const gap = options?.gap ?? layout.gap;
  const horizontalPadding = options?.horizontalPadding ?? layout.gutter * 2;
  const available = Math.max(0, layout.contentWidth - horizontalPadding);
  const itemWidth = gridItemWidth(available, columns, gap);
  return { itemWidth, gap, available, columns, gutter: layout.gutter, layout };
}
