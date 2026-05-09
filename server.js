#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const {
  buildUnconfiguredGithubState,
  fetchGithubState,
  computeProfilesFingerprint,
  buildContributorState
} = require('./scripts/state-builder');

const PORT = Number(process.env.PORT || 3008);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const POLL_INTERVAL_MS = 700;
const GITHUB_SYNC_INTERVAL_MS = 60000;
const GITHUB_REPOSITORY = String(process.env.GITHUB_REPOSITORY || '').trim();
const GITHUB_TOKEN = String(process.env.GITHUB_TOKEN || '').trim();

const clients = new Set();
let lastGoodContributors = [];
let lastFingerprint = '';
let githubState = buildUnconfiguredGithubState();
let currentState = buildState();

async function refreshGithubSync() {
  try {
    githubState = await fetchGithubState({
      repository: GITHUB_REPOSITORY,
      token: GITHUB_TOKEN
    });
  } catch (error) {
    githubState = {
      ...githubState,
      configured: Boolean(GITHUB_REPOSITORY),
      ok: false,
      repository: GITHUB_REPOSITORY,
      events: [],
      message: error.message
    };
  }

  currentState = buildState();
  broadcast('state', currentState);
  broadcast('pulse', {
    type: githubState.ok ? 'success' : 'error',
    message: githubState.message,
    generatedAt: currentState.generatedAt
  });
}

function buildState() {
  const state = buildContributorState({
    githubState,
    fallbackContributors: lastGoodContributors
  });

  if (state.ok) {
    lastGoodContributors = state.contributors;
  }

  return state;
}

function sendSse(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcast(event, payload) {
  for (const res of clients) {
    sendSse(res, event, payload);
  }
}

function safeStaticPath(urlPath) {
  const cleanUrl = urlPath.split('?')[0].split('#')[0];
  const requested = cleanUrl === '/' ? '/index.html' : cleanUrl;
  const decoded = decodeURIComponent(requested);
  const fullPath = path.normalize(path.join(PUBLIC_DIR, decoded));

  if (!fullPath.startsWith(PUBLIC_DIR)) {
    return null;
  }

  return fullPath;
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon'
  }[ext] || 'application/octet-stream';
}

function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/api/contributors') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(currentState, null, 2));
    return;
  }

  if (url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    res.write('retry: 1000\n\n');
    sendSse(res, 'state', currentState);
    clients.add(res);

    req.on('close', () => {
      clients.delete(res);
    });
    return;
  }

  const filePath = safeStaticPath(url.pathname);
  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentType(filePath),
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}

function pollForChanges() {
  try {
    const nextFingerprint = computeProfilesFingerprint();
    if (nextFingerprint !== lastFingerprint) {
      lastFingerprint = nextFingerprint;
      currentState = buildState();
      broadcast('state', currentState);
      broadcast('pulse', {
        type: currentState.ok ? 'success' : 'error',
        message: currentState.message,
        generatedAt: currentState.generatedAt
      });
    }
  } catch (error) {
    const payload = {
      ok: false,
      generatedAt: new Date().toISOString(),
      count: lastGoodContributors.length,
      contributors: lastGoodContributors,
      previewContributors: [],
      errors: [`服务读取数据失败: ${error.message}`],
      warnings: [],
      github: githubState,
      message: '服务读取数据失败，页面暂时保留上一次有效结果'
    };
    currentState = payload;
    broadcast('state', payload);
  }
}

lastFingerprint = computeProfilesFingerprint();

const server = http.createServer(handleRequest);
server.listen(PORT, () => {
  console.log('');
  console.log('Open Source Pulse Wall is running');
  console.log(`Local:   http://localhost:${PORT}`);
  console.log(`API:     http://localhost:${PORT}/api/contributors`);
  console.log('');
  console.log('Edit or add files in data/profiles and the page will update automatically.');
  console.log('Press Ctrl+C to stop.');
  console.log('');
});

refreshGithubSync();
setInterval(pollForChanges, POLL_INTERVAL_MS);
setInterval(refreshGithubSync, GITHUB_SYNC_INTERVAL_MS);
setInterval(() => {
  broadcast('heartbeat', { at: new Date().toISOString(), clients: clients.size });
}, 15000);
