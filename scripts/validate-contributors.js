#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PROFILES_DIR = path.join(ROOT, 'data', 'profiles');
const ALLOWED_STYLES = new Set(['minimal', 'nature', 'sketch', 'notebook', 'ink', 'sage']);
const ALLOWED_AVATARS = new Set(Array.from({ length: 10 }, (_, index) => {
  const number = String(index + 1).padStart(2, '0');
  return `avatars/avatar-${number}.png`;
}));

const CHEERS_MAX_PER_PROFILE = 50;
const CHEER_MESSAGE_MAX_LENGTH = 80;

function listProfileFiles() {
  if (!fs.existsSync(PROFILES_DIR)) {
    return [];
  }

  return fs.readdirSync(PROFILES_DIR)
    .filter((file) => file.endsWith('.json'))
    .filter((file) => !file.startsWith('_'))
    .sort();
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateGithubHandle(value) {
  if (typeof value !== 'string') return 'github 必须是字符串';
  const trimmed = value.trim();
  if (!trimmed) return 'github 不能为空';
  if (trimmed.length > 39) return 'github 不能超过 39 个字符';
  if (!/^[A-Za-z0-9-]+$/.test(trimmed)) return 'github 只能包含字母、数字和连字符';
  if (trimmed.startsWith('-') || trimmed.endsWith('-')) return 'github 不能以连字符开头或结尾';
  if (trimmed.includes('--')) return 'github 不能包含连续连字符';
  return null;
}

function isHttpUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return true;

  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function requiredString(profile, key, label, errors, filename, maxLength = 80) {
  const value = profile[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${filename}: ${label} 必须填写`);
    return;
  }

  if (value.trim().length > maxLength) {
    errors.push(`${filename}: ${label} 过长，最多 ${maxLength} 个字符`);
  }
}

function validateCheers(profile, filename, errors) {
  if (profile.cheers === undefined) return;

  if (!Array.isArray(profile.cheers)) {
    errors.push(`${filename}: cheers 必须是数组，例如 [{ "from": "octocat", "message": "加油!" }]`);
    return;
  }

  if (profile.cheers.length > CHEERS_MAX_PER_PROFILE) {
    errors.push(`${filename}: cheers 最多 ${CHEERS_MAX_PER_PROFILE} 条，请合并或删减`);
  }

  const owner = String(profile.github || '').trim().toLowerCase();
  const seen = new Set();

  profile.cheers.forEach((entry, index) => {
    const label = `cheers[${index}]`;

    if (!isPlainObject(entry)) {
      errors.push(`${filename}: ${label} 必须是对象 { from, message }`);
      return;
    }

    const fromProblem = validateGithubHandle(entry.from);
    if (fromProblem) {
      errors.push(`${filename}: ${label}.from ${fromProblem}`);
    }

    const fromHandle = String(entry.from || '').trim().toLowerCase();
    if (owner && fromHandle && fromHandle === owner) {
      errors.push(`${filename}: ${label}.from 不能是 profile 主人自己（请让别的同学给你加油）`);
    }

    if (typeof entry.message !== 'string' || entry.message.trim().length === 0) {
      errors.push(`${filename}: ${label}.message 必须填写`);
    } else if (entry.message.trim().length > CHEER_MESSAGE_MAX_LENGTH) {
      errors.push(`${filename}: ${label}.message 过长，最多 ${CHEER_MESSAGE_MAX_LENGTH} 个字符`);
    }

    if (entry.ts !== undefined) {
      if (typeof entry.ts !== 'string' || Number.isNaN(Date.parse(entry.ts))) {
        errors.push(`${filename}: ${label}.ts 必须是 ISO 时间字符串，例如 2026-05-09`);
      }
    }

    const dedupeKey = `${fromHandle}|${String(entry.message || '').trim()}`;
    if (fromHandle && seen.has(dedupeKey)) {
      errors.push(`${filename}: ${label} 与之前同一作者的同样内容重复，请合并`);
    } else if (fromHandle) {
      seen.add(dedupeKey);
    }
  });
}

function validateProfile(profile, filename) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(profile)) {
    return { errors: [`${filename}: 文件内容必须是一个 JSON 对象`], warnings };
  }

  requiredString(profile, 'name', 'name', errors, filename, 40);
  requiredString(profile, 'github', 'github', errors, filename, 39);
  requiredString(profile, 'role', 'role', errors, filename, 50);
  requiredString(profile, 'motto', 'motto', errors, filename, 120);

  const githubProblem = validateGithubHandle(profile.github);
  if (githubProblem) {
    errors.push(`${filename}: ${githubProblem}`);
  }

  if (!Array.isArray(profile.stack) || profile.stack.length === 0) {
    errors.push(`${filename}: stack 必须是非空数组，例如 ["Git", "Open Source"]`);
  } else {
    if (profile.stack.length > 5) {
      errors.push(`${filename}: stack 最多填写 5 项`);
    }

    profile.stack.forEach((item, index) => {
      if (typeof item !== 'string' || item.trim().length === 0) {
        errors.push(`${filename}: stack 第 ${index + 1} 项必须是非空字符串`);
      }
      if (typeof item === 'string' && item.trim().length > 24) {
        errors.push(`${filename}: stack 第 ${index + 1} 项过长，最多 24 个字符`);
      }
    });
  }

  if (profile.style !== undefined && !ALLOWED_STYLES.has(profile.style)) {
    errors.push(`${filename}: style 只能是 ${Array.from(ALLOWED_STYLES).join(', ')} 中的一个`);
  }

  if (profile.city !== undefined && (typeof profile.city !== 'string' || profile.city.trim().length > 40)) {
    errors.push(`${filename}: city 必须是 40 个字符以内的字符串`);
  }

  if (profile.avatar !== undefined && !ALLOWED_AVATARS.has(profile.avatar)) {
    errors.push(`${filename}: avatar 只能使用 ${Array.from(ALLOWED_AVATARS).join(', ')} 中的一个`);
  }

  if (profile.homepage !== undefined) {
    if (typeof profile.homepage !== 'string') {
      errors.push(`${filename}: homepage 必须是字符串`);
    } else if (!isHttpUrl(profile.homepage)) {
      errors.push(`${filename}: homepage 必须是 http:// 或 https:// 开头的有效 URL`);
    }
  }

  validateCheers(profile, filename, errors);

  const expectedName = `${String(profile.github || '').trim().toLowerCase()}.json`;
  if (profile.github && filename.toLowerCase() !== expectedName) {
    warnings.push(`${filename}: 建议文件名改成 ${expectedName}，这样维护者更容易定位贡献者`);
  }

  return { errors, warnings };
}

function readAndValidateAll() {
  const files = listProfileFiles();
  const errors = [];
  const warnings = [];
  const contributors = [];
  const seenGithub = new Map();

  for (const file of files) {
    const filePath = path.join(PROFILES_DIR, file);
    let profile;

    try {
      profile = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      errors.push(`${file}: JSON 解析失败，${error.message}`);
      continue;
    }

    const result = validateProfile(profile, file);
    errors.push(...result.errors);
    warnings.push(...result.warnings);

    if (profile && profile.github) {
      const key = String(profile.github).trim().toLowerCase();
      if (seenGithub.has(key)) {
        errors.push(`${file}: github ${profile.github} 已经在 ${seenGithub.get(key)} 中出现过`);
      } else {
        seenGithub.set(key, file);
      }
    }

    contributors.push({ ...profile, file });
  }

  if (contributors.length === 0) {
    warnings.push('当前还没有贡献者文件。课堂上每位同学可以从 data/profiles/_template.json 复制一份。');
  }

  return { contributors, errors, warnings };
}

if (require.main === module) {
  const { contributors, errors, warnings } = readAndValidateAll();

  console.log(`\nOpen Source Pulse Wall validation`);
  console.log(`Profiles: ${contributors.length}`);

  if (warnings.length) {
    console.log('\nWarnings:');
    warnings.forEach((warning) => console.log(`  • ${warning}`));
  }

  if (errors.length) {
    console.log('\nErrors:');
    errors.forEach((error) => console.log(`  ✗ ${error}`));
    console.log('\nValidation failed. Fix the profile file and run npm run validate again.\n');
    process.exit(1);
  }

  console.log('\nValidation passed. Ready to open a Pull Request.\n');
}

module.exports = {
  readAndValidateAll,
  validateProfile,
  validateGithubHandle,
  isHttpUrl,
  ALLOWED_STYLES,
  ALLOWED_AVATARS,
  CHEERS_MAX_PER_PROFILE,
  CHEER_MESSAGE_MAX_LENGTH
};
