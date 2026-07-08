import React from 'react';
import { Platform, StyleProp, StyleSheet, TextStyle } from 'react-native';

const MAX_FONT_SCALE = 1.25;

/** Base Android text props that prevent default font padding and layout clipping. */
const ANDROID_TEXT_BASE = {
  includeFontPadding: false,
  textBreakStrategy: 'simple',
} as TextStyle;

/** Minimum line height ratio so ascenders/descenders are not clipped on Android. */
export function lineHeightFor(fontSize: number): number {
  return Math.round(fontSize * 1.4);
}

function isBoldWeight(weight: TextStyle['fontWeight']): boolean {
  if (weight == null) return false;
  if (weight === 'bold') return true;
  const numeric = typeof weight === 'string' ? Number.parseInt(weight, 10) : weight;
  return !Number.isNaN(numeric) && numeric >= 600;
}

/**
 * Merge user styles with Android-safe defaults.
 * Fixes RN 0.81 clipping when lineHeight is missing, too tight, or applied as a unitless ratio.
 */
export function androidSafeTextStyle(style: StyleProp<TextStyle>): TextStyle {
  const flat = StyleSheet.flatten(style) ?? {};
  const merged: TextStyle = { ...flat, ...ANDROID_TEXT_BASE };

  const fontSize = typeof flat.fontSize === 'number' ? flat.fontSize : undefined;
  const lineHeight = typeof flat.lineHeight === 'number' ? flat.lineHeight : undefined;

  if (fontSize) {
    const minLineHeight = lineHeightFor(fontSize);
    if (!lineHeight || lineHeight <= fontSize || lineHeight < minLineHeight) {
      merged.lineHeight = minLineHeight;
    }
  }

  if (flat.flex === 1 || flat.flexGrow === 1) {
    merged.minWidth = 0;
  }

  // RN 0.81 on Android can clip trailing glyphs for semibold/bold text inside flex rows.
  if (isBoldWeight(flat.fontWeight)) {
    const endPad = typeof flat.paddingEnd === 'number' ? flat.paddingEnd : 0;
    const rightPad = typeof flat.paddingRight === 'number' ? flat.paddingRight : 0;
    merged.paddingEnd = Math.max(endPad, rightPad, 2);
  }

  return merged;
}

export const androidInputStyle = (fontSize = 14) => ({
  ...ANDROID_TEXT_BASE,
  lineHeight: lineHeightFor(fontSize),
  paddingVertical: 0,
});

export const ACTION_BTN_CLASS = 'min-h-12 py-3';
export const ACTION_BTN_LG_CLASS = 'min-h-[52px] py-3.5';

function definePatchedExport<T>(target: object, key: string, value: T) {
  try {
    Object.defineProperty(target, key, {
      value,
      writable: true,
      configurable: true,
    });
  } catch {
    // Some RN builds mark exports read-only; shared component fixes still apply.
  }
}

function patchTextComponent() {
  if (Platform.OS !== 'android') return;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const rn = require('react-native') as Record<string, unknown>;

  const OriginalText = rn.Text as React.ComponentType<
    React.ComponentProps<typeof import('react-native').Text> & { ref?: React.Ref<unknown> }
  >;
  const PatchedText = React.forwardRef(function AndroidSafeText(
    props: React.ComponentProps<typeof import('react-native').Text>,
    ref: React.Ref<unknown>,
  ) {
    const { style, allowFontScaling, maxFontSizeMultiplier, ...rest } = props;
    return React.createElement(OriginalText, {
      ...rest,
      ref,
      allowFontScaling: allowFontScaling ?? true,
      maxFontSizeMultiplier: maxFontSizeMultiplier ?? MAX_FONT_SCALE,
      style: androidSafeTextStyle(style),
    });
  });
  PatchedText.displayName = 'Text';
  definePatchedExport(rn, 'Text', PatchedText);

  const OriginalTextInput = rn.TextInput as React.ComponentType<
    React.ComponentProps<typeof import('react-native').TextInput> & { ref?: React.Ref<unknown> }
  >;
  const PatchedTextInput = React.forwardRef(function AndroidSafeTextInput(
    props: React.ComponentProps<typeof import('react-native').TextInput>,
    ref: React.Ref<unknown>,
  ) {
    const { style, allowFontScaling, maxFontSizeMultiplier, ...rest } = props;
    return React.createElement(OriginalTextInput, {
      ...rest,
      ref,
      allowFontScaling: allowFontScaling ?? true,
      maxFontSizeMultiplier: maxFontSizeMultiplier ?? MAX_FONT_SCALE,
      style: androidSafeTextStyle(style as StyleProp<TextStyle>),
    });
  });
  PatchedTextInput.displayName = 'TextInput';
  definePatchedExport(rn, 'TextInput', PatchedTextInput);

  const Animated = rn.Animated as {
    Text?: React.ComponentType<React.ComponentProps<typeof import('react-native').Text>>;
    createAnimatedComponent?: <P>(component: React.ComponentType<P>) => React.ComponentType<P>;
  } | undefined;
  if (Animated?.createAnimatedComponent) {
    const PatchedAnimatedText = Animated.createAnimatedComponent(PatchedText);
    PatchedAnimatedText.displayName = 'Animated.Text';
    definePatchedExport(Animated, 'Text', PatchedAnimatedText);
  }
}

patchTextComponent();
