# BuiltGlory App

Expo React Native customer app for BuiltGlory (property discovery, enquiries, KYC, and notifications).

## Stack

- **Expo 54** + **React Native**
- **NativeWind** (Tailwind for RN)
- **React Navigation**

## Setup

```bash
npm install
cp .env.example .env
# Edit .env — set EXPO_PUBLIC_API_URL to your computer's LAN IP (see below)
npm start
```

Use the Expo dev tools to open on iOS, Android, or web. For native builds:

```bash
npm run android
npm run ios
```

## API URL configuration

All HTTP and WebSocket requests use a single base URL from `src/config/api.ts`. **Never use `localhost` on a physical device** — it refers to the phone itself, not your development computer.

### Environment variables

Copy `.env.example` to `.env` and set:

| Variable | When used | Description |
|----------|-----------|-------------|
| `EXPO_PUBLIC_API_URL` | **Development** (`__DEV__`) | Backend origin for local dev (e.g. `http://192.168.1.8:3002`). Use your PC's **LAN IP**, not `localhost`. `/api/v1` is appended automatically. |
| `EXPO_PUBLIC_PRODUCTION_API_URL` | **Preview / production APK** | HTTPS production API (default: `https://api.builtglory.com`). Used when `__DEV__` is false. |
| `EXPO_PUBLIC_API_PORT` | Optional dev fallback | Port when inferring URL from the Expo dev server host (default: `3002`). |

Legacy alias: `EXPO_PUBLIC_API_BASE_URL` is still read if `EXPO_PUBLIC_API_URL` is unset.

### Resolution order

| Build type | API origin |
|------------|------------|
| Expo dev server / dev client (`__DEV__`) | `EXPO_PUBLIC_API_URL` → Expo Metro LAN host → Android emulator `10.0.2.2` |
| Preview APK / production APK | `EXPO_PUBLIC_PRODUCTION_API_URL` → `EXPO_PUBLIC_API_URL` → `https://api.builtglory.com` |

### Find your LAN IP

1. Start the backend: `cd Backend-V1 && npm run dev` (default port **3002** in this monorepo).
2. Note your computer's Wi-Fi IP (Windows: `ipconfig`, macOS/Linux: `ifconfig` or `ip addr`).
3. Set in `.env`: `EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:3002`
4. Ensure phone and PC are on the **same Wi-Fi** and Windows Firewall allows inbound TCP on port 3002.
5. Restart Expo (`npm start`) or rebuild the native app after changing `.env`.

### EAS builds

For **preview** and **production** APKs, set `EXPO_PUBLIC_PRODUCTION_API_URL` in `eas.json` or EAS Secrets. Development builds can pass `EXPO_PUBLIC_API_URL` via EAS environment variables or your local `.env` during `eas build`.

```bash
# Preview APK (uses production API from eas.json)
eas build --profile preview --platform android

# Production
eas build --profile production --platform android
```

After changing API URLs in `.env` or `eas.json`, **rebuild the APK** — env vars are baked in at build time.

Google Maps keys are configured in `app.config.js`. Firebase push uses `google-services.json` locally.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start Expo dev server |
| `npm run android` | Run on Android |
| `npm run ios` | Run on iOS |
| `npm run web` | Run in the browser |

## Related repos

- **Backend** — `Backend-V1` (Express API)
- **Dashboard** — `Dashboard-V1` (admin UI)
