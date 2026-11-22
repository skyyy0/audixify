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

let cachedToken: CachedShieldToken | null = null;
let inflightShield: Promise<string> | null = null;

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
  // With difficulty 2 (~256 tries avg), first byte == 0x00 takes <2ms in WebCrypto or sync
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
    const res = await fetch('/api/shield', {
      headers: {
        'X-Requested-With': 'Audixify-Web',
      },
      cache: 'no-store',
    });
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
  const makeRequest = async (forceRefresh: boolean) => {
    const token = await obtainShieldToken(forceRefresh);
    const headers = new Headers(init?.headers || {});
    headers.set('X-Requested-With', 'Audixify-Web');
    headers.set('X-Audixify-Shield', token);
    return fetch(input, {
      ...init,
      headers,
    });
  };

  const res = await makeRequest(false);
  if (res.status === 403) {
    try {
      const cloned = res.clone();
      const body = (await cloned.json()) as { code?: string };
      if (body?.code === 'SHIELD_EXPIRED') {
        cachedToken = null;
        return makeRequest(true);
      }
    } catch {
      // Non-JSON 403, return original response
    }
  }
  return res;
}
