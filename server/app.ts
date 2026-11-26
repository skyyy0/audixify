import express from 'express';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { RegionScope } from '../src/types/music.ts';
import {
  getAlbumDetail,
  getArtistDetail,
  getDiscoverCatalog,
  getGenreTracks,
  getMusicVideo,
  getReleaseRadar,
  getTrackLyrics,
  isValidExternalMediaUrl,
  resolveAudioStream,
  searchCatalog,
  searchTracksByLyrics,
} from './scraper.ts';
import {
  antiBotApiGuard,
  issueCaptchaChallenge,
  issueShieldChallenge,
  mediaProxyGuard,
  securityHeadersMiddleware,
  signMediaTargetParams,
  verifyCaptchaChallenge,
} from './security.ts';

function signProxyStreamUrl(streamUrl: string | null): string | null {
  if (!streamUrl) return streamUrl;
  const prefixes = ['/api/audio-proxy?url=', '/api/hls-proxy?url=', '/api/hls-audio?url='];
  for (const prefix of prefixes) {
    if (streamUrl.startsWith(prefix)) {
      const encodedTarget = streamUrl.slice(prefix.length);
      try {
        const rawTarget = decodeURIComponent(encodedTarget);
        const basePath = prefix.split('?')[0];
        return `${basePath}?${signMediaTargetParams(rawTarget)}`;
      } catch {
        return streamUrl;
      }
    }
  }
  return streamUrl;
}

export function createApiApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.use(securityHeadersMiddleware);

  app.get('/robots.txt', (_req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(
      [
        'User-agent: *',
        'Allow: /',
        'Allow: /listen-together',
        'Disallow: /api/',
        'Disallow: /support',
        '',
        'User-agent: Googlebot',
        'Allow: /',
        'Allow: /listen-together',
        'Disallow: /api/',
        'Disallow: /support',
        '',
        'User-agent: GPTBot',
        'Disallow: /',
        '',
        'User-agent: CCBot',
        'Disallow: /',
        '',
        'User-agent: Bytespider',
        'Disallow: /',
        '',
        'User-agent: Scrapy',
        'Disallow: /',
        '',
        'User-agent: AhrefsBot',
        'Disallow: /',
        '',
        'User-agent: SemrushBot',
        'Disallow: /',
        '',
        'User-agent: MJ12bot',
        'Disallow: /',
        '',
        'User-agent: ClaudeBot',
        'Disallow: /',
        '',
        'User-agent: Google-Extended',
        'Disallow: /',
        '',
        'Sitemap: https://audixify.skydev.my.id/sitemap.xml',
      ].join('\n'),
    );
  });

  app.get('/sitemap.xml', (_req, res) => {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    const lastmod = new Date().toISOString().slice(0, 10);
    res.send(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '  <url>',
        '    <loc>https://audixify.skydev.my.id/</loc>',
        `    <lastmod>${lastmod}</lastmod>`,
        '    <changefreq>daily</changefreq>',
        '    <priority>1.0</priority>',
        '  </url>',
        '  <url>',
        '    <loc>https://audixify.skydev.my.id/listen-together</loc>',
        `    <lastmod>${lastmod}</lastmod>`,
        '    <changefreq>daily</changefreq>',
        '    <priority>0.85</priority>',
        '  </url>',
        '</urlset>',
      ].join('\n'),
    );
  });

  app.get('/api/health', (_req, res) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.json({ ok: true, app: 'Audixify' });
  });

  app.get('/api/shield', issueShieldChallenge);
  app.get('/api/captcha/challenge', issueCaptchaChallenge);
  app.post('/api/captcha/verify', verifyCaptchaChallenge);

  app.get('/api/discover', antiBotApiGuard, async (req, res) => {
    try {
      const rawScope = String(req.query.scope || 'all').toLowerCase();
      const scope: RegionScope =
        rawScope === 'id' || rawScope === 'asia' || rawScope === 'global' ? rawScope : 'all';
      const data = await getDiscoverCatalog(scope);
      res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
      res.json(data);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to load music catalog',
      });
    }
  });

  app.get('/api/genre/:id', antiBotApiGuard, async (req, res) => {
    try {
      const tracks = await getGenreTracks(String(req.params.id || 'pop-indonesia'));
      res.setHeader('Cache-Control', 'public, max-age=180, stale-while-revalidate=300');
      res.json({ tracks });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to load genre catalog',
      });
    }
  });

  app.get('/api/search', antiBotApiGuard, async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      if (!q) {
        res.json({ query: '', tracks: [], artists: [], albums: [] });
        return;
      }
      const data = await searchCatalog(q);
      res.json(data);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Search scrape failed',
      });
    }
  });

  app.get('/api/lyrics-search', antiBotApiGuard, async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      if (q.length < 2) {
        res.json({ query: q, hits: [] });
        return;
      }
      const data = await searchTracksByLyrics(q);
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json(data);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Lyric search failed',
      });
    }
  });

  app.get('/api/artist', antiBotApiGuard, async (req, res) => {
    try {
      const name = String(req.query.name || '').trim();
      if (!name) {
        res.status(400).json({ error: 'Artist name is required' });
        return;
      }
      const data = await getArtistDetail(name);
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
      res.json(data);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to load artist details',
      });
    }
  });

  app.get('/api/album', antiBotApiGuard, async (req, res) => {
    try {
      const title = String(req.query.title || '').trim();
      const artist = String(req.query.artist || '').trim();
      if (!title) {
        res.status(400).json({ error: 'Album title is required' });
        return;
      }
      const data = await getAlbumDetail(title, artist);
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
      res.json(data);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to load album details',
      });
    }
  });

  app.get('/api/release-radar', antiBotApiGuard, async (req, res) => {
    try {
      const raw = String(req.query.artists || '').trim();
      if (!raw) {
        res.json({ tracks: [], releases: [], artistsChecked: [], fetchedAt: new Date().toISOString() });
        return;
      }
      const names = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10);
      const data = await getReleaseRadar(names);
      res.setHeader('Cache-Control', 'public, max-age=180, stale-while-revalidate=300');
      res.json(data);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to load release radar',
      });
    }
  });

  app.get('/api/stream', antiBotApiGuard, async (req, res) => {
    try {
      const title = String(req.query.title || '').trim();
      const artist = String(req.query.artist || '').trim();
      const durationSec = Number(req.query.durationSec || 0) || 0;
      const scTrackId = Number(req.query.scTrackId || 0) || undefined;
      const previewUrl = req.query.previewUrl ? String(req.query.previewUrl) : undefined;
      const preferYtMusic = req.query.preferYtMusic === '1';

      if (!title || !artist) {
        res.status(400).json({ error: 'Track title and artist are required' });
        return;
      }

      const stream = await resolveAudioStream({
        title,
        artist,
        durationSec,
        scTrackId,
        previewUrl,
        preferYtMusic,
      });
      res.json({
        ...stream,
        streamUrl: signProxyStreamUrl(stream.streamUrl) || stream.streamUrl,
      });
    } catch (err) {
      res.status(404).json({
        error: err instanceof Error ? err.message : 'Unable to resolve stream',
      });
    }
  });

  app.get('/api/lyrics', antiBotApiGuard, async (req, res) => {
    try {
      const title = String(req.query.title || '').trim();
      const artist = String(req.query.artist || '').trim();
      const album = req.query.album ? String(req.query.album) : undefined;
      const durationSec = Number(req.query.durationSec || 0) || undefined;

      if (!title || !artist) {
        res.status(400).json({ error: 'Title and artist are required' });
        return;
      }

      const lyrics = await getTrackLyrics({ title, artist, album, durationSec });
      res.setHeader('Cache-Control', 'public, max-age=600');
      res.json(lyrics);
    } catch {
      res.json({ found: false, synced: false, lines: [], plainText: '' });
    }
  });

  app.get('/api/mv', antiBotApiGuard, async (req, res) => {
    try {
      const title = String(req.query.title || '').trim();
      const artist = String(req.query.artist || '').trim();
      if (!title || !artist) {
        res.status(400).json({ error: 'Title and artist are required' });
        return;
      }
      const mv = await getMusicVideo(title, artist);
      res.json({
        ...mv,
        streamUrl: signProxyStreamUrl(mv.streamUrl),
      });
    } catch {
      res.json({ found: false, streamUrl: null, streamType: null, title: '', thumbnail: '' });
    }
  });

  const audioCacheDir = '/tmp/audixify_audio';
  try {
    fs.mkdirSync(audioCacheDir, { recursive: true });
  } catch {}

  interface ActiveTranscode {
    chunks: Buffer[];
    done: boolean;
    error: boolean;
    subscribers: Set<{
      onChunk: (chunk: Buffer) => void;
      onEnd: (ok: boolean) => void;
    }>;
    killTimeout?: ReturnType<typeof setTimeout>;
  }
  const activeTranscodes = new Map<string, ActiveTranscode>();

  function serveCachedMp3(cachedPath: string, req: express.Request, res: express.Response): boolean {
    try {
      const stat = fs.statSync(cachedPath);
      if (stat.size <= 4096) return false;

      const range = req.headers.range;
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=3600');

      const pipeStream = (stream: fs.ReadStream) => {
        stream.on('error', () => {
          if (!res.writableEnded) res.end();
        });
        res.on('close', () => {
          stream.destroy();
        });
        stream.pipe(res);
      };

      if (range) {
        const match = range.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          const start = Number(match[1]);
          const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
          if (start <= end && start < stat.size) {
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
            res.setHeader('Content-Length', end - start + 1);
            pipeStream(fs.createReadStream(cachedPath, { start, end }));
            return true;
          }
          res.status(416);
          res.setHeader('Content-Range', `bytes */${stat.size}`);
          res.end();
          return true;
        }
      }

      res.setHeader('Content-Length', stat.size);
      pipeStream(fs.createReadStream(cachedPath));
      return true;
    } catch {
      return false;
    }
  }

  app.get('/api/hls-audio', mediaProxyGuard, (req, res) => {
    const targetUrl = String(req.query.url || '');
    if (!targetUrl || !isValidExternalMediaUrl(targetUrl)) {
      res.status(400).send('Invalid media URL');
      return;
    }

    const hash = crypto.createHash('sha1').update(targetUrl).digest('hex');
    const cachedPath = path.join(audioCacheDir, `${hash}.mp3`);

    if (fs.existsSync(cachedPath) && serveCachedMp3(cachedPath, req, res)) {
      return;
    }

    let job = activeTranscodes.get(hash);
    if (!job) {
      const partPath = path.join(audioCacheDir, `${hash}.${Date.now()}.part`);
      const fileWriter = fs.createWriteStream(partPath);
      fileWriter.on('error', () => {});

      const currentJob: ActiveTranscode = {
        chunks: [],
        done: false,
        error: false,
        subscribers: new Set(),
      };
      activeTranscodes.set(hash, currentJob);
      job = currentJob;

      const targetHost = new URL(targetUrl).hostname.toLowerCase();
      const ffArgs: string[] = [
        '-loglevel',
        'error',
        '-user_agent',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      ];
      if (targetHost.endsWith('dailymotion.com') || targetHost.endsWith('dmcdn.net')) {
        ffArgs.push('-headers', 'Referer: https://www.dailymotion.com/\r\n');
      }
      ffArgs.push(
        '-y',
        '-i',
        targetUrl,
        '-vn',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '192k',
        '-f',
        'mp3',
        'pipe:1',
      );

      const ff = spawn('ffmpeg', ffArgs);

      const cleanupPart = () => {
        try {
          if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
        } catch {}
      };

      ff.stdout.on('data', (chunk: Buffer) => {
        currentJob.chunks.push(chunk);
        if (!fileWriter.destroyed && fileWriter.writable) {
          try {
            fileWriter.write(chunk);
          } catch {}
        }
        for (const sub of currentJob.subscribers) {
          sub.onChunk(chunk);
        }
      });

      ff.on('error', () => {
        currentJob.done = true;
        currentJob.error = true;
        activeTranscodes.delete(hash);
        fileWriter.destroy();
        cleanupPart();
        for (const sub of currentJob.subscribers) {
          sub.onEnd(false);
        }
        currentJob.subscribers.clear();
        if (!res.headersSent) {
          res.status(501).send('Transcoder unavailable; use HLS proxy mode');
        }
      });

      ff.on('close', (code) => {
        currentJob.done = true;
        const ok = code === 0 && currentJob.chunks.length > 0;
        currentJob.error = !ok;
        if (currentJob.killTimeout) {
          clearTimeout(currentJob.killTimeout);
        }
        fileWriter.end(() => {
          if (ok && fs.existsSync(partPath)) {
            try {
              if (!fs.existsSync(cachedPath)) {
                fs.renameSync(partPath, cachedPath);
              } else {
                cleanupPart();
              }
            } catch {
              cleanupPart();
            }
          } else {
            cleanupPart();
          }
          activeTranscodes.delete(hash);
          for (const sub of currentJob.subscribers) {
            sub.onEnd(ok);
          }
          currentJob.subscribers.clear();
        });
      });

      const scheduleIdleKill = () => {
        if (currentJob.subscribers.size > 0 || currentJob.done) return;
        currentJob.killTimeout = setTimeout(() => {
          if (currentJob.subscribers.size === 0 && !currentJob.done) {
            if (!ff.killed) ff.kill('SIGKILL');
          }
        }, 12000);
      };
      (currentJob as ActiveTranscode & { scheduleIdleKill?: () => void }).scheduleIdleKill = scheduleIdleKill;
    }

    if (job.killTimeout) {
      clearTimeout(job.killTimeout);
      job.killTimeout = undefined;
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.on('error', () => {});

    for (const chunk of job.chunks) {
      if (res.destroyed || res.writableEnded) return;
      try {
        res.write(chunk);
      } catch {
        return;
      }
    }

    if (job.done) {
      if (!res.writableEnded) res.end();
      return;
    }

    const subscriber = {
      onChunk: (chunk: Buffer) => {
        if (res.destroyed || res.writableEnded) return;
        try {
          res.write(chunk);
        } catch {}
      },
      onEnd: () => {
        if (!res.writableEnded) res.end();
      },
    };
    job.subscribers.add(subscriber);

    req.on('close', () => {
      job?.subscribers.delete(subscriber);
      const idleFn = (job as ActiveTranscode & { scheduleIdleKill?: () => void })?.scheduleIdleKill;
      if (idleFn) idleFn();
    });
  });

  app.get('/api/hls-proxy', mediaProxyGuard, async (req, res) => {
    const targetUrl = String(req.query.url || '');
    if (!targetUrl || !isValidExternalMediaUrl(targetUrl)) {
      res.status(400).send('Invalid media URL');
      return;
    }

    try {
      const targetHost = new URL(targetUrl).hostname.toLowerCase();
      const upstreamHeaders: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      };
      if (targetHost.endsWith('dailymotion.com') || targetHost.endsWith('dmcdn.net')) {
        upstreamHeaders.Referer = 'https://www.dailymotion.com/';
      }
      const upstream = await fetch(targetUrl, {
        headers: upstreamHeaders,
        signal: AbortSignal.timeout(15000),
      });

      if (!isValidExternalMediaUrl(upstream.url)) {
        res.status(403).send('Redirect target not allowed');
        return;
      }

      if (!upstream.ok) {
        res.status(upstream.status).send('Upstream media error');
        return;
      }

      const contentType = upstream.headers.get('content-type') || '';
      const isPlaylist =
        targetUrl.includes('.m3u8') ||
        contentType.includes('mpegurl') ||
        contentType.includes('x-mpegURL');

      if (isPlaylist) {
        const text = await upstream.text();
        if (text.includes('skd://') || text.includes('METHOD=SAMPLE-AES')) {
          res.status(422).send('Encrypted DRM stream unsupported');
          return;
        }
        const rewritten = text
          .split('\n')
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return line;
            if (trimmed.startsWith('#EXT-X-') && trimmed.includes('URI="')) {
              return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
                const abs = new URL(uri, upstream.url).toString();
                if (!isValidExternalMediaUrl(abs)) return 'URI=""';
                return `URI="/api/hls-proxy?${signMediaTargetParams(abs)}"`;
              });
            }
            if (trimmed.startsWith('#')) return line;
            const abs = new URL(trimmed, upstream.url).toString();
            if (!isValidExternalMediaUrl(abs)) return '';
            return `/api/hls-proxy?${signMediaTargetParams(abs)}`;
          })
          .join('\n');

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-store');
        res.send(rewritten);
        return;
      }

      res.setHeader('Content-Type', contentType || 'audio/mp4');
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      res.setHeader('Cache-Control', 'public, max-age=3600');

      if (upstream.body) {
        const nodeStream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
        nodeStream.on('error', () => {
          if (!res.headersSent) res.status(502);
          if (!res.writableEnded) res.end();
        });
        res.on('error', () => nodeStream.destroy());
        req.on('close', () => nodeStream.destroy());
        nodeStream.pipe(res);
      } else {
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.send(buf);
      }
    } catch {
      if (!res.headersSent) {
        res.status(502).send('Stream proxy error');
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  });

  app.get('/api/audio-proxy', mediaProxyGuard, async (req, res) => {
    const targetUrl = String(req.query.url || '');
    if (!targetUrl || !isValidExternalMediaUrl(targetUrl)) {
      res.status(400).send('Invalid audio URL');
      return;
    }

    try {
      const targetHost = new URL(targetUrl).hostname.toLowerCase();
      const headers: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      };
      if (
        targetHost.endsWith('bilivideo.com') ||
        targetHost.endsWith('bilivideo.cn') ||
        targetHost.endsWith('biliapi.net') ||
        targetHost.endsWith('hdslb.com') ||
        (targetHost.startsWith('upos-') && targetHost.endsWith('akamaized.net'))
      ) {
        headers.Referer = 'https://www.bilibili.com/';
      }
      if (req.headers.range) {
        headers.Range = req.headers.range;
      }

      const upstream = await fetch(targetUrl, {
        headers,
        signal: AbortSignal.timeout(15000),
      });

      if (!isValidExternalMediaUrl(upstream.url)) {
        res.status(403).send('Redirect target not allowed');
        return;
      }

      res.status(upstream.status);
      const copyHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
      for (const h of copyHeaders) {
        const val = upstream.headers.get(h);
        if (val) res.setHeader(h, val);
      }
      if (!upstream.headers.get('content-type')) {
        res.setHeader('Content-Type', 'audio/mpeg');
      }

      if (upstream.body) {
        const nodeStream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
        nodeStream.on('error', () => {
          if (!res.headersSent) res.status(502);
          if (!res.writableEnded) res.end();
        });
        res.on('error', () => nodeStream.destroy());
        req.on('close', () => nodeStream.destroy());
        nodeStream.pipe(res);
      } else {
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.send(buf);
      }
    } catch {
      if (!res.headersSent) {
        res.status(502).send('Audio proxy error');
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  });

  const ARTWORK_EXTRA_HOST_SUFFIXES = ['ytimg.com', 'ggpht.com', 'googleusercontent.com'];
  const isValidExternalArtworkUrl = (rawUrl: string): boolean => {
    if (isValidExternalMediaUrl(rawUrl)) return true;
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'https:') return false;
      const host = parsed.hostname.toLowerCase();
      return ARTWORK_EXTRA_HOST_SUFFIXES.some(
        (suffix) => host === suffix || host.endsWith(`.${suffix}`),
      );
    } catch {
      return false;
    }
  };

  app.get('/api/artwork-proxy', mediaProxyGuard, async (req, res) => {
    const targetUrl = String(req.query.url || '');
    if (!targetUrl || !isValidExternalArtworkUrl(targetUrl)) {
      res.status(400).send('Invalid artwork URL');
      return;
    }

    try {
      const upstream = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!isValidExternalArtworkUrl(upstream.url)) {
        res.status(403).send('Redirect target not allowed');
        return;
      }

      if (!upstream.ok) {
        res.status(upstream.status).send('Artwork unavailable');
        return;
      }

      const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
      if (!contentType.startsWith('image/')) {
        res.status(415).send('Non-image upstream rejected');
        return;
      }

      const buf = Buffer.from(await upstream.arrayBuffer());
      if (buf.byteLength === 0 || buf.byteLength > 6 * 1024 * 1024) {
        res.status(413).send('Artwork size out of bounds');
        return;
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
      res.send(buf);
    } catch {
      if (!res.headersSent) {
        res.status(502).send('Artwork proxy error');
      }
    }
  });

  const visitorSessions = new Map<string, { mode: 'guest' | 'gmail'; lastSeen: number }>();
  const VISITOR_WINDOW_MS = 30 * 60_000;

  app.use('/api', (req, _res, next) => {
    const sid = String(req.headers['x-audixify-sid'] || '').trim().slice(0, 64);
    const authMode = req.headers['x-audixify-auth'] === 'gmail' ? 'gmail' : 'guest';
    if (sid && sid !== 'ssr') {
      const now = Date.now();
      visitorSessions.set(sid, { mode: authMode, lastSeen: now });
      if (visitorSessions.size > 5000) {
        for (const [k, v] of visitorSessions) {
          if (now - v.lastSeen > VISITOR_WINDOW_MS) visitorSessions.delete(k);
        }
      }
    }
    next();
  });

  app.get('/api/visitor-telemetry', antiBotApiGuard, (_req, res) => {
    const now = Date.now();
    let activeGuests = 0;
    let activeSignedIn = 0;
    for (const [k, v] of visitorSessions) {
      if (now - v.lastSeen > VISITOR_WINDOW_MS) {
        visitorSessions.delete(k);
        continue;
      }
      if (v.mode === 'gmail') activeSignedIn += 1;
      else activeGuests += 1;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      activeGuests,
      activeSignedIn,
      windowMinutes: 30,
    });
  });

  app.use(
    '/api',
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (!res.headersSent) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Internal server error',
        });
      }
    },
  );

  return app;
}

