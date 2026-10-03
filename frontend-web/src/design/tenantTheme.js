/**
 * Tenant Brand Pack schema + runtime theme engine.
 *
 * Tenants express identity ONLY through a Brand Pack; the engine derives the
 * Tier-2 semantic tokens (light + dark) and enforces the contrast floors
 * (text 4.5:1, interactive 3:1) by darkening/lightening a failing brand tone
 * to the nearest passing tone — never silently failing (changes are logged).
 */

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex([r, g, b]) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
function mix(a, b, t) { // t=0 -> a, t=1 -> b
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(fg, bg) {
  const L1 = luminance(fg), L2 = luminance(bg);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

/** Build a 10-step tonal ramp from a seed color. */
export function tonalRamp(seed) {
  return {
    25:  mix(seed, '#FFFFFF', 0.94),
    50:  mix(seed, '#FFFFFF', 0.88),
    100: mix(seed, '#FFFFFF', 0.76),
    200: mix(seed, '#FFFFFF', 0.60),
    300: mix(seed, '#FFFFFF', 0.40),
    400: mix(seed, '#FFFFFF', 0.18),
    500: seed,
    600: mix(seed, '#000000', 0.14),
    700: mix(seed, '#000000', 0.30),
    800: mix(seed, '#000000', 0.46),
    900: mix(seed, '#000000', 0.62),
  };
}

/**
 * Enforce contrast floor: nudge `fg` toward black/white until it passes
 * `floor` against `bg`. Returns { color, adjusted } and logs adjustments.
 */
export function ensureContrast(fg, bg, floor, label) {
  if (contrastRatio(fg, bg) >= floor) return { color: fg, adjusted: false };
  const target = luminance(fg) > luminance(bg) ? '#FFFFFF' : '#000000';
  let out = fg;
  for (let t = 0.05; t <= 1.0; t += 0.05) {
    const candidate = mix(fg, target, t);
    if (contrastRatio(candidate, bg) >= floor) { out = candidate; break; }
    out = candidate;
  }
  console.warn(
    `[tenant-theme] Contrast guard: "${label}" ${fg} on ${bg} = ` +
    `${contrastRatio(fg, bg).toFixed(2)}:1 < ${floor}:1 floor — adjusted to ${out} ` +
    `(${contrastRatio(out, bg).toFixed(2)}:1)`
  );
  return { color: out, adjusted: true };
}

/** Default master brand (Atlas Indigo). */
export const DEFAULT_BRAND_PACK = {
  tenantId: 'atlas',
  displayName: 'Atlas',
  seedColor: '#3D52E0',
  neutrals: 'cool',
  radiusBias: 'default',      // 'sharp' (traditional) | 'default' | 'round' (friendly)
  darkStrategy: 'auto',       // 'auto' | 'manual'
  motionPersonality: 'measured',
  voice: { greeting: 'Hello' },
};

/** Example tenant roster (3 contrasting vibes). */
export const TENANT_ROSTER = [
  DEFAULT_BRAND_PACK,
  {
    tenantId: 'meridian', displayName: 'Meridian',
    seedColor: '#1B3A6B', neutrals: 'warm', radiusBias: 'sharp',
    darkStrategy: 'auto', motionPersonality: 'measured',
    voice: { greeting: 'Welcome' },
  },
  {
    tenantId: 'pulse', displayName: 'Pulse',
    seedColor: '#7C3AED', neutrals: 'cool', radiusBias: 'round',
    darkStrategy: 'auto', motionPersonality: 'expressive',
    voice: { greeting: 'Hey' },
  },
  {
    tenantId: 'cobalt', displayName: 'Cobalt',
    seedColor: '#0E7C86', neutrals: 'cool', radiusBias: 'default',
    darkStrategy: 'auto', motionPersonality: 'measured',
    voice: { greeting: 'Hello' },
  },
];

const RADIUS_MAP = {
  sharp:   { xs: '4px', sm: '6px',  md: '10px', lg: '14px' },
  default: { xs: '8px', sm: '12px', md: '16px', lg: '24px' },
  round:   { xs: '12px', sm: '16px', md: '22px', lg: '30px' },
};

const STORAGE_KEY = 'nb.tenant';
const MODE_KEY = 'nb.colorMode'; // 'light' | 'dark' | 'system'

/** Apply a Brand Pack: sets all Tier-2 action/focus tokens from the seed. */
export function applyTenantTheme(pack = DEFAULT_BRAND_PACK) {
  if (!pack.seedColor || !HEX_RE.test(pack.seedColor)) {
    console.warn(`[tenant-theme] Invalid seedColor "${pack.seedColor}" — falling back to Atlas default`);
    pack = { ...pack, seedColor: DEFAULT_BRAND_PACK.seedColor };
  }
  const ramp = tonalRamp(pack.seedColor.startsWith('#') ? pack.seedColor : `#${pack.seedColor}`);
  const root = document.documentElement;

  root.style.setProperty('--nb-brand-25', ramp[25]);
  root.style.setProperty('--nb-brand-50', ramp[50]);
  root.style.setProperty('--nb-brand-100', ramp[100]);
  root.style.setProperty('--nb-brand-200', ramp[200]);
  root.style.setProperty('--nb-brand-300', ramp[300]);
  root.style.setProperty('--nb-brand-400', ramp[400]);
  root.style.setProperty('--nb-brand-500', ramp[500]);
  root.style.setProperty('--nb-brand-600', ramp[600]);
  root.style.setProperty('--nb-brand-700', ramp[700]);
  root.style.setProperty('--nb-brand-800', ramp[800]);
  root.style.setProperty('--nb-brand-900', ramp[900]);

  const radius = RADIUS_MAP[pack.radiusBias] || RADIUS_MAP.default;
  root.style.setProperty('--nb-radius-xs', radius.xs);
  root.style.setProperty('--nb-radius-sm', radius.sm);
  root.style.setProperty('--nb-radius-md', radius.md);
  root.style.setProperty('--nb-radius-lg', radius.lg);

  root.dataset.tenant = pack.tenantId;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pack)); } catch {}
  return pack;
}

/** Apply color mode: 'light' | 'dark' | 'system' (follows OS). */
export function applyColorMode(mode = 'system') {
  const root = document.documentElement;
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const dark = mode === 'dark' || (mode === 'system' && prefersDark);
  root.classList.add('nb-theme-anim');
  root.classList.toggle('dark', dark);
  root.dataset.theme = dark ? 'dark' : 'light';
  try { localStorage.setItem(MODE_KEY, mode); } catch {}
  setTimeout(() => root.classList.remove('nb-theme-anim'), 300);
  return dark ? 'dark' : 'light';
}

export function getColorMode() {
  try { return localStorage.getItem(MODE_KEY) || 'system'; } catch { return 'system'; }
}
export function getStoredTenant() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_BRAND_PACK;
  } catch { return DEFAULT_BRAND_PACK; }
}

/** Boot the theme: call once at app start. Returns current mode. */
export function initTheme({ tenant } = {}) {
  applyTenantTheme(tenant || getStoredTenant());
  const mode = getColorMode();
  const applied = applyColorMode(mode);
  if (mode === 'system' && window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (getColorMode() === 'system') applyColorMode('system');
    });
  }
  return applied;
}

/** Format helper: split an amount into symbol + tabular figure parts. */
export function amountParts(amount, currency = '₦') {
  const n = Math.abs(Number(amount) || 0);
  const formatted = n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return { symbol: currency, value: formatted, sign: amount < 0 ? '−' : amount > 0 ? '+' : '' };
}
