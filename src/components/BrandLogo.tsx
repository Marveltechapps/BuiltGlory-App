import React from 'react';
import { Image, ImageStyle, StyleProp, View, ViewStyle } from 'react-native';

/** Official house/handshake mark, cropped from assets/brand-logo.png. */
const brandLogo = require('../../assets/logo-mark.png');

type BrandLogoProps = {
  size?: number;
  style?: StyleProp<ImageStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function BrandLogo({
  size = 120,
  style,
  containerStyle,
  accessibilityLabel = 'BuiltGlory logo',
}: BrandLogoProps) {
  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center' }, containerStyle]}>
      <Image
        source={brandLogo}
        style={[{ width: size, height: size }, style]}
        resizeMode="contain"
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
}
