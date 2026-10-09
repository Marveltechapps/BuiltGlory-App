/**
 * Ensure Windows Firewall allows Metro (8081) + local API (5001) from private LAN only.
 * Non-Windows platforms: no-op success.
 *
 * Prefer running once as Administrator:
 *   npm run setup:lan-firewall
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(__dirname, 'ensure-lan-firewall.ps1');

export function ensureLanFirewall({ elevate = false, quiet = false } = {}) {
  if (process.platform !== 'win32') {
    return { ok: true, skipped: true, reason: 'not-windows' };
  }

  if (!fs.existsSync(scriptPath)) {
    return { ok: false, skipped: false, reason: 'missing-script', scriptPath };
  }

  const escapedScript = scriptPath.replace(/'/g, "''");
  const args = elevate
    ? [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        // PassThru + ExitCode so UAC cancel / script failure is visible to Node.
        `$p = Start-Process -FilePath powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','${escapedScript}'; if ($null -eq $p) { exit 1 }; exit $p.ExitCode`,
      ]
    : ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath];

  const result = spawnSync('powershell.exe', args, {
    encoding: 'utf8',
    windowsHide: !elevate,
  });

  const stdout = (result.stdout || '').trim();
  const stderr = (result.stderr || '').trim();
  if (!quiet) {
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
  }

  const combined = `${stdout}\n${stderr}`;
  const needsAdmin = /Administrator privileges are required/i.test(combined);
  const ok = result.status === 0 && !needsAdmin;

  return {
    ok,
    skipped: false,
    status: result.status,
    needsAdmin: !ok && needsAdmin,
    stdout,
    stderr,
  };
}

function firewallRulePresent(port) {
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `if (Get-NetFirewallRule -DisplayName 'BuiltGlory Dev LAN TCP ${port}' -ErrorAction SilentlyContinue) { 'yes' } else { 'no' }`,
    ],
    { encoding: 'utf8', windowsHide: true },
  );
  return (result.stdout || '').trim() === 'yes';
}

export function checkLanFirewallRules(ports = [8081, 5001]) {
  if (process.platform !== 'win32') {
    return { ok: true, skipped: true, missing: [] };
  }
  const missing = ports.filter((port) => !firewallRulePresent(port));
  return { ok: missing.length === 0, skipped: false, missing };
}
