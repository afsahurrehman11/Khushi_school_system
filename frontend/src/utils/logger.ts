type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const envLevel = (import.meta.env.VITE_LOG_LEVEL || 'info') as Level;
const CURRENT_LEVEL = LEVELS[envLevel] ?? LEVELS.info;
const USE_COLORS = (import.meta.env.VITE_LOG_COLORS || 'true').toLowerCase() === 'true';

function shortTime() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function stringify(msg: unknown) {
  return typeof msg === 'string' ? msg : JSON.stringify(msg);
}

const STYLE: Record<Level, string> = {
  debug: 'color: #6EE7B7',
  info: 'color: #60A5FA',
  warn: 'color: #FBBF24',
  error: 'color: #F87171',
};

function logWithLevel(level: Level, tag: string, msg: unknown) {
  if (LEVELS[level] < CURRENT_LEVEL) return;
  const ts = shortTime();
  const text = `[${ts}] [${tag}] ${stringify(msg)}`;
  if (USE_COLORS && typeof window !== 'undefined' && 'console' in window) {
    // eslint-disable-next-line no-console
    console.log(`%c${text}`, STYLE[level]);
  } else {
    // eslint-disable-next-line no-console
    console.log(text);
  }
}

export default {
  debug: (tag: string, msg: unknown) => logWithLevel('debug', tag, msg),
  info: (tag: string, msg: unknown) => logWithLevel('info', tag, msg),
  warn: (tag: string, msg: unknown) => logWithLevel('warn', tag, msg),
  error: (tag: string, msg: unknown) => logWithLevel('error', tag, msg),
  fileLoaded: (file: string) => {
    if (LEVELS.info < CURRENT_LEVEL) return;
    const ts = shortTime();
    const text = `[${ts}] [LOAD] ${file} loaded`;
    if (USE_COLORS && typeof window !== 'undefined' && 'console' in window) {
      // eslint-disable-next-line no-console
      console.log(`%c${text}`, 'color: #34D399');
    } else {
      // eslint-disable-next-line no-console
      console.log(text);
    }
  }
};
