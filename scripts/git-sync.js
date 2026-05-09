#!/usr/bin/env node

const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const TARGET_BRANCH = 'main';
const TARGET_REMOTE = 'origin';
const GIT_BUFFER_BYTES = 1024 * 1024;

async function runGit(args, cwd) {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: GIT_BUFFER_BYTES
  });
  return stdout.trim();
}

async function getCurrentBranch(cwd) {
  return runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
}

async function getWorkingTreeStatus(cwd) {
  return runGit(['status', '--porcelain'], cwd);
}

async function getCommitSha(cwd, ref) {
  return runGit(['rev-parse', ref], cwd);
}

async function countCommitsBetween(cwd, fromSha, toSha) {
  if (fromSha === toSha) return 0;
  const stdout = await runGit(['rev-list', '--count', `${fromSha}..${toSha}`], cwd);
  return Number(stdout) || 0;
}

/**
 * Pulls the local git working tree from `${remote}/${branch}` using fast-forward only.
 * Always returns a structured result; never throws so callers can show a toast either way.
 *
 * Skip conditions (left of side-effects):
 *   - not a git checkout / git CLI missing
 *   - HEAD is not on the target branch (don't auto-modify feature branches)
 *   - working tree is dirty (don't risk overwriting in-progress edits)
 *   - fetch failed (offline / auth issue)
 *   - local diverged from remote (refuse non-ff merges, surface to user)
 */
async function syncLocalGitRepo({ root, branch = TARGET_BRANCH, remote = TARGET_REMOTE } = {}) {
  if (!root) {
    return { ok: false, skipped: true, reason: 'syncLocalGitRepo 缺少 root 参数' };
  }

  let currentBranch;
  try {
    currentBranch = await getCurrentBranch(root);
  } catch (error) {
    return { ok: false, skipped: true, reason: `不在 git 仓库或 git 不可用: ${error.message}` };
  }

  if (currentBranch !== branch) {
    return {
      ok: false,
      skipped: true,
      reason: `当前在分支 ${currentBranch}，仅在 ${branch} 分支自动 pull`,
      branch: currentBranch
    };
  }

  let dirty;
  try {
    dirty = await getWorkingTreeStatus(root);
  } catch (error) {
    return { ok: false, skipped: true, reason: `读取 git status 失败: ${error.message}` };
  }

  if (dirty) {
    return {
      ok: false,
      skipped: true,
      reason: '本地有未提交修改，已跳过 git pull',
      branch: currentBranch
    };
  }

  let fromSha;
  try {
    fromSha = await getCommitSha(root, 'HEAD');
  } catch (error) {
    return { ok: false, skipped: true, reason: `读取 HEAD 失败: ${error.message}` };
  }

  try {
    await runGit(['fetch', remote, branch], root);
  } catch (error) {
    return {
      ok: false,
      skipped: true,
      reason: `git fetch 失败: ${error.message.split('\n')[0]}`,
      branch: currentBranch,
      fromSha
    };
  }

  let remoteSha;
  try {
    remoteSha = await getCommitSha(root, `${remote}/${branch}`);
  } catch (error) {
    return {
      ok: false,
      skipped: true,
      reason: `读取 ${remote}/${branch} 失败: ${error.message}`,
      branch: currentBranch,
      fromSha
    };
  }

  if (fromSha === remoteSha) {
    return {
      ok: true,
      skipped: false,
      pulled: 0,
      branch: currentBranch,
      fromSha,
      toSha: remoteSha,
      reason: '本地已与远端一致'
    };
  }

  const pulled = await countCommitsBetween(root, fromSha, remoteSha);

  try {
    await runGit(['merge', '--ff-only', `${remote}/${branch}`], root);
  } catch (error) {
    return {
      ok: false,
      skipped: true,
      reason: `本地与远端已分叉，无法 fast-forward，请手动合并`,
      branch: currentBranch,
      fromSha,
      toSha: remoteSha,
      detail: error.message.split('\n')[0]
    };
  }

  return {
    ok: true,
    skipped: false,
    pulled,
    branch: currentBranch,
    fromSha,
    toSha: remoteSha,
    reason: `已 fast-forward ${pulled} 个新提交`
  };
}

module.exports = {
  syncLocalGitRepo
};
