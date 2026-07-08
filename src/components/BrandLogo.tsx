import React from 'react';
import { Image, ImageStyle, StyleProp, View, ViewStyle } from 'react-native';

const brandLogo = require('../../assets/brand-logo.png');

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
    <View style={containerStyle}>
      <Image
        source={brandLogo}
        style={[{ width: size, height: size }, style]}
        resizeMode="contain"
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
}
