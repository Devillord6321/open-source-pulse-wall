#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readAndValidateAll } = require('./scripts/validate-contributors');

const PORT = Number(process.env.PORT || 3008);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const PROFILES_DIR = path.join(ROOT, 'data', 'profiles');
const POLL_INTERVAL_MS = 700;
const GITHUB_SYNC_INTERVAL_MS = 60000;
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_REPOSITORY = String(process.env.GITHUB_REPOSITORY || '').trim();
const GITHUB_TOKEN = String(process.env.GITHUB_TOKEN || '').trim();

const clients = new Set();
let lastGoodContributors = [];
let lastFingerprint = '';
let githubState = buildUnconfiguredGithubState();
let currentState = buildState();

function buildUnconfiguredGithubState() {
  return {
    configured: false,
    ok: false,
    repository: '',
    stars: null,
    contributorCount: null,
    cloneUrl: '',
    htmlUrl: '',
    pushedAt: '',
    latestCommitAt: '',
    events: [],
    message: '未配置 GITHUB_REPOSITORY，无法与 GitHub 真实同步'
  };
}

function buildGithubHeaders() {
  const headers = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'open-source-pulse-wall',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  if (GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  }

  return headers;
}

function assertGithubRepository(value) {
  if (!value) {
    throw new Error('需要配置 GITHUB_REPOSITORY 才能与 GitHub 真实同步，例如 owner/repo');
  }

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    throw new Error('GITHUB_REPOSITORY 必须使用 owner/repo 格式');
  }
}

async function fetchGithubJson(pathname) {
  const response = await fetch(`${GITHUB_API_BASE}${pathname}`, {
    headers: buildGithubHeaders()
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status}: ${body.slice(0, 240)}`);
  }

  return response.json();
}

function pickCommitTime(commit) {
  return commit?.commit?.committer?.date || commit?.commit?.author?.date || '';
}

function normalizeGithubEvent(commit) {
  const author = commit.author?.login || commit.commit?.author?.name || 'unknown';
  const message = String(commit.commit?.message || 'Commit').split('\n')[0];

  return {
    type: 'commit',
    time: pickCommitTime(commit),
    message: `${author}: ${message}`
  };
}

async function fetchGithubState() {
  assertGithubRepository(GITHUB_REPOSITORY);

  const encodedRepo = GITHUB_REPOSITORY.split('/').map(encodeURIComponent).join('/');
  const [repo, contributors, commits] = await Promise.all([
    fetchGithubJson(`/repos/${encodedRepo}`),
    fetchGithubJson(`/repos/${encodedRepo}/contributors?per_page=100`),
    fetchGithubJson(`/repos/${encodedRepo}/commits?per_page=5`)
  ]);

  const latestCommitAt = Array.isArray(commits) && commits.length ? pickCommitTime(commits[0]) : '';

  return {
    configured: true,
    ok: true,
    repository: repo.full_name || GITHUB_REPOSITORY,
    stars: Number(repo.stargazers_count || 0),
    contributorCount: Array.isArray(contributors) ? contributors.length : 0,
    cloneUrl: repo.clone_url || '',
    htmlUrl: repo.html_url || '',
    pushedAt: repo.pushed_at || '',
    latestCommitAt,
    events: Array.isArray(commits) ? commits.map(normalizeGithubEvent) : [],
    message: `已同步 GitHub 仓库 ${repo.full_name || GITHUB_REPOSITORY}`
  };
}

async function refreshGithubSync() {
  try {
    githubState = await fetchGithubState();
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

function computeFingerprint() {
  if (!fs.existsSync(PROFILES_DIR)) return 'missing';

  const entries = fs.readdirSync(PROFILES_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => {
      const fullPath = path.join(PROFILES_DIR, file);
      const stat = fs.statSync(fullPath);
      return `${file}:${stat.size}:${stat.mtimeMs}`;
    })
    .join('|');

  return crypto.createHash('sha1').update(entries).digest('hex');
}

function buildState() {
  const generatedAt = new Date().toISOString();
  const fingerprint = computeFingerprint();
  const result = readAndValidateAll();
  const normalized = result.contributors
    .map((item) => ({
      name: String(item.name || '').trim(),
      github: String(item.github || '').trim(),
      role: String(item.role || 'Contributor').trim(),
      motto: String(item.motto || '').trim(),
      stack: Array.isArray(item.stack) ? item.stack.map((tag) => String(tag).trim()).filter(Boolean) : [],
      city: String(item.city || '').trim(),
      style: String(item.style || 'nature').trim(),
      avatar: String(item.avatar || '').trim(),
      homepage: String(item.homepage || '').trim(),
      file: item.file
    }))
    .filter((item) => item.name || item.github);

  const ok = result.errors.length === 0;
  if (ok) {
    lastGoodContributors = normalized;
  }

  return {
    ok,
    generatedAt,
    fingerprint,
    count: ok ? normalized.length : lastGoodContributors.length,
    contributors: ok ? normalized : lastGoodContributors,
    previewContributors: normalized,
    github: githubState,
    errors: result.errors,
    warnings: result.warnings,
    message: ok
      ? `已加载 ${normalized.length} 位贡献者`
      : `数据校验失败，页面暂时保留上一次有效结果`
  };
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
    const nextFingerprint = computeFingerprint();
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
      message: '服务读取数据失败，页面暂时保留上一次有效结果'
    };
    currentState = payload;
    broadcast('state', payload);
  }
}

lastFingerprint = computeFingerprint();

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
