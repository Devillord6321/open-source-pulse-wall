#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  fetchGithubState,
  buildContributorState
} = require('./state-builder');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DIST_DIR = path.join(ROOT, 'dist');
const GITHUB_REPOSITORY = String(process.env.GITHUB_REPOSITORY || '').trim();
const GITHUB_TOKEN = String(process.env.GITHUB_TOKEN || '').trim();

function assertBuildConfig() {
  if (!GITHUB_REPOSITORY) {
    throw new Error('GITHUB_REPOSITORY is required for the static Pages build.');
  }
}

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
      continue;
    }

    if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function markStaticIndex() {
  const indexPath = path.join(DIST_DIR, 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  fs.writeFileSync(
    indexPath,
    html.replace(
      '<meta name="app-data-source" content="auto" />',
      '<meta name="app-data-source" content="static" />'
    )
  );
}

async function buildStaticSite() {
  assertBuildConfig();

  const githubState = await fetchGithubState({
    repository: GITHUB_REPOSITORY,
    token: GITHUB_TOKEN
  });
  const payload = buildContributorState({ githubState });

  if (!payload.ok) {
    throw new Error(`Contributor validation failed:\n${payload.errors.join('\n')}`);
  }

  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  copyDirectory(PUBLIC_DIR, DIST_DIR);
  markStaticIndex();
  fs.writeFileSync(
    path.join(DIST_DIR, 'contributors.json'),
    JSON.stringify({
      ...payload,
      delivery: 'github-pages'
    }, null, 2)
  );

  console.log(`Built GitHub Pages site for ${githubState.repository}`);
  console.log(`Output: ${DIST_DIR}`);
  console.log(`Profiles: ${payload.contributors.length}`);
}

buildStaticSite().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
