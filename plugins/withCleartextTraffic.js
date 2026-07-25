const {
  withAndroidManifest,
  withDangerousMod,
  AndroidConfig,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<!-- Allows HTTP to local/dev backends from release APKs (Android 9+ blocks cleartext by default). -->
<network-security-config>
    <base-config cleartextTrafficPermitted="true" />
</network-security-config>
`;

/**
 * Ensures release Android builds can call http:// LAN backends.
 * Expo's android.usesCleartextTraffic alone is not always applied to release manifests.
 */
function withCleartextTraffic(config) {
  if (!config.android?.usesCleartextTraffic) {
    return config;
  }

  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const resXmlDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      );
      fs.mkdirSync(resXmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(resXmlDir, 'network_security_config.xml'),
        NETWORK_SECURITY_CONFIG,
        'utf8',
      );
      return modConfig;
    },
  ]);

  return withAndroidManifest(config, (modConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(modConfig.modResults);
    application.$['android:usesCleartextTraffic'] = 'true';
    application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return modConfig;
  });
}

module.exports = withCleartextTraffic;
