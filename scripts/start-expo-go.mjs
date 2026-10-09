/**
 * Expo Go startup for same-Wi-Fi LAN development.
 *
 * Always uses Expo LAN mode (`--host lan`). No Cloudflare, ngrok, or tunnels.
 * Metro is advertised with the PC's current LAN IPv4 (DHCP-safe).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reclaimProjectExpoPorts } from './reclaim-expo-port.mjs';
import { checkLanFirewallRules } from './ensure-lan-firewall.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const PORT = Number(process.env.EXPO_METRO_PORT || process.env.RCT_METRO_PORT || 8081);

const args = new Set(process.argv.slice(2));
const clearCache = args.has('--clear') || args.has('-c');

if (args.has('--tunnel') || args.has('--localhost')) {
  console.error('BuiltGlory local development uses LAN mode only (same Wi-Fi).');
  console.error('Do not use --tunnel, --localhost, Cloudflare, or ngrok.');
  console.error('Run: npm start');
  process.exit(1);
}

/** Prefer Wi-Fi / Ethernet IPv4; skip loopback, link-local, and virtual adapters when possible. */
function getPreferredLanIPv4() {
  const interfaces = os.networkInterfaces();
  const preferred = [];
  const other = [];

  for (const [name, entries] of Object.entries(interfaces)) {
    if (/virtual|vethernet|hyper-v|vpn|tailscale|zerotier|docker|wsl|loopback|bluetooth/i.test(name)) {
      continue;
    }
    for (const entry of entries || []) {
      const family = entry.family === 'IPv4' || entry.family === 4;
      if (!family || entry.internal) continue;
      if (entry.address.startsWith('169.254.')) continue;
      const row = { name, address: entry.address };
      if (/wi-?fi|wlan|wireless|ethernet|eth\d/i.test(name)) preferred.push(row);
      else other.push(row);
    }
  }

  return preferred[0] || other[0] || null;
}

function isPrivateIpv4(address) {
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(address)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(address)) return true;
  const match = address.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (!match) return false;
  const second = Number(match[1]);
  return second >= 16 && second <= 31;
}

function readDotEnvValue(key) {
  try {
    const text = fs.readFileSync(path.join(root, '.env'), 'utf8');
    const match = text.match(new RegExp(`^${key}\\s*=\\s*(.*)$`, 'm'));
    return match?.[1]?.trim().replace(/^['"]|['"]$/g, '');
  } catch {
    return undefined;
  }
}

function hostnameFromUrl(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function warnIfHardcodedApiIp(lanIp) {
  const apiUrl = readDotEnvValue('EXPO_PUBLIC_API_URL');
  if (!apiUrl) return;
  const apiHost = hostnameFromUrl(apiUrl);
  if (!apiHost || !lanIp) return;
  if (apiHost === lanIp) return;
  if (['localhost', '127.0.0.1', '::1'].includes(apiHost)) {
    console.log(
      `Note: EXPO_PUBLIC_API_URL uses ${apiHost}. Physical devices cannot use loopback; the app rewrites to Expo's LAN host (${lanIp}) at runtime.`,
    );
    return;
  }
  if (isPrivateIpv4(apiHost) && apiHost !== lanIp) {
    console.log(
      `Note: .env API host (${apiHost}) differs from the current LAN IP (${lanIp}). The app follows Expo's current LAN host and keeps the API port — no manual IP edits needed.`,
    );
  }
}

function printFirewallHint() {
  if (process.platform !== 'win32') return;
  const check = checkLanFirewallRules([PORT, 5001]);
  if (check.skipped || check.ok) return;
  console.log('');
  console.log('Windows Firewall: BuiltGlory LAN rules are missing for port(s):', check.missing.join(', '));
  console.log('Run once in an elevated PowerShell from BuiltGlory-App:');
  console.log('  npm run setup:lan-firewall');
  console.log('');
}

async function main() {
  const lan = getPreferredLanIPv4();
  const lanIp = lan?.address || null;

  console.log('BuiltGlory Expo Go startup (LAN)');
  if (lanIp) {
    console.log(`Detected LAN IPv4: ${lanIp} (${lan.name})`);
    if (!isPrivateIpv4(lanIp)) {
      console.warn(`Warning: ${lanIp} does not look like a private LAN address.`);
    }
  } else {
    console.warn('Warning: could not detect a LAN IPv4 address. Connect to Wi-Fi and retry.');
  }

  const apiUrl = readDotEnvValue('EXPO_PUBLIC_API_URL');
  const apiPort = readDotEnvValue('EXPO_PUBLIC_API_PORT') || '5001';
  if (apiUrl) console.log(`EXPO_PUBLIC_API_URL=${apiUrl}`);
  else console.log(`API origin: Expo LAN host + port ${apiPort} (no hardcoded API IP)`);
  warnIfHardcodedApiIp(lanIp);
  printFirewallHint();

  const reclaim = await reclaimProjectExpoPorts({
    projectRoot: root,
    ports: [PORT, 8081, 8082],
  });

  console.log('');
  console.log('LAN mode: phone/tablet and PC must be on the same Wi-Fi.');
  console.log('Scan the QR code in Expo Go (do not type localhost).');
  if (lanIp) {
    console.log(`Expected Metro URL: http://${lanIp}:${PORT}`);
    console.log(`Expected Expo Go URL: exp://${lanIp}:${PORT}`);
  }
  console.log('');

  const expoArgs = ['expo', 'start', '--go', '--host', 'lan', '--port', String(PORT)];
  if (!reclaim.preferredPortFree) {
    console.warn(`Preferred port ${PORT} is busy; Expo may pick another port.`);
    // Still pass --port; Expo will error clearly if taken after reclaim.
  }
  if (clearCache) expoArgs.push('--clear');

  const env = { ...process.env };
  // Never force localhost for the packager advertisement.
  delete env.EXPO_PACKAGER_PROXY_URL;
  delete env.EXPO_NO_DOTENV;

  if (lanIp) {
    env.REACT_NATIVE_PACKAGER_HOSTNAME = lanIp;
  } else {
    delete env.REACT_NATIVE_PACKAGER_HOSTNAME;
  }

  const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', expoArgs, {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  const shutdown = () => {
    try {
      child.kill();
    } catch {
      // ignore
    }
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
