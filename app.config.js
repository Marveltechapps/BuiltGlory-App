/** @type {import('expo/config').ExpoConfig} */
module.exports = ({ config }) => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim() || process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const productionApiUrl = process.env.EXPO_PUBLIC_PRODUCTION_API_URL?.trim();
  const usesHttpApi =
    (apiUrl && apiUrl.startsWith('http://')) ||
    (productionApiUrl && productionApiUrl.startsWith('http://'));

  const expoConfig = {
    ...config,
    name: 'BuiltGlory',
    slug: 'builtglory',
    scheme: 'builtglory',
    version: '1.0.0',
    orientation: 'default',
    icon: './assets/icon.png',
    splash: {
      // Square mark fits Android 12+ circular splash; wordmark is shown on the JS splash screen.
      image: './assets/logo-mark.png',
      resizeMode: 'contain',
      backgroundColor: '#FFFFFF',
      imageWidth: 200,
    },
    userInterfaceStyle: 'light',
    ios: {
      supportsTablet: true,
      config: {
        googleMapsApiKey: 'AIzaSyAa8QYUOOYJ8QHNxUe3_R3PwxRBRVE51ZY',
      },
    },
    android: {
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
          apiKey: 'AIzaSyAa8QYUOOYJ8QHNxUe3_R3PwxRBRVE51ZY',
        },
      },
      adaptiveIcon: {
        // Solid white plate; foreground is cropped logo mark on transparent (see scripts/generate-brand-icons.mjs).
        backgroundColor: '#FFFFFF',
        foregroundImage: './assets/android-icon-foreground.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
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
          // Centered square mark — Android crops splash icons to a circle (~192dp).
          image: './assets/logo-mark.png',
          resizeMode: 'contain',
          imageWidth: 200,
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/icon.png',
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
          locationWhenInUsePermission: 'Allow BuiltGlory to use your location to show nearby properties and save your city.',
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
      EXPO_PUBLIC_COMPANY_SUPPORT_PHONE: process.env.EXPO_PUBLIC_COMPANY_SUPPORT_PHONE?.trim(),
      EXPO_PUBLIC_COMPANY_WHATSAPP_NUMBER: process.env.EXPO_PUBLIC_COMPANY_WHATSAPP_NUMBER?.trim(),
    },
  };

  return expoConfig;
};
