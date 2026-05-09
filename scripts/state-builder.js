#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { readAndValidateAll } = require('./validate-contributors');

const ROOT = path.resolve(__dirname, '..');
const PROFILES_DIR = path.join(ROOT, 'data', 'profiles');
const GITHUB_API_BASE = 'https://api.github.com';
const COMMIT_GRAPH_LIMIT = 40;
const ACTIVITY_FEED_LIMIT = 5;

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
    commits: [],
    message:
      '未解析到 GitHub 仓库：可设置环境变量 GITHUB_REPOSITORY，在 data/github-sync.json 填写 repository，' +
      '或在 package.json 声明 repository，或在本仓库的 git remote origin 指向 github.com'
  };
}

const REPO_OWNER_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function isValidOwnerRepo(value) {
  return Boolean(value && REPO_OWNER_NAME.test(value));
}

function parseGithubRemoteUrl(raw) {
  const input = String(raw || '').trim();
  if (!input) return '';

  const githubShorthand = /^github:\s*(.+)$/i.exec(input);
  if (githubShorthand) {
    const rest = githubShorthand[1].trim().replace(/^\/+/, '');
    return isValidOwnerRepo(rest) ? rest : '';
  }

  const sshMatch = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(input);
  if (sshMatch) {
    const candidate = `${sshMatch[1]}/${sshMatch[2]}`;
    return isValidOwnerRepo(candidate) ? candidate : '';
  }

  let urlString = input;
  if (/^git\+/i.test(urlString)) {
    urlString = urlString.replace(/^git\+/i, '');
  }

  try {
    const parsed = new URL(urlString);
    const host = parsed.hostname.toLowerCase();
    if (host !== 'github.com' && !host.endsWith('.github.com')) {
      return '';
    }
    const segments = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    if (segments.length < 2) return '';
    let repo = segments[1];
    if (repo.endsWith('.git')) repo = repo.slice(0, -4);
    const candidate = `${segments[0]}/${repo}`;
    return isValidOwnerRepo(candidate) ? candidate : '';
  } catch {
    return '';
  }
}

function readRepositoryFromGithubSyncFile(root) {
  const syncPath = path.join(root, 'data', 'github-sync.json');
  if (!fs.existsSync(syncPath)) return '';

  try {
    const data = JSON.parse(fs.readFileSync(syncPath, 'utf8'));
    const value = String(data.repository ?? '').trim();
    return isValidOwnerRepo(value) ? value : '';
  } catch {
    return '';
  }
}

function readRepositoryFromPackageJson(root) {
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) return '';

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const repo = pkg.repository;

    if (typeof repo === 'string') {
      const fromUrl = parseGithubRemoteUrl(repo);
      if (fromUrl) return fromUrl;
      const plain = repo.trim();
      return isValidOwnerRepo(plain) ? plain : '';
    }

    if (repo && typeof repo.url === 'string') {
      return parseGithubRemoteUrl(repo.url);
    }
  } catch {
    return '';
  }

  return '';
}

function findGitConfigPath(startDir) {
  let dir = path.resolve(startDir);

  for (let i = 0; i < 40; i += 1) {
    const gitMeta = path.join(dir, '.git');

    if (fs.existsSync(gitMeta)) {
      try {
        const stat = fs.statSync(gitMeta);

        if (stat.isDirectory()) {
          return path.join(gitMeta, 'config');
        }

        const text = fs.readFileSync(gitMeta, 'utf8');
        const line = text.split(/\r?\n/).find((entry) => entry.trim().length > 0) || '';
        const match = /^gitdir:\s+(.+)$/i.exec(line.trim());

        if (match) {
          const gitDir = path.resolve(dir, match[1].trim());
          return path.join(gitDir, 'config');
        }
      } catch {
        return null;
      }

      return null;
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }

    dir = parent;
  }

  return null;
}

function readRepositoryFromGitConfigFile(root) {
  const configPath = findGitConfigPath(root);

  if (!configPath || !fs.existsSync(configPath)) {
    return '';
  }

  try {
    const text = fs.readFileSync(configPath, 'utf8');
    const originBlock = /\[remote "origin"\][^\[]*/i.exec(text);

    if (!originBlock) {
      return '';
    }

    const urlLine = /^\s*url\s*=\s*(.+)$/m.exec(originBlock[0]);

    if (!urlLine) {
      return '';
    }

    return parseGithubRemoteUrl(urlLine[1].trim());
  } catch {
    return '';
  }
}

function readRepositoryFromGitOrigin(root) {
  try {
    const stdout = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    return parseGithubRemoteUrl(stdout.trim());
  } catch {
    return '';
  }
}

/**
 * Resolves owner/repo on every call (reads disk + git) so a pull can update config without restarting.
 * Precedence: GITHUB_REPOSITORY env → data/github-sync.json → package.json#repository → git remote origin → .git/config.
 */
function resolveGithubRepository(root) {
  const envRepo = String(process.env.GITHUB_REPOSITORY || '').trim();
  if (envRepo) return envRepo;

  const fromFile = readRepositoryFromGithubSyncFile(root);
  if (fromFile) return fromFile;

  const fromPackage = readRepositoryFromPackageJson(root);
  if (fromPackage) return fromPackage;

  const fromGitCli = readRepositoryFromGitOrigin(root);
  if (fromGitCli) return fromGitCli;

  return readRepositoryFromGitConfigFile(root);
}

function buildGithubHeaders(token = '') {
  const headers = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'open-source-pulse-wall',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function assertGithubRepository(value) {
  if (!value) {
    throw new Error(
      '需要可用的 GitHub 仓库 owner/repo（例如环境变量 GITHUB_REPOSITORY、data/github-sync.json、package.json 或 git origin）'
    );
  }

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    throw new Error('仓库标识必须使用 owner/repo 格式');
  }
}

async function fetchGithubJson(pathname, token = '') {
  const response = await fetch(`${GITHUB_API_BASE}${pathname}`, {
    headers: buildGithubHeaders(token)
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

function pickCommitAuthorLogin(commit) {
  return String(commit?.author?.login || commit?.commit?.author?.name || 'unknown');
}

function pickCommitMessageHeader(commit) {
  return String(commit?.commit?.message || 'Commit').split('\n')[0];
}

function normalizeCommitNode(commit) {
  return {
    sha: String(commit.sha || ''),
    shortSha: String(commit.sha || '').slice(0, 7),
    parents: Array.isArray(commit.parents)
      ? commit.parents.map((parent) => String(parent.sha || '')).filter(Boolean)
      : [],
    author: pickCommitAuthorLogin(commit),
    avatarUrl: String(commit?.author?.avatar_url || ''),
    profileUrl: String(commit?.author?.html_url || ''),
    message: pickCommitMessageHeader(commit),
    time: pickCommitTime(commit),
    htmlUrl: String(commit.html_url || '')
  };
}

function normalizeGithubEvent(node) {
  return {
    type: 'commit',
    time: node.time,
    message: `${node.author}: ${node.message}`
  };
}

async function fetchGithubState({ repository, token = '' }) {
  assertGithubRepository(repository);

  const encodedRepo = repository.split('/').map(encodeURIComponent).join('/');
  const [repo, contributors, commits] = await Promise.all([
    fetchGithubJson(`/repos/${encodedRepo}`, token),
    fetchGithubJson(`/repos/${encodedRepo}/contributors?per_page=100`, token),
    fetchGithubJson(`/repos/${encodedRepo}/commits?per_page=${COMMIT_GRAPH_LIMIT}`, token)
  ]);

  const commitNodes = Array.isArray(commits) ? commits.map(normalizeCommitNode) : [];
  const latestCommitAt = commitNodes.length ? commitNodes[0].time : '';

  return {
    configured: true,
    ok: true,
    repository: repo.full_name || repository,
    stars: Number(repo.stargazers_count || 0),
    contributorCount: Array.isArray(contributors) ? contributors.length : 0,
    cloneUrl: repo.clone_url || '',
    htmlUrl: repo.html_url || '',
    pushedAt: repo.pushed_at || '',
    latestCommitAt,
    events: commitNodes.slice(0, ACTIVITY_FEED_LIMIT).map(normalizeGithubEvent),
    commits: commitNodes,
    message: `已同步 GitHub 仓库 ${repo.full_name || repository}`
  };
}

function computeProfilesFingerprint() {
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

function normalizeContributors(contributors) {
  return contributors
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
}

function buildContributorState({ githubState = buildUnconfiguredGithubState(), fallbackContributors = [] } = {}) {
  const generatedAt = new Date().toISOString();
  const fingerprint = computeProfilesFingerprint();
  const result = readAndValidateAll();
  const normalized = normalizeContributors(result.contributors);
  const ok = result.errors.length === 0;
  const contributors = ok ? normalized : fallbackContributors;

  return {
    ok,
    generatedAt,
    fingerprint,
    count: contributors.length,
    contributors,
    previewContributors: normalized,
    github: githubState,
    errors: result.errors,
    warnings: result.warnings,
    message: ok
      ? `已加载 ${normalized.length} 位贡献者`
      : '数据校验失败，页面暂时保留上一次有效结果'
  };
}

module.exports = {
  buildUnconfiguredGithubState,
  fetchGithubState,
  computeProfilesFingerprint,
  buildContributorState,
  resolveGithubRepository
};
