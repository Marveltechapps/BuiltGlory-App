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
npm start
```

Use the Expo dev tools to open on iOS, Android, or web. For native builds:

```bash
npm run android
npm run ios
```

## Environment

Copy `.env.example` to `.env` and set:

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_API_BASE_URL` | Backend origin (e.g. `http://localhost:3000`). `/api/v1` is appended in the API client. |

Google Maps keys are configured in `app.json`. Firebase push uses `google-services.json` locally.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start Expo dev server |
| `npm run android` | Run on Android |
| `npm run ios` | Run on iOS |
| `npm run web` | Run in the browser |

## Related repos

- **Backend** — `BuiltGlory-Backend` (Express API)
- **Dashboard** — `builtglory-frontend-1.1` (admin UI)
