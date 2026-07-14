'use strict';

const { createReadStream } = require('node:fs');
const { stat } = require('node:fs/promises');
const path = require('node:path');
const { Readable } = require('node:stream');

const GAME_SCHEME = 'minidayz';
const GAME_HOST = 'app';

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.ico', 'image/x-icon'],
  ['.ogg', 'audio/ogg'],
  ['.m4a', 'audio/mp4'],
]);

function resolveGameAsset(gameRoot, requestUrl) {
  let url;

  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }

  if (url.protocol !== `${GAME_SCHEME}:` || url.hostname !== GAME_HOST) {
    return null;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname).replaceAll('\\', '/');
  } catch {
    return null;
  }

  if (pathname.includes('\0')) {
    return null;
  }

  const requestedPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const root = path.resolve(gameRoot);
  const resolved = path.resolve(root, requestedPath);
  const relative = path.relative(root, resolved);

  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return null;
  }

  return resolved;
}

function parseByteRange(rangeHeader, size) {
  if (!rangeHeader) {
    return undefined;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || size <= 0) {
    return null;
  }

  const [, startText, endText] = match;
  if (!startText && !endText) {
    return null;
  }

  let start;
  let end;

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return null;
    }
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText ? Number(endText) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
      return null;
    }
  }

  if (start < 0 || start >= size || end < start) {
    return null;
  }

  return { start, end: Math.min(end, size - 1) };
}

function contentTypeFor(assetPath) {
  return MIME_TYPES.get(path.extname(assetPath).toLowerCase()) ?? 'application/octet-stream';
}

function textResponse(message, status, extraHeaders = {}) {
  return new Response(message, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

async function createAssetResponse(gameRoot, request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return textResponse('Method not allowed', 405, { Allow: 'GET, HEAD' });
  }

  let assetPath = resolveGameAsset(gameRoot, request.url);
  if (!assetPath) {
    return textResponse('Not found', 404);
  }

  let fileInfo;
  try {
    fileInfo = await stat(assetPath);
    if (fileInfo.isDirectory()) {
      assetPath = path.join(assetPath, 'index.html');
      fileInfo = await stat(assetPath);
    }
  } catch {
    return textResponse('Not found', 404);
  }

  if (!fileInfo.isFile()) {
    return textResponse('Not found', 404);
  }

  const etag = `W/\"${fileInfo.size.toString(16)}-${Math.trunc(fileInfo.mtimeMs).toString(16)}\"`;
  const commonHeaders = {
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
    'Content-Type': contentTypeFor(assetPath),
    ETag: etag,
    'Last-Modified': fileInfo.mtime.toUTCString(),
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  };

  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: commonHeaders });
  }

  const range = parseByteRange(request.headers.get('range'), fileInfo.size);
  if (range === null) {
    return new Response(null, {
      status: 416,
      headers: { ...commonHeaders, 'Content-Range': `bytes */${fileInfo.size}` },
    });
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? fileInfo.size - 1;
  const contentLength = end - start + 1;
  const headers = { ...commonHeaders, 'Content-Length': String(contentLength) };
  const status = range ? 206 : 200;

  if (range) {
    headers['Content-Range'] = `bytes ${start}-${end}/${fileInfo.size}`;
  }

  const body = request.method === 'HEAD'
    ? null
    : Readable.toWeb(createReadStream(assetPath, { start, end }));

  return new Response(body, { status, headers });
}

module.exports = {
  GAME_HOST,
  GAME_SCHEME,
  contentTypeFor,
  createAssetResponse,
  parseByteRange,
  resolveGameAsset,
};
