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
npm run setup:lan-firewall   # Windows once, elevated — Private LAN only on TCP 8081 + 5001
npm start                    # Expo Go over LAN (same Wi-Fi)
```

Use Expo Go on a phone/tablet connected to the **same Wi-Fi** as this PC. Scan the QR code — it always uses the PC's current LAN IP (no hardcoded IP, no tunnel).

Equivalent CLI:

```bash
npx expo start --go --host lan
```

## Local networking (LAN only)

| Requirement | How this project meets it |
|-------------|---------------------------|
| Same Wi-Fi | PC + Android device on one network |
| Auto LAN IP | `scripts/start-expo-go.mjs` sets `REACT_NATIVE_PACKAGER_HOSTNAME` from the current Wi-Fi IPv4 |
| Metro reachable | `--host lan`, port `8081`, Windows firewall rule (Private + RFC1918 only) |
| No tunnel | Cloudflare / ngrok / `--tunnel` are not used |
| No fixed IP | Do not set a `192.168.x.x` in `.env`; API follows Expo's Metro host + `EXPO_PUBLIC_API_PORT` |

Windows one-time firewall setup (does **not** disable the firewall or expose ports to the public internet):

```bash
npm run setup:lan-firewall
```

## API URL configuration

All HTTP and WebSocket requests use a single base URL from `src/config/api.ts`. **Never use `localhost` on a physical device** — it refers to the phone itself, not your development computer.

Metro/Expo (`8081`) and the backend API (`5001`) are separate. The Expo QR/dev URL must stay on LAN Metro; the API origin is derived from the same LAN host at runtime.

### Environment variables

| Variable | When used | Description |
|----------|-----------|-------------|
| `EXPO_PUBLIC_API_PORT` | **Development** (`__DEV__`) | Backend port when inferring URL from Expo's LAN host (default: `5001`). |
| `EXPO_PUBLIC_API_URL` | Optional override | Only if you need a non-default origin. Private IPs are rewritten to Expo's current LAN host. Prefer leaving unset. |
| `EXPO_PUBLIC_PRODUCTION_API_URL` | **Preview / production APK** | API used when `__DEV__` is false. |

### Resolution order (dev)

1. Expo Metro LAN host + `EXPO_PUBLIC_API_PORT` (preferred)
2. Optional `EXPO_PUBLIC_API_URL` (rewritten to current LAN host when private)
3. Android emulator → `http://10.0.2.2:5001`

### EAS builds

For **preview** and **production** APKs, set `EXPO_PUBLIC_PRODUCTION_API_URL` in `eas.json` or EAS Secrets.

```bash
eas build --profile preview --platform android
eas build --profile production --platform android
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` / `npm run start:lan` | Expo Go over LAN |
| `npm run setup:lan-firewall` | Windows: allow TCP 8081 + 5001 from private LAN only |
| `npm run android` | Run on Android |
| `npm run ios` | Run on iOS |
| `npm run web` | Run in the browser |

## Related repos

- **Backend** — `BuiltGlory-Backend` (Express API)
- **Dashboard** — `BuiltGlory-Dashboard-Frontend` (admin UI)
