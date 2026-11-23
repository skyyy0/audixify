import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

// Runtime-only HMAC signing secret (env var recommended in multi-instance hosts; deployment-scoped or random fallback in memory)
const RUNTIME_FALLBACK_SECRET =
  process.env.VERCEL === '1' && process.env.VERCEL_DEPLOYMENT_ID
    ? crypto
        .createHmac('sha256', process.env.VERCEL_DEPLOYMENT_ID)
        .update(process.env.VERCEL_PROJECT_ID || process.env.VERCEL_URL || 'audixify-vercel')
        .digest('hex')
    : crypto.randomBytes(32).toString('hex');

const SHIELD_SECRET = process.env.AUDIXIFY_SHIELD_SECRET || RUNTIME_FALLBACK_SECRET;
const ENFORCE_STRICT_HMAC =
  Boolean(process.env.AUDIXIFY_SHIELD_SECRET) ||
  Boolean(process.env.VERCEL_DEPLOYMENT_ID) ||
  process.env.VERCEL !== '1';

const BOT_UA_PATTERN =
  /(python-requests|python-urllib|aiohttp|httpx|curl\/|wget\/|scrapy|httpclient|go-http-client|java\/|okhttp|axios\/|node-fetch|undici|puppeteer|playwright|selenium|phantomjs|headlesschrome|postmanruntime|insomnia|ahrefsbot|semrushbot|mj12bot|dotbot|gptbot|ccbot|bytespider|claudebot|anthropic-ai|google-extended|nikto|sqlmap|dirbuster|gobuster|nuclei|masscan|zgrab)/i;

const PROBE_PATH_PATTERN =
  /^\/(\.env|\.git|\.htaccess|\.htpasswd|wp-admin|wp-login\.php|xmlrpc\.php|phpmyadmin|pma|adminer|actuator|server-status|cgi-bin|api\/\.env)/i;

const SAFE_CLEARANCE_COOKIE = 'audixify_safe_clear';
const SAFE_MODE_TTL_MS = 10 * 60_000;
const CLEARANCE_TTL_MS = 15 * 60_000;
const CAPTCHA_TTL_MS = 3 * 60_000;

interface RateBucket {
  count: number;
  resetAt: number;
}

interface SafeModeLock {
  reason: string;
  triggeredAt: number;
  expiresAt: number;
}

const rateMap = new Map<string, RateBucket>();
const safeModeLocks = new Map<string, SafeModeLock>();
const usedCaptchaIds = new Map<string, number>();

export function getClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function getIpHash(ip: string): string {
  return crypto.createHmac('sha256', SHIELD_SECRET).update(ip).digest('hex').slice(0, 16);
}

function pruneExpiredMaps(now: number): void {
  if (rateMap.size > 4000) {
    for (const [k, b] of rateMap) {
      if (b.resetAt <= now) rateMap.delete(k);
    }
  }
  if (safeModeLocks.size > 2000) {
    for (const [k, lock] of safeModeLocks) {
      if (lock.expiresAt <= now) safeModeLocks.delete(k);
    }
  }
  if (usedCaptchaIds.size > 3000) {
    for (const [k, exp] of usedCaptchaIds) {
      if (exp <= now) usedCaptchaIds.delete(k);
    }
  }
}

function checkRateLimit(key: string, maxRequests: number, windowMs: number): number | null {
  const now = Date.now();
  pruneExpiredMaps(now);
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

function triggerSafeMode(ip: string, reason: string): SafeModeLock {
  const now = Date.now();
  const lock: SafeModeLock = {
    reason,
    triggeredAt: now,
    expiresAt: now + SAFE_MODE_TTL_MS,
  };
  safeModeLocks.set(ip, lock);
  return lock;
}

function getActiveSafeMode(ip: string): SafeModeLock | null {
  const lock = safeModeLocks.get(ip);
  if (!lock) return null;
  if (lock.expiresAt <= Date.now()) {
    safeModeLocks.delete(ip);
    return null;
  }
  return lock;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function signHmac(payloadB64: string): string {
  return crypto.createHmac('sha256', SHIELD_SECRET).update(payloadB64).digest('hex');
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

function issueClearanceToken(ip: string): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + CLEARANCE_TTL_MS;
  const payload = {
    ipHash: getIpHash(ip),
    jti: crypto.randomBytes(8).toString('hex'),
    exp: expiresAt,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = signHmac(`clear:${payloadB64}`);
  return {
    token: `${payloadB64}.${sig}`,
    expiresAt,
  };
}

function hasValidClearance(req: Request, ip: string): boolean {
  const headerToken = String(req.headers['x-audixify-clearance'] || '').trim();
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[SAFE_CLEARANCE_COOKIE] || '';
  const candidate = headerToken || cookieToken;
  if (!candidate) return false;

  const dotIdx = candidate.indexOf('.');
  if (dotIdx <= 0) return false;
  const payloadB64 = candidate.slice(0, dotIdx);
  const sig = candidate.slice(dotIdx + 1);
  if (!payloadB64 || !sig) return false;

  const expectedSig = signHmac(`clear:${payloadB64}`);
  if (!verifyHmacSafe(expectedSig, sig)) return false;

  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      ipHash?: string;
      exp?: number;
    };
    if (!parsed || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
      return false;
    }
    return parsed.ipHash === getIpHash(ip);
  } catch {
    return false;
  }
}

function sendSafeModeBlocked(res: Response, reason: string, retryAfterSec = 60): void {
  res.setHeader('Retry-After', String(retryAfterSec));
  res.setHeader('Cache-Control', 'no-store');
  res.status(429).json({
    error:
      'Safe Mode active due to abnormal traffic or rapid reload spam. Please complete human verification.',
    code: 'SAFE_MODE_CAPTCHA',
    safeMode: true,
    reason,
  });
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

export function securityHeadersMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  // Intentionally avoid X-Frame-Options: DENY so AI Studio preview iframe works seamlessly

  if (PROBE_PATH_PATTERN.test(req.path)) {
    const ip = getClientIp(req);
    triggerSafeMode(ip, 'Suspicious scanner path probe detected');
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  next();
}

function detectAnomalyAndMaybeLock(req: Request, ip: string, bucketKind: 'shield' | 'discover' | 'api' | 'heavy'): SafeModeLock | null {
  const existingLock = getActiveSafeMode(ip);
  if (existingLock) {
    // If client solved captcha cleanly after lock, clearance lets them through unless they spam again
    if (!hasValidClearance(req, ip)) {
      return existingLock;
    }
  }

  // Sliding-window burst checks
  if (bucketKind === 'shield') {
    if (checkRateLimit(`ddos:shield10s:${ip}`, 5, 10_000) !== null) {
      return triggerSafeMode(ip, 'Rapid reload / verification burst detected');
    }
  }
  if (bucketKind === 'discover') {
    if (checkRateLimit(`ddos:discover10s:${ip}`, 7, 10_000) !== null) {
      return triggerSafeMode(ip, 'Rapid catalog reload spam detected');
    }
  }
  if (checkRateLimit(`ddos:burst10s:${ip}`, 45, 10_000) !== null) {
    return triggerSafeMode(ip, 'High-frequency DDoS request flood detected');
  }
  if (bucketKind === 'heavy' && checkRateLimit(`ddos:heavy15s:${ip}`, 22, 15_000) !== null) {
    return triggerSafeMode(ip, 'Excessive stream/search scraping burst detected');
  }

  return null;
}

export function issueShieldChallenge(req: Request, res: Response): void {
  const ua = String(req.headers['user-agent'] || '');
  const ip = getClientIp(req);

  if (!ua || BOT_UA_PATTERN.test(ua) || !isAllowedHostOrOrigin(req)) {
    if (checkRateLimit(`bad:shield:${ip}`, 4, 30_000) !== null) {
      triggerSafeMode(ip, 'Repeated automated access signature');
    }
    res.status(403).json({ error: 'Automated access blocked' });
    return;
  }

  const lock = detectAnomalyAndMaybeLock(req, ip, 'shield');
  if (lock) {
    sendSafeModeBlocked(res, lock.reason);
    return;
  }

  const retryAfter = checkRateLimit(`shield:${ip}`, 45, 60_000);
  if (retryAfter !== null) {
    const locked = triggerSafeMode(ip, 'Shield challenge flood exceeded limit');
    sendSafeModeBlocked(res, locked.reason, retryAfter);
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

  const ip = getClientIp(req);
  const ua = String(req.headers['user-agent'] || '');

  if (!ua || BOT_UA_PATTERN.test(ua)) {
    if (checkRateLimit(`bad:bot:${ip}`, 3, 30_000) !== null) {
      triggerSafeMode(ip, 'Automated bot user-agent detected');
    }
    res.status(403).json({ error: 'Automated scraping blocked' });
    return;
  }

  if (!isAllowedHostOrOrigin(req)) {
    res.status(403).json({ error: 'Cross-site API requests are not permitted' });
    return;
  }

  if (String(req.headers['x-requested-with'] || '') !== 'Audixify-Web') {
    if (checkRateLimit(`bad:handshake:${ip}`, 5, 30_000) !== null) {
      const locked = triggerSafeMode(ip, 'Missing client handshake burst');
      sendSafeModeBlocked(res, locked.reason);
      return;
    }
    res.status(403).json({ error: 'Invalid client handshake' });
    return;
  }

  const isHeavyRoute =
    req.path === '/api/stream' || req.path === '/api/search' || req.path === '/api/mv';
  const bucketKind =
    req.path === '/api/discover' ? 'discover' : isHeavyRoute ? 'heavy' : 'api';

  const lock = detectAnomalyAndMaybeLock(req, ip, bucketKind);
  if (lock) {
    sendSafeModeBlocked(res, lock.reason);
    return;
  }

  const retryAfter = checkRateLimit(
    `${isHeavyRoute ? 'heavy' : 'api'}:${ip}`,
    isHeavyRoute ? 40 : 110,
    60_000,
  );
  if (retryAfter !== null) {
    const locked = triggerSafeMode(ip, 'Sustained request limit exceeded');
    sendSafeModeBlocked(res, locked.reason, retryAfter);
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
      if (checkRateLimit(`bad:hmac:${ip}`, 5, 30_000) !== null) {
        triggerSafeMode(ip, 'Invalid shield token burst');
      }
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
  const lock = getActiveSafeMode(ip);
  if (lock && !hasValidClearance(req, ip)) {
    res.status(429).send('Safe Mode verification required');
    return;
  }

  const retryAfter = checkRateLimit(`media:${ip}`, 180, 60_000);
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

/* ============================================================================
   Safe Mode Interactive SVG Captcha Challenge & Verification
   ============================================================================ */

const CAPTCHA_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function buildCaptchaSvg(code: string): string {
  const width = 240;
  const height = 76;
  const rand = (min: number, max: number) => min + Math.random() * (max - min);

  const bezierLines = Array.from({ length: 5 }, (_, idx) => {
    const y1 = rand(10, 66).toFixed(1);
    const y2 = rand(10, 66).toFixed(1);
    const cx = rand(70, 170).toFixed(1);
    const cy = rand(6, 70).toFixed(1);
    const color = idx % 2 === 0 ? 'rgba(255,77,46,0.42)' : 'rgba(255,255,255,0.22)';
    return `<path d="M 4 ${y1} Q ${cx} ${cy} ${width - 4} ${y2}" stroke="${color}" stroke-width="${rand(1.2, 2.2).toFixed(1)}" fill="none" />`;
  }).join('');

  const dots = Array.from({ length: 22 }, () => {
    const cx = rand(8, width - 8).toFixed(1);
    const cy = rand(8, height - 8).toFixed(1);
    const r = rand(1, 2.3).toFixed(1);
    const fill = Math.random() > 0.5 ? 'rgba(255,120,90,0.45)' : 'rgba(255,255,255,0.28)';
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" />`;
  }).join('');

  const glyphs = code
    .split('')
    .map((ch, i) => {
      const x = (30 + i * 42 + rand(-3, 3)).toFixed(1);
      const y = rand(46, 56).toFixed(1);
      const rot = rand(-20, 20).toFixed(1);
      const size = Math.round(rand(29, 34));
      const fill = i % 2 === 0 ? '#FFFFFF' : '#FFD8CF';
      return `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="${size}" font-weight="800" fill="${fill}" letter-spacing="1">${ch}</text>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Security code">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#11131B"/>
      <stop offset="100%" stop-color="#1D1F2B"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" rx="16" fill="url(#bg)"/>
  <path d="M0 24 H240 M0 52 H240 M60 0 V76 M120 0 V76 M180 0 V76" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
  ${bezierLines}
  ${glyphs}
  ${dots}
</svg>`;
}

export function issueCaptchaChallenge(req: Request, res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  if (!isAllowedHostOrOrigin(req)) {
    res.status(403).json({ error: 'Cross-site challenge request blocked' });
    return;
  }

  const ip = getClientIp(req);
  if (checkRateLimit(`captcha:issue:${ip}`, 25, 60_000) !== null) {
    res.status(429).json({ error: 'Too many verification code refreshes. Wait a few seconds.' });
    return;
  }

  const codeBytes = crypto.randomBytes(5);
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += CAPTCHA_ALPHABET[codeBytes[i] % CAPTCHA_ALPHABET.length];
  }

  const challengeId = crypto.randomBytes(10).toString('hex');
  const exp = Date.now() + CAPTCHA_TTL_MS;
  const answerHash = crypto
    .createHmac('sha256', SHIELD_SECRET)
    .update(`ans:${challengeId}:${code}`)
    .digest('hex');

  const payload = {
    id: challengeId,
    answerHash,
    ipHash: getIpHash(ip),
    exp,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = signHmac(`cap:${payloadB64}`);
  const challengeToken = `${payloadB64}.${sig}`;

  const svg = buildCaptchaSvg(code);
  const imageDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;

  const existingLock = getActiveSafeMode(ip);
  const reqReason = typeof req.query.reason === 'string' ? req.query.reason.trim() : '';

  res.json({
    challengeId,
    challengeToken,
    imageDataUrl,
    expiresAt: exp,
    reason:
      existingLock?.reason ||
      (reqReason === 'reload_spam'
        ? 'Rapid reload spam detected on this session'
        : 'Unusual traffic burst detected'),
  });
}

export function verifyCaptchaChallenge(req: Request, res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  if (!isAllowedHostOrOrigin(req)) {
    res.status(403).json({ ok: false, error: 'Cross-site verification blocked' });
    return;
  }

  if (String(req.headers['x-requested-with'] || '') !== 'Audixify-Web') {
    res.status(403).json({ ok: false, error: 'Invalid verification client' });
    return;
  }

  const ip = getClientIp(req);
  if (checkRateLimit(`captcha:verify:${ip}`, 18, 60_000) !== null) {
    res.status(429).json({
      ok: false,
      error: 'Too many verification attempts. Please wait a moment and request a new code.',
    });
    return;
  }

  const body = (req.body || {}) as { challengeToken?: unknown; answer?: unknown };
  const challengeToken = typeof body.challengeToken === 'string' ? body.challengeToken.trim() : '';
  const rawAnswer = typeof body.answer === 'string' ? body.answer.trim().toUpperCase() : '';

  if (!challengeToken || !rawAnswer || rawAnswer.length !== 5) {
    res.status(400).json({
      ok: false,
      error: 'Masukkan 5 karakter kode verifikasi dengan benar.',
      code: 'CAPTCHA_INVALID',
    });
    return;
  }

  const dotIdx = challengeToken.indexOf('.');
  if (dotIdx <= 0) {
    res.status(400).json({ ok: false, error: 'Invalid challenge token', code: 'CAPTCHA_EXPIRED' });
    return;
  }

  const payloadB64 = challengeToken.slice(0, dotIdx);
  const sig = challengeToken.slice(dotIdx + 1);
  const expectedSig = signHmac(`cap:${payloadB64}`);
  if (!verifyHmacSafe(expectedSig, sig)) {
    res.status(403).json({ ok: false, error: 'Invalid challenge signature', code: 'CAPTCHA_INVALID' });
    return;
  }

  let parsed: { id?: string; answerHash?: string; ipHash?: string; exp?: number };
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    res.status(400).json({ ok: false, error: 'Malformed challenge', code: 'CAPTCHA_EXPIRED' });
    return;
  }

  if (
    !parsed.id ||
    !parsed.answerHash ||
    !parsed.ipHash ||
    typeof parsed.exp !== 'number' ||
    parsed.exp < Date.now()
  ) {
    res.status(400).json({
      ok: false,
      error: 'Kode verifikasi kedaluwarsa. Muat ulang kode baru.',
      code: 'CAPTCHA_EXPIRED',
    });
    return;
  }

  if (parsed.ipHash !== getIpHash(ip)) {
    res.status(403).json({
      ok: false,
      error: 'Sesi jaringan berubah. Muat ulang kode verifikasi.',
      code: 'CAPTCHA_EXPIRED',
    });
    return;
  }

  if (usedCaptchaIds.has(parsed.id)) {
    res.status(400).json({
      ok: false,
      error: 'Kode sudah digunakan. Silakan minta kode baru.',
      code: 'CAPTCHA_EXPIRED',
    });
    return;
  }

  const candidateHash = crypto
    .createHmac('sha256', SHIELD_SECRET)
    .update(`ans:${parsed.id}:${rawAnswer}`)
    .digest('hex');

  if (!verifyHmacSafe(parsed.answerHash, candidateHash)) {
    res.status(403).json({
      ok: false,
      error: 'Kode verifikasi salah. Silakan cek kembali atau muat ulang.',
      code: 'CAPTCHA_INVALID',
    });
    return;
  }

  // Mark challenge single-use
  usedCaptchaIds.set(parsed.id, parsed.exp);

  // Clear active Safe Mode lock & burst counters for this IP
  safeModeLocks.delete(ip);
  rateMap.delete(`ddos:shield10s:${ip}`);
  rateMap.delete(`ddos:discover10s:${ip}`);
  rateMap.delete(`ddos:burst10s:${ip}`);
  rateMap.delete(`ddos:heavy15s:${ip}`);
  rateMap.delete(`api:${ip}`);
  rateMap.delete(`heavy:${ip}`);
  rateMap.delete(`shield:${ip}`);

  const clearance = issueClearanceToken(ip);
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const cookieAttrs = [
    `${SAFE_CLEARANCE_COOKIE}=${encodeURIComponent(clearance.token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${Math.floor(CLEARANCE_TTL_MS / 1000)}`,
    isHttps ? 'SameSite=None; Secure' : 'SameSite=Lax',
  ].join('; ');
  res.setHeader('Set-Cookie', cookieAttrs);

  res.json({
    ok: true,
    clearanceToken: clearance.token,
    expiresAt: clearance.expiresAt,
  });
}
