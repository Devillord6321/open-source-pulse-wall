#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readAndValidateAll } = require('./validate-contributors');

const ROOT = path.resolve(__dirname, '..');
const PROFILES_DIR = path.join(ROOT, 'data', 'profiles');
const GITHUB_API_BASE = 'https://api.github.com';

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
    throw new Error('需要配置 GITHUB_REPOSITORY 才能与 GitHub 真实同步，例如 owner/repo');
  }

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    throw new Error('GITHUB_REPOSITORY 必须使用 owner/repo 格式');
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

function normalizeGithubEvent(commit) {
  const author = commit.author?.login || commit.commit?.author?.name || 'unknown';
  const message = String(commit.commit?.message || 'Commit').split('\n')[0];

  return {
    type: 'commit',
    time: pickCommitTime(commit),
    message: `${author}: ${message}`
  };
}

async function fetchGithubState({ repository, token = '' }) {
  assertGithubRepository(repository);

  const encodedRepo = repository.split('/').map(encodeURIComponent).join('/');
  const [repo, contributors, commits] = await Promise.all([
    fetchGithubJson(`/repos/${encodedRepo}`, token),
    fetchGithubJson(`/repos/${encodedRepo}/contributors?per_page=100`, token),
    fetchGithubJson(`/repos/${encodedRepo}/commits?per_page=5`, token)
  ]);

  const latestCommitAt = Array.isArray(commits) && commits.length ? pickCommitTime(commits[0]) : '';

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
    events: Array.isArray(commits) ? commits.map(normalizeGithubEvent) : [],
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
  buildContributorState
};
