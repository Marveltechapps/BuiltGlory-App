const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Expo CLI chooses the listen host via `--host lan`. Keep Metro defaults; do not pin localhost.
module.exports = withNativeWind(config, { input: './global.css' });
