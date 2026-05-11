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
};

import { EventEmitter } from 'events'

class LogEmitter extends EventEmitter {}
export const logEmitter = new LogEmitter()

const PrefixColors: Record<string, string> = {
  'main': Colors.FgYellow,
  'services': Colors.FgYellow,
  'registry': Colors.FgYellow,
  'Spotify': Colors.FgGreen,
  'spotify': Colors.FgGreen,
  'spotify-debug': Colors.FgGreen,
  'spotify-managed': Colors.FgGreen,
  'TTS': Colors.FgMagenta,
  'tts': Colors.FgMagenta,
  'twitch': Colors.FgPurple,
  'Twitch': Colors.FgPurple,
  'tiktok': Colors.FgCyan,
  'TikTok': Colors.FgCyan,
  'tiktok-raw-chat': Colors.FgCyan,
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

  // Partial match fallback
  if (lower.includes('spotify')) return Colors.FgGreen;
  if (lower.includes('tiktok')) return Colors.FgCyan;
  if (lower.includes('twitch')) return Colors.FgPurple;
  if (lower.includes('tts')) return Colors.FgMagenta;
  if (lower.includes('stream')) return Colors.FgRed;

  return Colors.Reset;
}

function sanitizeForConsole(text: any): any {
  if (typeof text !== 'string') return text;
  return text
    .replace(/[\u2018\u2019]/g, "'") // Smart single quotes
    .replace(/[\u201C\u201D]/g, '"') // Smart double quotes
    .replace(/[\u2013\u2014]/g, '-') // En/Em dashes
    .replace(/\u2026/g, '...')      // Ellipsis
    .replace(/[^\x00-\x7F]/g, (char) => {
      // Keep emojis if possible, but they often break too.
      // For now, we just let them through and only fix the common "smart" punctuation.
      return char;
    });
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
    const sanitizedArgs = args.map(sanitizeForConsole);
    if (typeof sanitizedArgs[0] === 'string') {
      const match = sanitizedArgs[0].match(/^\[(.*?)\]/);
      if (match) {
        const prefix = match[1];
        const color = getPrefixColor(prefix);
        if (color !== Colors.Reset) {
          sanitizedArgs[0] = `${color}[${prefix}]${Colors.Reset}${sanitizedArgs[0].slice(prefix.length + 2)}`;
        }
      }
    }
    originalLog(...sanitizedArgs);
    logEmitter.emit('log', { level: 'info', args: sanitizedArgs });
  };

  console.warn = (...args: any[]) => {
    const sanitizedArgs = args.map(sanitizeForConsole);
    if (typeof sanitizedArgs[0] === 'string') {
      const match = sanitizedArgs[0].match(/^\[(.*?)\]/);
      if (match) {
        const prefix = match[1];
        sanitizedArgs[0] = `${Colors.FgYellow}[${prefix}]${Colors.Reset}${sanitizedArgs[0].slice(prefix.length + 2)}`;
      } else {
        sanitizedArgs[0] = `${Colors.FgYellow}${sanitizedArgs[0]}${Colors.Reset}`;
      }
    }
    originalWarn(...sanitizedArgs);
    logEmitter.emit('log', { level: 'warn', args: sanitizedArgs });
  };

  console.error = (...args: any[]) => {
    const sanitizedArgs = args.map(sanitizeForConsole);
    if (typeof sanitizedArgs[0] === 'string') {
      const match = sanitizedArgs[0].match(/^\[(.*?)\]/);
      if (match) {
        const prefix = match[1];
        sanitizedArgs[0] = `${Colors.FgRed}[${prefix}]${Colors.Reset}${sanitizedArgs[0].slice(prefix.length + 2)}`;
      } else {
        sanitizedArgs[0] = `${Colors.FgRed}${sanitizedArgs[0]}${Colors.Reset}`;
      }
    }
    originalError(...sanitizedArgs);
    logEmitter.emit('log', { level: 'error', args: sanitizedArgs });
  };
}
