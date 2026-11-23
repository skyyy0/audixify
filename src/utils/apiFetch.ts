interface ShieldChallenge {
  nonce: string;
  exp: number;
  difficulty: number;
  sig: string;
}

interface CachedShieldToken {
  headerValue: string;
  expiresAt: number;
}

export interface SafeModeState {
  active: boolean;
  reason: string;
}

let cachedToken: CachedShieldToken | null = null;
let inflightShield: Promise<string> | null = null;

// Server-signed Safe Mode clearance token held in JS memory (+ verified HttpOnly cookie on same-origin)
let clearanceToken: { token: string; expiresAt: number } | null = null;
let safeModeState: SafeModeState = { active: false, reason: '' };
const safeModeListeners = new Set<(state: SafeModeState) => void>();
const safeModeWaiters: Array<(cleared: boolean) => void> = [];

const RELOAD_STAMPS_KEY = 'audixify_boot_stamps_v1';

function notifySafeMode(): void {
  for (const cb of safeModeListeners) {
    cb(safeModeState);
  }
}

export function subscribeSafeMode(cb: (state: SafeModeState) => void): () => void {
  safeModeListeners.add(cb);
  cb(safeModeState);
  return () => {
    safeModeListeners.delete(cb);
  };
}

export function triggerSafeMode(reason: string): void {
  if (safeModeState.active && safeModeState.reason === reason) return;
  safeModeState = { active: true, reason };
  notifySafeMode();
}

export function setSafeModeCleared(token: string, expiresAt: number): void {
  clearanceToken = { token, expiresAt };
  cachedToken = null;
  safeModeState = { active: false, reason: '' };
  try {
    sessionStorage.removeItem(RELOAD_STAMPS_KEY);
  } catch {}
  notifySafeMode();
  while (safeModeWaiters.length > 0) {
    const resolve = safeModeWaiters.shift();
    if (resolve) resolve(true);
  }
}

let bootChecked = false;

export function checkReloadSpamOnBoot(): boolean {
  if (typeof window === 'undefined') return false;
  if (bootChecked) return safeModeState.active;
  bootChecked = true;
  try {
    const now = Date.now();
    const raw = sessionStorage.getItem(RELOAD_STAMPS_KEY);
    const prev = raw ? (JSON.parse(raw) as unknown) : [];
    const stamps = (Array.isArray(prev) ? prev : [])
      .filter((n): n is number => typeof n === 'number' && now - n < 10_000);
    stamps.push(now);
    sessionStorage.setItem(RELOAD_STAMPS_KEY, JSON.stringify(stamps.slice(-12)));
    if (stamps.length >= 6) {
      triggerSafeMode('Spam reload halaman beruntun terdeteksi (proteksi anti-DDoS)');
      return true;
    }
  } catch {}
  return false;
}

if (typeof window !== 'undefined') {
  checkReloadSpamOnBoot();
}

function getActiveClearanceHeader(): string | null {
  if (!clearanceToken) return null;
  if (clearanceToken.expiresAt <= Date.now()) {
    clearanceToken = null;
    return null;
  }
  return clearanceToken.token;
}

function waitForSafeModeResolution(): Promise<boolean> {
  if (!safeModeState.active) return Promise.resolve(true);
  return new Promise((resolve) => {
    safeModeWaiters.push(resolve);
  });
}

function sha256HexSync(ascii: string): string {
  const rightRotate = (value: number, amount: number) =>
    (value >>> amount) | (value << (32 - amount));

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) {
        isComposite[i] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  let msg = `${ascii}\x80`;
  while ((msg.length % 64) - 56) msg += '\x00';
  for (let i = 0; i < msg.length; i++) {
    const j = msg.charCodeAt(i);
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);

    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];

      const a = hash[0];
      const e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);

      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

      hash.unshift((temp1 + temp2) | 0);
      hash.pop();
      hash[4] = (hash[4] + temp1) | 0;
    }

    for (let i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

async function sha256Hex(input: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    try {
      const bytes = new TextEncoder().encode(input);
      const buf = await window.crypto.subtle.digest('SHA-256', bytes);
      const arr = new Uint8Array(buf);
      let hex = '';
      for (let i = 0; i < arr.length; i++) {
        hex += arr[i].toString(16).padStart(2, '0');
      }
      return hex;
    } catch {
      return sha256HexSync(input);
    }
  }
  return sha256HexSync(input);
}

async function solvePow(nonce: string, exp: number, difficulty: number): Promise<string> {
  const prefix = '0'.repeat(Math.max(1, difficulty));
  for (let counter = 0; counter < 50000; counter++) {
    const candidate = counter.toString(36);
    const digest = await sha256Hex(`${nonce}:${exp}:${candidate}`);
    if (digest.startsWith(prefix)) {
      return candidate;
    }
  }
  return '0';
}

async function obtainShieldToken(forceRefresh = false): Promise<string> {
  const now = Date.now();
  if (!forceRefresh && cachedToken && cachedToken.expiresAt > now + 20_000) {
    return cachedToken.headerValue;
  }

  if (!forceRefresh && inflightShield) {
    return inflightShield;
  }

  inflightShield = (async () => {
    const headers: Record<string, string> = {
      'X-Requested-With': 'Audixify-Web',
    };
    const clearance = getActiveClearanceHeader();
    if (clearance) {
      headers['X-Audixify-Clearance'] = clearance;
    }

    const res = await fetch('/api/shield', {
      headers,
      cache: 'no-store',
    });

    if (res.status === 429) {
      try {
        const body = (await res.clone().json()) as { code?: string; reason?: string };
        if (body?.code === 'SAFE_MODE_CAPTCHA') {
          triggerSafeMode(body.reason || 'Unusual request burst detected');
          await waitForSafeModeResolution();
          return obtainShieldToken(true);
        }
      } catch {}
    }

    if (!res.ok) {
      throw new Error('Unable to initialize browser shield');
    }
    const challenge = (await res.json()) as ShieldChallenge;
    const pow = await solvePow(challenge.nonce, challenge.exp, challenge.difficulty || 2);
    const headerValue = `${challenge.nonce}.${challenge.exp}.${challenge.sig}.${pow}`;
    cachedToken = {
      headerValue,
      expiresAt: challenge.exp,
    };
    return headerValue;
  })().finally(() => {
    inflightShield = null;
  });

  return inflightShield;
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  if (safeModeState.active) {
    await waitForSafeModeResolution();
  }

  const makeRequest = async (forceRefresh: boolean) => {
    const token = await obtainShieldToken(forceRefresh);
    const headers = new Headers(init?.headers || {});
    headers.set('X-Requested-With', 'Audixify-Web');
    headers.set('X-Audixify-Shield', token);
    const clearance = getActiveClearanceHeader();
    if (clearance) {
      headers.set('X-Audixify-Clearance', clearance);
    }
    return fetch(input, {
      ...init,
      headers,
    });
  };

  let res = await makeRequest(false);

  if (res.status === 403) {
    try {
      const cloned = res.clone();
      const body = (await cloned.json()) as { code?: string };
      if (body?.code === 'SHIELD_EXPIRED') {
        cachedToken = null;
        res = await makeRequest(true);
      }
    } catch {}
  }

  if (res.status === 429) {
    try {
      const cloned = res.clone();
      const body = (await cloned.json()) as { code?: string; reason?: string };
      if (body?.code === 'SAFE_MODE_CAPTCHA') {
        triggerSafeMode(body.reason || 'Aktivitas request tidak wajar terdeteksi');
        await waitForSafeModeResolution();
        return makeRequest(true);
      }
    } catch {}
  }

  return res;
}
