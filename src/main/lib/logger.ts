const Colors = {
  Reset: "\x1b[0m",
  FgRed: "\x1b[31m",
  FgGreen: "\x1b[32m",
  FgYellow: "\x1b[33m",
  FgBlue: "\x1b[34m",
  FgMagenta: "\x1b[35m",
  FgCyan: "\x1b[36m",
  FgGray: "\x1b[90m",
  FgWhite: "\x1b[37m",
  FgPurple: "\x1b[38;5;129m",
  FgOrange: "\x1b[38;5;208m",

  // ── Platform brand colors (true 24-bit RGB) ──
  TwitchPurple: "\x1b[38;2;145;70;255m",   // #9146FF
  TikTokPink:   "\x1b[38;2;254;44;85m",    // #FE2C55
  KickGreen:    "\x1b[38;2;83;189;49m",    // #53BD31
  YouTubeRed:   "\x1b[38;2;255;0;0m",      // #FF0000
  SpotifyGreen: "\x1b[38;2;29;185;84m",    // #1DB954

  // ── Hue rainbow characters ──
  HueRed:    "\x1b[38;2;255;0;0m",      // [ bracket
  HueOrange: "\x1b[38;2;255;165;0m",    // h
  HueYellow: "\x1b[38;2;255;255;0m",    // u
  HueGreen:  "\x1b[38;2;0;200;0m",      // e
  HueBlue:   "\x1b[38;2;0;100;255m",    // ] bracket
};

import { EventEmitter } from 'events'
import { inspect } from 'util'

let isLogging = false;

class LogEmitter extends EventEmitter {}
export const logEmitter = new LogEmitter()

const SECRET_KEY_PATTERN = /(api[-_]?key|access[-_]?token|refresh[-_]?token|stream[-_]?key|client[-_]?secret|password|webhook[-_]?url|bot[-_]?token|session[-_]?id|authorization|bearer)/i;

const PrefixColors: Record<string, string> = {
  'main': Colors.FgYellow,
  'services': Colors.FgYellow,
  'registry': Colors.FgYellow,
  'Spotify': Colors.SpotifyGreen,
  'spotify': Colors.SpotifyGreen,
  'spotify-debug': Colors.SpotifyGreen,
  'spotify-managed': Colors.SpotifyGreen,
  'TTS': Colors.FgMagenta,
  'tts': Colors.FgMagenta,
  // ── Twitch (purple #9146FF) ──
  'twitch': Colors.TwitchPurple,
  'Twitch': Colors.TwitchPurple,
  'twitch-connector': Colors.TwitchPurple,
  'connector:twitch': Colors.TwitchPurple,
  // ── TikTok (pink #FE2C55) ──
  'tiktok': Colors.TikTokPink,
  'TikTok': Colors.TikTokPink,
  'TikTokConnector': Colors.TikTokPink,
  'tiktok-sender': Colors.TikTokPink,
  'tiktok-raw-chat': Colors.TikTokPink,
  'connector:tiktok': Colors.TikTokPink,
  // ── Kick (green #53BD31) ──
  'kick': Colors.KickGreen,
  'Kick': Colors.KickGreen,
  'connector:kick': Colors.KickGreen,
  // ── YouTube (red #FF0000) ──
  'youtube': Colors.YouTubeRed,
  'YouTube': Colors.YouTubeRed,
  'youtube-auth': Colors.YouTubeRed,
  'youtube-innertube': Colors.YouTubeRed,
  'connector:youtube': Colors.YouTubeRed,
  // ── Hue uses the rainbow formatter; mapped here so getPrefixColor still returns non-Reset ──
  'Hue': 'HUE_RAINBOW',
  'hue': 'HUE_RAINBOW',
  // ── Other services ──
  'Streaming': Colors.FgRed,
  'Recording': Colors.FgRed,
  'obs': Colors.FgRed,
  'OBS': Colors.FgRed,
  'EventOrchestrator': Colors.FgBlue,
  'events': Colors.FgBlue,
  'AssetProtocol': Colors.FgGray,
  'scheme': Colors.FgGray,
  'stats': Colors.FgWhite,
  'economy': Colors.FgOrange,
  'automation': Colors.FgBlue,
  'db': Colors.FgGray,
  'ipc': Colors.FgGray,
  'renderer:log': Colors.FgWhite,
  'renderer:info': Colors.FgCyan,
  'renderer:warning': Colors.FgYellow,
  'renderer:error': Colors.FgRed,
};

function getPrefixColor(prefix: string): string {
  // Direct match
  if (PrefixColors[prefix]) return PrefixColors[prefix];

  // Case-insensitive match
  const lower = prefix.toLowerCase();
  for (const [key, color] of Object.entries(PrefixColors)) {
    if (key.toLowerCase() === lower) return color;
  }

  // Partial match fallback (platform brand colors take priority)
  if (lower.includes('twitch')) return Colors.TwitchPurple;
  if (lower.includes('tiktok')) return Colors.TikTokPink;
  if (lower.includes('kick')) return Colors.KickGreen;
  if (lower.includes('youtube')) return Colors.YouTubeRed;
  if (lower.includes('hue')) return 'HUE_RAINBOW';
  if (lower.includes('spotify')) return Colors.SpotifyGreen;
  if (lower.includes('tts')) return Colors.FgMagenta;
  if (lower.includes('stream')) return Colors.FgRed;

  return Colors.Reset;
}

/**
 * Returns true when the prefix should use the Hue rainbow formatting.
 */
function isHuePrefix(prefix: string): boolean {
  return getPrefixColor(prefix) === 'HUE_RAINBOW';
}

/**
 * Build the rainbow-colored `[hue]` / `[Hue]` prefix string.
 * Pattern: [ red, h orange, u yellow, e green, ] blue.
 * For longer hue-related prefixes (e.g. "hue-service") the first three
 * characters after `[` get rainbow treatment and the rest is green.
 */
function formatHuePrefix(prefix: string): string {
  const chars = prefix.split('');
  const rainbowColors = [Colors.HueOrange, Colors.HueYellow, Colors.HueGreen];
  let result = `${Colors.HueRed}[`;
  for (let i = 0; i < chars.length; i++) {
    if (i < rainbowColors.length) {
      result += `${rainbowColors[i]}${chars[i]}`;
    } else {
      result += `${Colors.HueGreen}${chars[i]}`;
    }
  }
  result += `${Colors.HueBlue}]${Colors.Reset}`;
  return result;
}

/**
 * Format a colored prefix string. Handles the Hue rainbow as a special case;
 * for all other platforms wraps `[prefix]` in the platform color.
 */
function formatColoredPrefix(prefix: string, color: string): string {
  if (color === 'HUE_RAINBOW') return formatHuePrefix(prefix);
  return `${color}[${prefix}]${Colors.Reset}`;
}

function sanitizeForConsole(text: any): any {
  if (typeof text !== 'string') return text;
  return text
    .replace(/[\u2018\u2019]/g, "'") // Smart single quotes
    .replace(/[\u201C\u201D]/g, '"') // Smart double quotes
    .replace(/[\u2013\u2014]/g, '-') // En/Em dashes
    .replace(/\u2026/g, '...')      // Ellipsis
    .replace(/[^\x00-\x7F]/g, (char) => {
      return char;
    });
}

function redactString(text: string): string {
  return text
    .replace(/("(?:api[-_]?key|access[-_]?token|refresh[-_]?token|stream[-_]?key|client[-_]?secret|password|webhook[-_]?url|bot[-_]?token|session[-_]?id|authorization)"\s*:\s*)"[^"]*"/gi, '$1"[REDACTED]"')
    .replace(/((?:api[-_]?key|access[-_]?token|refresh[-_]?token|stream[-_]?key|client[-_]?secret|password|webhook[-_]?url|bot[-_]?token|session[-_]?id|authorization)\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
}

// Exported so the crash log writer (and any other sink that bypasses the
// console.* redactor pipeline) can apply the same patterns to raw strings.
// This matters because `error.stack` / `error.message` may carry tokens or
// webhook URLs that the renderer log relay would otherwise mask.
export { redactString }

function redactValue(value: any, seen = new WeakSet<object>()): any {
  if (typeof value === 'string') return redactString(value)
  if (!value || typeof value !== 'object') return value
  if (value instanceof Error) {
    const copy = new Error(redactString(value.message))
    copy.name = value.name
    copy.stack = value.stack ? redactString(value.stack) : value.stack
    return copy
  }
  if (seen.has(value)) return '[Circular]'
  seen.add(value)
  if (Array.isArray(value)) return value.map(item => redactValue(item, seen))

  const out: Record<string, any> = {}
  for (const [key, val] of Object.entries(value)) {
    out[key] = SECRET_KEY_PATTERN.test(key) ? '[REDACTED]' : redactValue(val, seen)
  }
  return out
}

function redactArgs(args: any[]): any[] {
  return args.map(arg => redactValue(arg))
}

function prepareForRenderer(args: any[]): any[] {
  return args.map(arg => {
    if (typeof arg === 'string') return redactString(arg);
    if (arg instanceof Error) {
      return {
        ...arg,
        message: redactString(arg.message),
        stack: arg.stack ? redactString(arg.stack) : arg.stack,
        name: arg.name
      };
    }
    try {
      // Use inspect to handle circular references and limit depth for the renderer
      return redactString(inspect(arg, { depth: 3, colors: false, breakLength: Infinity }));
    } catch (e) {
      return `[Uninspectable Object: ${typeof arg}]`;
    }
  });
}

const DISPOSED_WEB_FRAME_LOG_PREFIX = 'Error sending from webFrameMain:';
const DISPOSED_WEB_FRAME_MESSAGE = 'Render frame was disposed before WebFrameMain could be accessed';

export function shouldForwardErrorToRenderer(args: readonly unknown[]): boolean {
  const [prefix, error] = args;
  if (typeof prefix !== 'string' || prefix.trim() !== DISPOSED_WEB_FRAME_LOG_PREFIX) return true;

  const detail = error instanceof Error ? error.message : String(error ?? '');
  return !detail.includes(DISPOSED_WEB_FRAME_MESSAGE);
}

export function setupLogger() {
  if (process.platform === 'win32') {
    try {
      require('child_process').execSync('chcp 65001', { stdio: 'ignore' });
    } catch {}
  }

  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args: any[]) => {
    const redactedArgs = redactArgs(args);
    const sanitizedArgs = redactedArgs.map(sanitizeForConsole);
    if (typeof sanitizedArgs[0] === 'string') {
      const match = sanitizedArgs[0].match(/^((?:[\d:.]+\s*>\s*)?)\[(.*?)\]/);
      if (match) {
        const leading = match[1];
        const prefix = match[2];
        const color = getPrefixColor(prefix);
        if (color !== Colors.Reset) {
          const afterBracket = sanitizedArgs[0].slice(leading.length + prefix.length + 2);
          sanitizedArgs[0] = `${leading}${formatColoredPrefix(prefix, color)}${afterBracket}`;
        }
      }
    }
    originalLog(...sanitizedArgs);

    if (isLogging) return;
    isLogging = true;
    try {
      logEmitter.emit('log', { level: 'info', args: prepareForRenderer(redactedArgs) });
    } finally {
      isLogging = false;
    }
  };

  console.warn = (...args: any[]) => {
    const redactedArgs = redactArgs(args);
    const sanitizedArgs = redactedArgs.map(sanitizeForConsole);
    if (typeof sanitizedArgs[0] === 'string') {
      const match = sanitizedArgs[0].match(/^((?:[\d:.]+\s*>\s*)?)\[(.*?)\]/);
      if (match) {
        const leading = match[1];
        const prefix = match[2];
        const color = getPrefixColor(prefix);
        // Platform-branded brackets; message body stays yellow for warn visibility
        if (color !== Colors.Reset) {
          const body = sanitizedArgs[0].slice(leading.length + prefix.length + 2);
          sanitizedArgs[0] = `${leading}${formatColoredPrefix(prefix, color)}${Colors.FgYellow}${body}${Colors.Reset}`;
        } else {
          const body = sanitizedArgs[0].slice(leading.length + prefix.length + 2);
          sanitizedArgs[0] = `${leading}${Colors.FgYellow}[${prefix}]${Colors.Reset}${Colors.FgYellow}${body}${Colors.Reset}`;
        }
      } else {
        sanitizedArgs[0] = `${Colors.FgYellow}${sanitizedArgs[0]}${Colors.Reset}`;
      }
    }
    originalWarn(...sanitizedArgs);

    if (isLogging) return;
    isLogging = true;
    try {
      logEmitter.emit('log', { level: 'warn', args: prepareForRenderer(redactedArgs) });
    } finally {
      isLogging = false;
    }
  };

  console.error = (...args: any[]) => {
    const redactedArgs = redactArgs(args);
    const sanitizedArgs = redactedArgs.map(sanitizeForConsole);
    if (typeof sanitizedArgs[0] === 'string') {
      const match = sanitizedArgs[0].match(/^((?:[\d:.]+\s*>\s*)?)\[(.*?)\]/);
      if (match) {
        const leading = match[1];
        const prefix = match[2];
        const color = getPrefixColor(prefix);
        // Platform-branded brackets; message body stays red for error visibility
        if (color !== Colors.Reset) {
          const body = sanitizedArgs[0].slice(leading.length + prefix.length + 2);
          sanitizedArgs[0] = `${leading}${formatColoredPrefix(prefix, color)}${Colors.FgRed}${body}${Colors.Reset}`;
        } else {
          const body = sanitizedArgs[0].slice(leading.length + prefix.length + 2);
          sanitizedArgs[0] = `${leading}${Colors.FgRed}[${prefix}]${Colors.Reset}${Colors.FgRed}${body}${Colors.Reset}`;
        }
      } else {
        sanitizedArgs[0] = `${Colors.FgRed}${sanitizedArgs[0]}${Colors.Reset}`;
      }
    }
    originalError(...sanitizedArgs);

    // Electron emits this when the target renderer no longer exists. Keep the
    // local diagnostic above, but do not send it back through that dead frame.
    if (isLogging || !shouldForwardErrorToRenderer(args)) return;
    isLogging = true;
    try {
      logEmitter.emit('log', { level: 'error', args: prepareForRenderer(redactedArgs) });
    } finally {
      isLogging = false;
    }
  };

  // electron-log v5 captures console.log/warn/error references at module load
  // time (before our patches above). Override its writeFn so electron-log
  // output (Hue, Spotify, Razer, etc.) flows through our coloring pipeline.
  try {
    const electronLog = require('electron-log');
    const consoleTransport = electronLog.transports?.console;
    if (consoleTransport && typeof consoleTransport === 'function') {
      consoleTransport.writeFn = ({ message }: { message: { level: string; data: any[] } }) => {
        const level = message.level || 'info';
        const logFn =
          level === 'error' ? console.error :
          level === 'warn' ? console.warn :
          console.log;
        logFn(...message.data);
      };
    }
  } catch {
    // electron-log not available or different version — safe to ignore
  }
}
