/**
 * Reclaim Expo/Metro ports occupied by leftover processes from this project only.
 * Unrelated listeners are left alone.
 */
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const WINDOWS = process.platform === 'win32';

function normalizePath(value) {
  return String(value || '')
    .replace(/\//g, '\\')
    .replace(/\\\\+/g, '\\')
    .toLowerCase();
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  });
}

export function getListeningPids(port) {
  const pids = new Set();

  if (WINDOWS) {
    const output = run('netstat', ['-ano']);
    const pattern = new RegExp(`:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`, 'gi');
    let match;
    while ((match = pattern.exec(output))) {
      const pid = Number(match[1]);
      if (Number.isInteger(pid) && pid > 0) pids.add(pid);
    }
    return [...pids];
  }

  try {
    const output = run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    for (const line of output.split(/\r?\n/)) {
      const pid = Number(line.trim());
      if (Number.isInteger(pid) && pid > 0) pids.add(pid);
    }
  } catch {
    // lsof missing or nothing listening
  }
  return [...pids];
}

export function getProcessCommandLine(pid) {
  try {
    if (WINDOWS) {
      const output = run('powershell.exe', [
        '-NoProfile',
        '-Command',
        `Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" | Select-Object -ExpandProperty CommandLine`,
      ]);
      return output.trim();
    }
    return run('ps', ['-p', String(pid), '-o', 'args=']).trim();
  } catch {
    return '';
  }
}

function isThisProjectExpoProcess(commandLine, projectRoot) {
  const cmd = normalizePath(commandLine);
  const root = normalizePath(projectRoot);
  if (!cmd || !root || !cmd.includes(root)) return false;

  const isExpoCli =
    (cmd.includes('expo\\bin\\cli') || cmd.includes('\\expo\\bin\\cli') || cmd.includes('expo.cmd')) &&
    cmd.includes('start');
  const isMetro = cmd.includes('metro') || cmd.includes('react-native start');
  const isExpoNgrok =
    cmd.includes('@expo\\ngrok') ||
    cmd.includes('@expo/ngrok') ||
    (cmd.includes('ngrok.exe') && cmd.includes('@expo'));

  return isExpoCli || isMetro || isExpoNgrok;
}

function killProcessTree(pid) {
  if (WINDOWS) {
    run('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // already gone
  }
}

async function waitForPortFree(port, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (getListeningPids(port).length === 0) return true;
    await delay(250);
  }
  return getListeningPids(port).length === 0;
}

function findOrphanExpoNgrokPids(projectRoot) {
  if (!WINDOWS) return [];
  try {
    const output = run('powershell.exe', [
      '-NoProfile',
      '-Command',
      'Get-CimInstance Win32_Process | Where-Object { $_.Name -match "ngrok" } | Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress',
    ]);
    const parsed = JSON.parse(output || '[]');
    const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    return rows
      .filter((row) => isThisProjectExpoProcess(row.CommandLine || '', projectRoot))
      .map((row) => Number(row.ProcessId))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return [];
  }
}

/**
 * Stop leftover Expo/Metro/ngrok processes from this project on the given ports.
 * Returns whether the preferred port is free afterwards.
 */
export async function reclaimProjectExpoPorts({ projectRoot, ports }) {
  const uniquePorts = [...new Set(ports.filter((port) => Number.isInteger(port) && port > 0))];
  const killed = [];
  const skipped = [];

  for (const port of uniquePorts) {
    for (const pid of getListeningPids(port)) {
      const commandLine = getProcessCommandLine(pid);
      if (isThisProjectExpoProcess(commandLine, projectRoot)) {
        console.log(`Stopping stale Expo/Metro process on port ${port} (PID ${pid})`);
        try {
          killProcessTree(pid);
          killed.push({ pid, port, commandLine });
        } catch (error) {
          console.warn(`Could not stop PID ${pid}: ${error.message}`);
        }
      } else {
        skipped.push({
          pid,
          port,
          commandLine: commandLine || '(command line unavailable)',
        });
      }
    }
  }

  for (const pid of findOrphanExpoNgrokPids(projectRoot)) {
    if (killed.some((item) => item.pid === pid)) continue;
    console.log(`Stopping leftover Expo ngrok process (PID ${pid})`);
    try {
      killProcessTree(pid);
      killed.push({ pid, port: null, commandLine: 'expo ngrok' });
    } catch (error) {
      console.warn(`Could not stop ngrok PID ${pid}: ${error.message}`);
    }
  }

  const preferredPort = uniquePorts[0];
  if (killed.length > 0 && preferredPort) {
    const free = await waitForPortFree(preferredPort);
    if (!free) {
      console.warn(`Port ${preferredPort} is still busy after stopping stale Expo processes.`);
    }
  }

  for (const item of skipped) {
    console.warn(
      `Port ${item.port} is in use by an unrelated process (PID ${item.pid}). It was not stopped.`,
    );
    console.warn(`  ${item.commandLine}`);
  }

  return {
    killed,
    skipped,
    preferredPortFree: preferredPort ? getListeningPids(preferredPort).length === 0 : true,
  };
}
