import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

// Runtime-only HMAC signing secret (read from env in multi-instance hosts, random fallback in-memory)
const SHIELD_SECRET =
  process.env.AUDIXIFY_SHIELD_SECRET || crypto.randomBytes(32).toString('hex');
const ENFORCE_STRICT_HMAC =
  Boolean(process.env.AUDIXIFY_SHIELD_SECRET) || process.env.VERCEL !== '1';

const BOT_UA_PATTERN =
  /(python-requests|python-urllib|aiohttp|httpx|curl\/|wget\/|scrapy|httpclient|go-http-client|java\/|okhttp|axios\/|node-fetch|undici|puppeteer|playwright|selenium|phantomjs|headlesschrome|postmanruntime|insomnia|ahrefsbot|semrushbot|mj12bot|dotbot|gptbot|ccbot|bytespider|claudebot|anthropic-ai|google-extended)/i;

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateMap = new Map<string, RateBucket>();

function getClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function checkRateLimit(key: string, maxRequests: number, windowMs: number): number | null {
  const now = Date.now();
  if (rateMap.size > 5000) {
    for (const [k, b] of rateMap) {
      if (b.resetAt <= now) rateMap.delete(k);
    }
  }
  const existing = rateMap.get(key);
  if (!existing || existing.resetAt <= now) {
    rateMap.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  existing.count += 1;
  if (existing.count > maxRequests) {
    return Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  }
  return null;
}

function isAllowedHostOrOrigin(req: Request): boolean {
  const secFetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  if (secFetchSite === 'cross-site') {
    return false;
  }

  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
  const origin = String(req.headers.origin || '').toLowerCase();
  if (origin && host) {
    try {
      const parsed = new URL(origin);
      if (parsed.host.toLowerCase() !== host) {
        return false;
      }
    } catch {
      return false;
    }
  }

  const referer = String(req.headers.referer || '').toLowerCase();
  if (!origin && referer && host) {
    try {
      const parsed = new URL(referer);
      if (parsed.host.toLowerCase() !== host) {
        return false;
      }
    } catch {
      return false;
    }
  }

  return true;
}

function signChallenge(nonce: string, exp: number): string {
  return crypto
    .createHmac('sha256', SHIELD_SECRET)
    .update(`${nonce}.${exp}`)
    .digest('hex');
}

function verifyHmacSafe(expectedHex: string, actualHex: string): boolean {
  if (expectedHex.length !== actualHex.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedHex, 'hex'),
      Buffer.from(actualHex, 'hex'),
    );
  } catch {
    return false;
  }
}

export function issueShieldChallenge(req: Request, res: Response): void {
  const ua = String(req.headers['user-agent'] || '');
  if (!ua || BOT_UA_PATTERN.test(ua) || !isAllowedHostOrOrigin(req)) {
    res.status(403).json({ error: 'Automated access blocked' });
    return;
  }

  const ip = getClientIp(req);
  const retryAfter = checkRateLimit(`shield:${ip}`, 40, 60_000);
  if (retryAfter !== null) {
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({ error: 'Rate limit exceeded' });
    return;
  }

  const nonce = crypto.randomBytes(12).toString('hex');
  const exp = Date.now() + 10 * 60_000;
  const sig = signChallenge(nonce, exp);

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.json({ nonce, exp, difficulty: 2, sig });
}

export function antiBotApiGuard(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const ua = String(req.headers['user-agent'] || '');
  if (!ua || BOT_UA_PATTERN.test(ua)) {
    res.status(403).json({ error: 'Automated scraping blocked' });
    return;
  }

  if (!isAllowedHostOrOrigin(req)) {
    res.status(403).json({ error: 'Cross-site API requests are not permitted' });
    return;
  }

  if (String(req.headers['x-requested-with'] || '') !== 'Audixify-Web') {
    res.status(403).json({ error: 'Invalid client handshake' });
    return;
  }

  const ip = getClientIp(req);
  const isHeavyRoute =
    req.path === '/api/stream' || req.path === '/api/search' || req.path === '/api/mv';
  const retryAfter = checkRateLimit(
    `${isHeavyRoute ? 'heavy' : 'api'}:${ip}`,
    isHeavyRoute ? 35 : 95,
    60_000,
  );
  if (retryAfter !== null) {
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({ error: 'Too many requests — slow down slightly' });
    return;
  }

  const token = String(req.headers['x-audixify-shield'] || '');
  const parts = token.split('.');
  if (parts.length !== 4) {
    res.status(403).json({ error: 'Browser verification required', code: 'SHIELD_EXPIRED' });
    return;
  }

  const [nonce, expStr, sig, pow] = parts;
  const exp = Number(expStr);
  if (
    !nonce ||
    nonce.length < 16 ||
    !Number.isFinite(exp) ||
    exp < Date.now() ||
    exp > Date.now() + 15 * 60_000 ||
    !pow ||
    pow.length > 32
  ) {
    res.status(403).json({ error: 'Verification expired', code: 'SHIELD_EXPIRED' });
    return;
  }

  if (ENFORCE_STRICT_HMAC) {
    const expectedSig = signChallenge(nonce, exp);
    if (!verifyHmacSafe(expectedSig, sig)) {
      res.status(403).json({ error: 'Invalid verification signature', code: 'SHIELD_EXPIRED' });
      return;
    }
  }

  const powHash = crypto
    .createHash('sha256')
    .update(`${nonce}:${expStr}:${pow}`)
    .digest('hex');
  if (!powHash.startsWith('00')) {
    res.status(403).json({ error: 'Verification challenge failed', code: 'SHIELD_EXPIRED' });
    return;
  }

  next();
}

export function mediaProxyGuard(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const ua = String(req.headers['user-agent'] || '');
  if (!ua || BOT_UA_PATTERN.test(ua)) {
    res.status(403).send('Automated scraping blocked');
    return;
  }

  if (!isAllowedHostOrOrigin(req)) {
    res.status(403).send('External hotlinking blocked');
    return;
  }

  const ip = getClientIp(req);
  const retryAfter = checkRateLimit(`media:${ip}`, 160, 60_000);
  if (retryAfter !== null) {
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).send('Too many media requests');
    return;
  }

  const st = String(req.query.st || '');
  const expStr = String(req.query.exp || '');
  const targetUrl = String(req.query.url || '');
  if (ENFORCE_STRICT_HMAC && targetUrl && st && expStr) {
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < Date.now()) {
      res.status(403).send('Media signature expired');
      return;
    }
    const expected = crypto
      .createHmac('sha256', SHIELD_SECRET)
      .update(`${targetUrl}|${expStr}`)
      .digest('hex')
      .slice(0, 24);
    if (st.length !== expected.length || !verifyHmacSafe(expected, st)) {
      res.status(403).send('Invalid media signature');
      return;
    }
  }

  next();
}

export function signMediaTargetParams(targetUrl: string): string {
  const exp = Date.now() + 2 * 60 * 60_000;
  const st = crypto
    .createHmac('sha256', SHIELD_SECRET)
    .update(`${targetUrl}|${exp}`)
    .digest('hex')
    .slice(0, 24);
  return `url=${encodeURIComponent(targetUrl)}&exp=${exp}&st=${st}`;
}
