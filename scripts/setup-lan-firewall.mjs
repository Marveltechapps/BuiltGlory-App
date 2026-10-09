/**
 * One-shot installer for BuiltGlory LAN firewall rules.
 * Usage: node scripts/setup-lan-firewall.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLanFirewallRules, ensureLanFirewall } from './ensure-lan-firewall.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(__dirname, 'ensure-lan-firewall.ps1');

function verified() {
  return checkLanFirewallRules([8081, 5001]);
}

const already = verified();
if (already.ok) {
  console.log('BuiltGlory LAN firewall rules already present (TCP 8081, 5001).');
  process.exit(0);
}

console.log('Installing BuiltGlory LAN firewall rules (Private profile, RFC1918 only)...');

// Quiet probe: most developer shells are not elevated.
const probe = ensureLanFirewall({ elevate: false, quiet: true });
if (probe.ok && verified().ok) {
  console.log('BuiltGlory LAN firewall rules are installed.');
  process.exit(0);
}

if (probe.needsAdmin || !probe.ok) {
  console.log('Administrator approval required (Windows UAC). Approve the prompt if it appears...\n');
  const elevated = ensureLanFirewall({ elevate: true, quiet: false });
  if (elevated.ok && verified().ok) {
    console.log('BuiltGlory LAN firewall rules are installed.');
    process.exit(0);
  }
}

// Final source of truth: rules in Windows Firewall, not process exit codes.
const finalCheck = verified();
if (finalCheck.ok) {
  console.log('BuiltGlory LAN firewall rules are installed.');
  process.exit(0);
}

console.error('\nFirewall rules were NOT installed.');
if (finalCheck.missing.length) {
  console.error(`Missing: ${finalCheck.missing.map((p) => `TCP ${p}`).join(', ')}`);
}
console.error('Open an elevated PowerShell in BuiltGlory-App and run:');
console.error('  npm run setup:lan-firewall');
console.error(`  or: powershell -ExecutionPolicy Bypass -File "${scriptPath}"`);
process.exit(1);
