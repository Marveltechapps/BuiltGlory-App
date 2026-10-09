/** @type {import('expo/config').ExpoConfig} */
module.exports = ({ config }) => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim() || process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const productionApiUrl = process.env.EXPO_PUBLIC_PRODUCTION_API_URL?.trim();
  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || process.env.GOOGLE_MAPS_API_KEY?.trim() || '';
  const appLinkOrigin = process.env.EXPO_PUBLIC_APP_LINK_ORIGIN?.trim() || '';
  let appLinkHost = process.env.EXPO_PUBLIC_APP_LINK_HOST?.trim() || '';
  if (!appLinkHost && appLinkOrigin) {
    try {
      appLinkHost = new URL(appLinkOrigin).hostname;
    } catch {
      appLinkHost = '';
    }
  }
  // Local Expo Go LAN API uses http://<lan-ip>:port — Android requires cleartext.
  const usesHttpApi = true;

  const expoConfig = {
    ...config,
    name: 'BuiltGlory',
    slug: 'builtglory',
    scheme: 'builtglory',
    version: '1.0.0',
    orientation: 'default',
    icon: './assets/icon.png',
    splash: {
      // Expo Go uses this key. Square plate with centered mark so `contain` stays centered and unstretched.
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#FFFFFF',
    },
    userInterfaceStyle: 'light',
    ios: {
      icon: './assets/icon.png',
      supportsTablet: true,
      bundleIdentifier: 'com.builtglory.builtglory',
      associatedDomains: appLinkHost ? [`applinks:${appLinkHost}`, `applinks:www.${appLinkHost}`] : [],
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          'Allow BuiltGlory to use your location to show nearby properties, place your pin on the map, and save your city.',
      },
      config: {
        googleMapsApiKey,
      },
    },
    android: {
      icon: './assets/icon.png',
      package: 'com.builtglory.builtglory',
      googleServicesFile: './google-services.json',
      permissions: [
        'android.permission.POST_NOTIFICATIONS',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.RECORD_AUDIO',
        'android.permission.READ_CONTACTS',
        'android.permission.WRITE_CONTACTS',
      ],
      softwareKeyboardLayoutMode: 'resize',
      usesCleartextTraffic: Boolean(usesHttpApi),
      config: {
        googleMaps: {
          apiKey: googleMapsApiKey,
        },
      },
      adaptiveIcon: {
        backgroundColor: '#FFFFFF',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: Boolean(appLinkHost),
          data: appLinkHost
            ? [
                { scheme: 'https', host: appLinkHost, pathPrefix: '/p' },
                { scheme: 'https', host: appLinkHost, pathPrefix: '/property' },
                { scheme: 'https', host: `www.${appLinkHost}`, pathPrefix: '/p' },
                { scheme: 'https', host: `www.${appLinkHost}`, pathPrefix: '/property' },
              ]
            : [],
          category: ['BROWSABLE', 'DEFAULT'],
        },
        {
          action: 'VIEW',
          data: [{ scheme: 'builtglory' }],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ].filter((filter) => (filter.data || []).length > 0),
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-dev-client',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#FFFFFF',
          // Padded transparent mark — Android 12+ masks splash icons to a circle (~200dp).
          image: './assets/android-icon-foreground.png',
          resizeMode: 'contain',
          imageWidth: 200,
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/notification-icon.png',
          color: '#FFFFFF',
          defaultChannel: 'default',
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission: 'Allow BuiltGlory to access your photos so you can upload property images.',
        },
      ],
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'Allow BuiltGlory to use your location to show nearby properties, place your pin on the map, and save your city.',
          isIosBackgroundLocationEnabled: false,
          isAndroidBackgroundLocationEnabled: false,
        },
      ],
      [
        'expo-contacts',
        {
          contactsPermission: 'Allow BuiltGlory to access your contacts when you choose to share a property.',
        },
      ],
      [
        'expo-build-properties',
        {
          android: {
            usesCleartextTraffic: Boolean(usesHttpApi),
          },
        },
      ],
      './plugins/withCleartextTraffic',
    ],
    extra: {
      ...(config?.extra ?? {}),
      eas: {
        projectId: 'c85a94d0-a532-4597-8258-9e26046074ca',
      },
      EXPO_PUBLIC_API_URL: apiUrl,
      EXPO_PUBLIC_PRODUCTION_API_URL: productionApiUrl,
      EXPO_PUBLIC_API_PORT: process.env.EXPO_PUBLIC_API_PORT?.trim(),
      EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: googleMapsApiKey,
      EXPO_PUBLIC_APP_LINK_ORIGIN: appLinkOrigin,
      EXPO_PUBLIC_APP_LINK_HOST: appLinkHost,
      EXPO_PUBLIC_COMPANY_SUPPORT_PHONE: process.env.EXPO_PUBLIC_COMPANY_SUPPORT_PHONE?.trim(),
      EXPO_PUBLIC_COMPANY_WHATSAPP_NUMBER: process.env.EXPO_PUBLIC_COMPANY_WHATSAPP_NUMBER?.trim(),
      EXPO_PUBLIC_COMPANY_SUPPORT_EMAIL: process.env.EXPO_PUBLIC_COMPANY_SUPPORT_EMAIL?.trim(),
    },
  };

  return expoConfig;
};
