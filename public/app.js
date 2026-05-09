const MAX_FEED_ITEMS = 30;
const VISIBLE_FEED_ITEMS = 5;
const WALL_PREVIEW_LIMIT = 10;
const WALL_PAGE_SIZE = 20;

const GRAPH_ROW_HEIGHT = 56;
const GRAPH_LANE_WIDTH = 22;
const GRAPH_NODE_RADIUS = 6;
const GRAPH_PADDING_TOP = 16;
const GRAPH_PADDING_LEFT = 18;
const GRAPH_PALETTE = ['#3b6064', '#a36a3b', '#5b8a3a', '#8a3b6a', '#3b6a8a', '#6a8a3b', '#8a5b3b'];
const REFRESH_LABEL_DEFAULT = '立即拉取';

const state = {
  knownHandles: new Set(),
  knownGithubEvents: new Set(),
  feed: [],
  lastOk: null,
  fallbackTimer: null,
  dataMode: '',
  activityReturnFocus: null,
  wallContributors: [],
  wallExpanded: false,
  wallVisibleCount: WALL_PREVIEW_LIMIT,
  refreshing: false,
  refreshCooldownTimer: null,
  knownCommitShas: new Set(),
  bootstrappedHistory: false
};

const AVATARS = Array.from({ length: 10 }, (_, index) => {
  const number = String(index + 1).padStart(2, '0');
  return `avatars/avatar-${number}.png`;
});

const styles = ['minimal', 'nature', 'sketch', 'notebook', 'ink', 'sage'];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const elements = {
  connectionDot: $('#connectionDot'),
  connectionText: $('#connectionText'),
  syncNote: $('#syncNote'),
  starCount: $('#starCount'),
  statCount: $('#statCount'),
  statCountNote: $('#statCountNote'),
  statValidation: $('#statValidation'),
  statStacks: $('#statStacks'),
  statPulse: $('#statPulse'),
  validationBox: $('#validationBox'),
  liveFeed: $('#liveFeed'),
  wall: $('#contributorsWall'),
  toast: $('#toast'),
  profilePreview: $('#profilePreview'),
  jsonPreview: $('#jsonPreview'),
  copyJson: $('#copyJson'),
  copyFilename: $('#copyFilename'),
  copyCloneCommand: $('#copyCloneCommand'),
  terminalCommands: $('#terminalCommands'),
  avatarPicker: $('#avatarPicker'),
  viewAllFeed: $('#viewAllFeed'),
  activityOverlay: $('#activityOverlay'),
  activityPanel: $('#activityPanel'),
  activityList: $('#activityList'),
  activityCount: $('#activityCount'),
  closeActivity: $('#closeActivity'),
  wallSummary: $('#wallSummary'),
  toggleWallMode: $('#toggleWallMode'),
  wallControls: $('#wallControls'),
  wallSearch: $('#wallSearch'),
  wallFilterStatus: $('#wallFilterStatus'),
  clearWallSearch: $('#clearWallSearch'),
  loadMoreWall: $('#loadMoreWall'),
  gitGraph: $('#gitGraph'),
  historySummary: $('#historySummary'),
  historyCount: $('#historyCount'),
  refreshHistory: $('#refreshHistory'),
  refreshHistoryLabel: $('#refreshHistoryLabel'),
  openHistoryRepo: $('#openHistoryRepo')
};

const formFields = {
  name: $('#inputName'),
  github: $('#inputGithub'),
  role: $('#inputRole'),
  motto: $('#inputMotto'),
  stack: $('#inputStack'),
  city: $('#inputCity')
};

function htmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatTime(iso) {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return '刚刚';

  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatRelativeTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;

  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function toast(message) {
  if (!elements.toast) return;
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => elements.toast.classList.remove('show'), 2100);
}

function feedMarkup(items) {
  return items
    .map((item) => `<li><time>${formatTime(item.time)}</time><span>${htmlEscape(item.message)}</span></li>`)
    .join('');
}

function renderFeed() {
  if (elements.liveFeed) {
    elements.liveFeed.innerHTML = feedMarkup(state.feed.slice(0, VISIBLE_FEED_ITEMS));
  }

  if (elements.activityList) {
    elements.activityList.classList.toggle('is-empty', !state.feed.length);
    elements.activityList.innerHTML = state.feed.length
      ? feedMarkup(state.feed)
      : '<li class="empty-activity"><span>暂无活动记录</span></li>';
  }

  if (elements.activityCount) {
    elements.activityCount.textContent = state.feed.length
      ? `已记录 ${state.feed.length} 条课堂活动`
      : '等待活动记录';
  }
}

function addFeed(message, time = new Date().toISOString()) {
  state.feed.unshift({ message, time });
  state.feed = state.feed.slice(0, MAX_FEED_ITEMS);
  renderFeed();
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
  return Number(value).toLocaleString('zh-CN');
}

function setConnection(status, text) {
  if (!elements.connectionDot || !elements.connectionText) return;

  elements.connectionDot.classList.remove('online', 'offline');
  if (status) elements.connectionDot.classList.add(status);
  elements.connectionText.textContent = text;
}

function updateCloneCommand(github) {
  if (!elements.terminalCommands) return;

  const cloneUrl = github?.cloneUrl || '<GitHub 仓库地址>';
  elements.terminalCommands.textContent = `# 1. Fork 本仓库
git clone ${cloneUrl}

# 2. 创建你的分支
git checkout -b feat/your-name

# 3. 添加你的个人信息
cp data/profiles/_template.json data/profiles/your-github-id.json
# 编辑该 JSON；也可用本页上方表单生成内容后写入同名文件
npm run validate

# 4. 提交并推送
git add .
git commit -m "feat: add my profile"
git push origin feat/your-name

# 5. 创建 Pull Request
# 到 main 分支，等待 Review & Merge`;
}

function updateGithubSync(github) {
  const isSynced = Boolean(github?.ok);

  if (elements.starCount) {
    elements.starCount.textContent = isSynced ? formatNumber(github.stars) : '--';
  }

  if (elements.syncNote) {
    elements.syncNote.textContent = isSynced
      ? `与 GitHub ${github.repository} 同步正常`
      : (github?.message || '等待 GitHub 同步配置');
  }

  updateCloneCommand(github);
}

function githubProfileUrl(github) {
  return `https://github.com/${encodeURIComponent(github || '')}`;
}

function avatarForProfile(profile) {
  const explicitAvatar = String(profile.avatar || '').trim();
  if (AVATARS.includes(explicitAvatar)) return explicitAvatar;

  const seed = String(profile.github || profile.name || '').trim();
  if (!seed) return AVATARS[0];

  const sum = Array.from(seed).reduce((total, character) => total + character.charCodeAt(0), 0);
  return AVATARS[sum % AVATARS.length];
}

function landscapeMarkup() {
  return `
    <svg class="profile-landscape" viewBox="0 0 220 70" aria-hidden="true">
      <path d="M6 60 C34 40 48 42 72 26 C91 13 110 24 124 42 C142 28 156 18 177 30 C188 36 198 47 214 50" />
      <path d="M20 60 L20 45 M16 49 L20 42 L24 49 M32 60 L32 42 M27 48 L32 36 L37 48" />
      <path d="M168 60 L168 44 M163 50 L168 38 L173 50 M184 60 L184 47 M179 52 L184 42 L189 52" />
      <path d="M0 61 H220" />
    </svg>
  `;
}

function cardMarkup(profile, options = {}) {
  const style = styles.includes(profile.style) ? profile.style : 'nature';
  const name = htmlEscape(profile.name || 'Anonymous');
  const github = htmlEscape(profile.github || 'unknown');
  const role = htmlEscape(profile.role || '开源贡献者');
  const motto = htmlEscape(profile.motto || '今天完成我的第一个开源 PR');
  const city = htmlEscape(profile.city || '教室');
  const stack = Array.isArray(profile.stack) ? profile.stack : [];
  const tags = stack.length
    ? stack.map((tag) => `<span>${htmlEscape(tag)}</span>`).join('')
    : '<span>Git</span><span>Open Source</span>';
  const file = htmlEscape(profile.file || `${String(profile.github || 'your-github-id').toLowerCase()}.json`);
  const homepage = profile.homepage || (profile.github ? githubProfileUrl(profile.github) : '');
  const footerLink = homepage
    ? `<a href="${htmlEscape(homepage)}" target="_blank" rel="noreferrer">GitHub</a>`
    : '<span>GitHub</span>';
  const avatar = htmlEscape(avatarForProfile(profile));

  return `
    <article class="profile-card ${options.preview ? 'is-preview' : ''}" data-style="${htmlEscape(style)}">
      <div class="profile-top">
        <img class="avatar-image" src="${avatar}" alt="${name} 的头像" loading="lazy" />
        <div class="identity">
          <h3>${name}</h3>
          <a class="handle" href="${githubProfileUrl(profile.github || '')}" target="_blank" rel="noreferrer">@${github}</a>
        </div>
      </div>
      <div class="role">${role}</div>
      <p class="motto">${motto}</p>
      <div class="location-row">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-5.3 7-12a7 7 0 1 0-14 0c0 6.7 7 12 7 12Z" /><circle cx="12" cy="9" r="2.5" /></svg>
        <span>${city}</span>
      </div>
      <div class="profile-tags">${tags}</div>
      ${options.preview ? landscapeMarkup() : ''}
      <div class="profile-footer">
        <span>${file}</span>
        ${footerLink}
      </div>
    </article>
  `;
}

function updateStats(payload) {
  const contributors = payload.contributors || [];
  const github = payload.github || {};
  const contributorCount = contributors.length;
  const stackSet = new Set();
  contributors.forEach((person) => {
    (person.stack || []).forEach((tag) => stackSet.add(String(tag).trim().toLowerCase()));
  });

  if (elements.statCount) elements.statCount.textContent = contributorCount;
  if (elements.statCountNote) {
    elements.statCountNote.textContent = github.ok ? 'profile JSON 数量' : '本地 profile 数量';
  }
  if (elements.statValidation) elements.statValidation.textContent = payload.ok ? '100%' : '待修复';
  if (elements.statStacks) elements.statStacks.textContent = `${stackSet.size} 个技术标签`;
  if (elements.statPulse) elements.statPulse.textContent = formatTime(github.latestCommitAt || github.pushedAt || payload.generatedAt);
}

function updateValidation(payload) {
  const box = elements.validationBox;
  if (!box) return;

  box.classList.toggle('success', Boolean(payload.ok));
  box.classList.toggle('error', !payload.ok);

  if (payload.ok) {
    box.innerHTML = `
      <strong>校验通过。</strong>
      <p>${htmlEscape(payload.message || '所有贡献者文件格式正确。')}</p>
    `;
    box.classList.remove('show');
    return;
  }

  const errors = payload.errors || [];
  box.innerHTML = `
    <strong>校验失败。</strong>
    <p>修复下列问题后，页面会自动恢复到最新数据。</p>
    <ul>${errors.map((item) => `<li>${htmlEscape(item)}</li>`).join('')}</ul>
  `;
  box.classList.add('show');
}

function sortContributors(contributors) {
  return contributors
    .slice()
    .sort((a, b) => String(a.github || a.name).localeCompare(String(b.github || b.name)));
}

function wallSearchText(profile) {
  return [
    profile.name,
    profile.github,
    profile.role,
    profile.motto,
    profile.city,
    profile.file,
    ...(Array.isArray(profile.stack) ? profile.stack : [])
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');
}

function currentWallQuery() {
  return String(elements.wallSearch?.value || '').trim().toLowerCase();
}

function filteredWallContributors() {
  const query = currentWallQuery();
  if (!query) return state.wallContributors;

  return state.wallContributors.filter((profile) => wallSearchText(profile).includes(query));
}

function updateWallMeta({ total, filtered, visible, query }) {
  if (elements.wallSummary) {
    if (!total) {
      elements.wallSummary.textContent = '等待同学提交 profile';
    } else if (state.wallExpanded && query) {
      elements.wallSummary.textContent = `筛选出 ${filtered} / ${total} 位贡献者`;
    } else if (state.wallExpanded) {
      elements.wallSummary.textContent = `完整列表 ${visible} / ${total} 位贡献者`;
    } else {
      elements.wallSummary.textContent = total > WALL_PREVIEW_LIMIT
        ? `预览展示 ${Math.min(WALL_PREVIEW_LIMIT, total)} / ${total} 位贡献者`
        : `展示全部 ${total} 位贡献者`;
    }
  }

  if (elements.wallFilterStatus) {
    elements.wallFilterStatus.textContent = query
      ? `匹配 ${filtered} 位贡献者`
      : `共 ${total} 位贡献者`;
  }

  if (elements.toggleWallMode) {
    elements.toggleWallMode.textContent = state.wallExpanded ? '收起列表' : '全部贡献者';
    elements.toggleWallMode.setAttribute('aria-expanded', String(state.wallExpanded));
  }

  if (elements.wallControls) {
    elements.wallControls.hidden = !state.wallExpanded;
  }

  if (elements.clearWallSearch) {
    elements.clearWallSearch.hidden = !query;
  }

  if (elements.loadMoreWall) {
    const remaining = filtered - visible;
    elements.loadMoreWall.hidden = !state.wallExpanded || remaining <= 0;
    elements.loadMoreWall.textContent = remaining > 0
      ? `加载更多 ${Math.min(WALL_PAGE_SIZE, remaining)} 位`
      : '已显示全部';
  }
}

function renderWall() {
  if (!elements.wall) return;

  const total = state.wallContributors.length;
  const query = currentWallQuery();
  const filtered = filteredWallContributors();
  const limit = state.wallExpanded ? state.wallVisibleCount : WALL_PREVIEW_LIMIT;
  const visible = filtered.slice(0, Math.min(limit, filtered.length));

  updateWallMeta({
    total,
    filtered: filtered.length,
    visible: visible.length,
    query
  });

  if (!total) {
    elements.wall.innerHTML = '<div class="empty-wall">还没有贡献者。复制模板，创建你的 profile 文件，然后运行 npm run validate。</div>';
    return;
  }

  if (!visible.length) {
    elements.wall.innerHTML = '<div class="empty-wall">没有匹配的贡献者。换一个关键词试试。</div>';
    return;
  }

  elements.wall.innerHTML = visible
    .map((profile) => cardMarkup(profile))
    .join('');
}

function updateWall(payload) {
  if (!elements.wall) return;

  state.wallContributors = sortContributors(payload.contributors || []);
  if (!state.wallExpanded) state.wallVisibleCount = WALL_PREVIEW_LIMIT;
  renderWall();
}

function detectNewContributors(payload) {
  const incoming = new Set((payload.contributors || []).map((person) => String(person.github || person.name).toLowerCase()));
  const newHandles = [];

  for (const handle of incoming) {
    if (handle && !state.knownHandles.has(handle)) {
      newHandles.push(handle);
    }
  }

  state.knownHandles = incoming;

  if (newHandles.length && state.lastOk !== null) {
    addFeed(`新增 ${newHandles.length} 位贡献者: ${newHandles.join(', ')}`, payload.generatedAt);
  }
}

function syncGithubEvents(payload) {
  const events = payload.github?.events || [];
  events.slice().reverse().forEach((event) => {
    const key = `${event.type}:${event.time}:${event.message}`;
    if (state.knownGithubEvents.has(key)) return;
    state.knownGithubEvents.add(key);
    addFeed(event.message, event.time || payload.generatedAt);
  });
}

function computeGitGraph(commits) {
  const lanes = [];
  let maxLanes = 0;
  const indexBySha = new Map();
  commits.forEach((commit, index) => indexBySha.set(commit.sha, index));

  function claimLane(sha, preferLane) {
    if (preferLane !== undefined && preferLane >= 0 && (lanes[preferLane] === null || lanes[preferLane] === undefined)) {
      lanes[preferLane] = sha;
      return preferLane;
    }
    let slot = lanes.findIndex((value) => value === null || value === undefined);
    if (slot === -1) {
      slot = lanes.length;
      lanes.push(sha);
    } else {
      lanes[slot] = sha;
    }
    return slot;
  }

  const rows = commits.map((commit) => {
    let currentLane = lanes.findIndex((value) => value === commit.sha);
    if (currentLane === -1) {
      currentLane = claimLane(commit.sha);
    }

    lanes[currentLane] = null;

    const parentLinks = [];
    commit.parents.forEach((parentSha, parentOrder) => {
      const parentInWindow = indexBySha.has(parentSha);
      if (!parentInWindow) {
        parentLinks.push({ sha: parentSha, lane: -1, parentRow: -1, outOfWindow: true });
        return;
      }

      let parentLane = lanes.findIndex((value) => value === parentSha);
      if (parentLane === -1) {
        parentLane = claimLane(parentSha, parentOrder === 0 ? currentLane : -1);
      }

      parentLinks.push({
        sha: parentSha,
        lane: parentLane,
        parentRow: indexBySha.get(parentSha),
        outOfWindow: false
      });
    });

    while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
      lanes.pop();
    }

    maxLanes = Math.max(
      maxLanes,
      currentLane + 1,
      lanes.length,
      ...parentLinks.map((link) => link.lane + 1)
    );

    return { lane: currentLane, parentLinks };
  });

  return { rows, maxLanes };
}

function laneCenterX(lane) {
  return GRAPH_PADDING_LEFT + lane * GRAPH_LANE_WIDTH + GRAPH_NODE_RADIUS;
}

function rowCenterY(rowIndex) {
  return GRAPH_PADDING_TOP + rowIndex * GRAPH_ROW_HEIGHT + GRAPH_ROW_HEIGHT / 2;
}

function laneColor(lane) {
  return GRAPH_PALETTE[lane % GRAPH_PALETTE.length];
}

function gitGraphSvg(rows, commits, maxLanes) {
  const width = GRAPH_PADDING_LEFT * 2 + Math.max(maxLanes, 1) * GRAPH_LANE_WIDTH;
  const height = GRAPH_PADDING_TOP * 2 + commits.length * GRAPH_ROW_HEIGHT;
  const connectors = [];
  const nodes = [];

  rows.forEach((row, rowIndex) => {
    const x = laneCenterX(row.lane);
    const y = rowCenterY(rowIndex);
    const commit = commits[rowIndex];

    row.parentLinks.forEach((link) => {
      const color = laneColor(link.outOfWindow ? row.lane : link.lane);

      if (link.outOfWindow) {
        const tailY = height - GRAPH_PADDING_TOP / 2;
        connectors.push(
          `<path class="graph-line graph-line-fade" stroke="${color}" d="M ${x} ${y} L ${x} ${tailY}" />`
        );
        return;
      }

      const px = laneCenterX(link.lane);
      const py = rowCenterY(link.parentRow);

      if (px === x) {
        connectors.push(
          `<path class="graph-line" stroke="${color}" d="M ${x} ${y} L ${px} ${py}" />`
        );
        return;
      }

      const bendY = y + GRAPH_ROW_HEIGHT * 0.55;
      connectors.push(
        `<path class="graph-line" stroke="${color}" d="M ${x} ${y} C ${x} ${bendY}, ${px} ${bendY}, ${px} ${py}" />`
      );
    });

    const color = laneColor(row.lane);
    const isMerge = commit.parents.length > 1;
    if (isMerge) {
      const size = GRAPH_NODE_RADIUS + 1.4;
      nodes.push(
        `<rect class="graph-node graph-node-merge" stroke="${color}" x="${x - size}" y="${y - size}" width="${size * 2}" height="${size * 2}" transform="rotate(45 ${x} ${y})" />`
      );
    } else {
      nodes.push(
        `<circle class="graph-node" stroke="${color}" cx="${x}" cy="${y}" r="${GRAPH_NODE_RADIUS}" />`
      );
    }
  });

  return `
    <svg class="git-graph-canvas" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Git 提交图">
      ${connectors.join('')}
      ${nodes.join('')}
    </svg>
  `;
}

function commitListMarkup(rows, commits) {
  return commits
    .map((commit, rowIndex) => {
      const top = GRAPH_PADDING_TOP + rowIndex * GRAPH_ROW_HEIGHT;
      const isMerge = commit.parents.length > 1;
      const message = htmlEscape(commit.message || '(no commit message)');
      const author = htmlEscape(commit.author || 'unknown');
      const shortSha = htmlEscape(commit.shortSha || commit.sha.slice(0, 7));
      const relative = htmlEscape(formatRelativeTime(commit.time) || '未知时间');
      const exact = htmlEscape(commit.time || '');
      const avatarMarkup = commit.avatarUrl
        ? `<img src="${htmlEscape(commit.avatarUrl)}" alt="" loading="lazy" />`
        : `<span class="avatar-fallback">${htmlEscape((commit.author || '?').slice(0, 1).toUpperCase())}</span>`;
      const link = commit.htmlUrl || '#';
      const target = commit.htmlUrl ? ' target="_blank" rel="noreferrer"' : '';
      const tag = isMerge ? '<span class="commit-tag">merge</span>' : '';

      return `
        <li class="git-commit-row" style="top: ${top}px; height: ${GRAPH_ROW_HEIGHT}px">
          <a class="git-commit-link" href="${htmlEscape(link)}"${target}>
            <span class="git-commit-avatar">${avatarMarkup}</span>
            <span class="git-commit-body">
              <span class="git-commit-message">${message}${tag}</span>
              <span class="git-commit-meta">
                <span class="commit-author">${author}</span>
                <span class="commit-sep">·</span>
                <time datetime="${exact}">${relative}</time>
                <span class="commit-sep">·</span>
                <span class="commit-sha">${shortSha}</span>
              </span>
            </span>
          </a>
        </li>
      `;
    })
    .join('');
}

function updateHistorySection(payload) {
  if (!elements.gitGraph) return;

  const github = payload.github || {};
  const commits = Array.isArray(github.commits) ? github.commits : [];

  if (elements.openHistoryRepo) {
    if (github.htmlUrl) {
      elements.openHistoryRepo.hidden = false;
      elements.openHistoryRepo.href = `${github.htmlUrl}/commits`;
    } else {
      elements.openHistoryRepo.hidden = true;
    }
  }

  if (elements.refreshHistory) {
    elements.refreshHistory.hidden = state.dataMode === 'static';
  }

  if (!github.configured) {
    elements.gitGraph.innerHTML = '<div class="git-graph-empty">尚未连接 GitHub。配置后会显示提交图。</div>';
    if (elements.historySummary) elements.historySummary.textContent = github.message || '等待 GitHub 同步配置';
    if (elements.historyCount) elements.historyCount.textContent = '--';
    return;
  }

  if (!commits.length) {
    elements.gitGraph.innerHTML = '<div class="git-graph-empty">还没有可展示的提交。</div>';
    if (elements.historySummary) {
      elements.historySummary.textContent = github.ok
        ? `已同步 ${github.repository}，但暂无提交记录`
        : (github.message || 'GitHub 同步失败');
    }
    if (elements.historyCount) elements.historyCount.textContent = '0';
    return;
  }

  const { rows, maxLanes } = computeGitGraph(commits);
  const totalHeight = GRAPH_PADDING_TOP * 2 + commits.length * GRAPH_ROW_HEIGHT;

  elements.gitGraph.innerHTML = `
    ${gitGraphSvg(rows, commits, maxLanes)}
    <ol class="git-commit-list" style="height: ${totalHeight}px">
      ${commitListMarkup(rows, commits)}
    </ol>
  `;

  if (elements.historySummary) {
    elements.historySummary.textContent = github.ok
      ? `${github.repository} · 最新 ${formatRelativeTime(github.latestCommitAt) || '刚刚'}`
      : (github.message || 'GitHub 同步失败');
  }
  if (elements.historyCount) elements.historyCount.textContent = String(commits.length);

  detectNewCommits(commits, payload.generatedAt);
}

function detectNewCommits(commits, generatedAt) {
  if (!state.bootstrappedHistory) {
    state.knownCommitShas = new Set(commits.map((commit) => commit.sha));
    state.bootstrappedHistory = true;
    return;
  }

  const fresh = commits.filter((commit) => commit.sha && !state.knownCommitShas.has(commit.sha));
  fresh.forEach((commit) => state.knownCommitShas.add(commit.sha));

  if (fresh.length) {
    const summary = fresh.length === 1
      ? `新增提交 ${fresh[0].author}: ${fresh[0].message}`
      : `新增 ${fresh.length} 个提交`;
    addFeed(summary, generatedAt);
  }
}

function setRefreshButtonState(label, disabled) {
  if (!elements.refreshHistory) return;
  elements.refreshHistory.disabled = disabled;
  elements.refreshHistory.classList.toggle('is-busy', disabled);
  if (elements.refreshHistoryLabel) elements.refreshHistoryLabel.textContent = label;
}

function startRefreshCooldown(seconds) {
  if (state.refreshCooldownTimer) {
    window.clearInterval(state.refreshCooldownTimer);
    state.refreshCooldownTimer = null;
  }

  let remaining = Math.max(1, Math.floor(seconds));
  setRefreshButtonState(`${remaining}s 后可再拉取`, true);
  state.refreshCooldownTimer = window.setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      window.clearInterval(state.refreshCooldownTimer);
      state.refreshCooldownTimer = null;
      setRefreshButtonState(REFRESH_LABEL_DEFAULT, false);
      return;
    }
    setRefreshButtonState(`${remaining}s 后可再拉取`, true);
  }, 1000);
}

async function manuallyRefreshHistory() {
  if (state.refreshing || state.dataMode === 'static') return;

  state.refreshing = true;
  setRefreshButtonState('正在拉取…', true);

  try {
    const response = await fetch('api/refresh', {
      method: 'POST',
      headers: { 'Accept': 'application/json' }
    });

    if (response.status === 429) {
      const data = await response.json().catch(() => ({}));
      const retrySeconds = Math.max(1, Math.ceil((data.retryInMs || 5000) / 1000));
      startRefreshCooldown(retrySeconds);
      toast(data.message || '刷新太频繁，稍后再试');
      return;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    toast(data.message || '已从 GitHub 拉取最新数据');
    setRefreshButtonState(REFRESH_LABEL_DEFAULT, false);
  } catch (error) {
    toast(`拉取失败: ${error.message || '未知错误'}`);
    setRefreshButtonState(REFRESH_LABEL_DEFAULT, false);
  } finally {
    state.refreshing = false;
  }
}

function bindHistoryControls() {
  if (elements.refreshHistory) {
    elements.refreshHistory.addEventListener('click', manuallyRefreshHistory);
  }
}

function applyState(payload) {
  updateGithubSync(payload.github);
  updateStats(payload);
  updateValidation(payload);
  updateWall(payload);
  updateHistorySection(payload);
  syncGithubEvents(payload);
  detectNewContributors(payload);

  if (state.lastOk !== payload.ok) {
    addFeed(payload.ok ? '数据恢复正常，贡献者墙已刷新' : '数据校验失败，等待修复', payload.generatedAt);
  } else {
    addFeed(payload.message || '收到一次数据刷新', payload.generatedAt);
  }

  state.lastOk = payload.ok;
}

function dataSourceMode() {
  return document.querySelector('meta[name="app-data-source"]')?.getAttribute('content') || 'auto';
}

async function fetchState() {
  const endpoints = dataSourceMode() === 'static' ? [
    { url: 'contributors.json', mode: 'static' }
  ] : [
    { url: 'api/contributors', mode: 'api' },
    { url: 'contributors.json', mode: 'static' }
  ];
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint.url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`${endpoint.url} HTTP ${response.status}`);
      state.dataMode = endpoint.mode;
      return response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('No contributor data source is available');
}

function startFallbackPolling() {
  if (state.dataMode === 'static') return;
  if (state.fallbackTimer) return;
  state.fallbackTimer = window.setInterval(async () => {
    try {
      const payload = await fetchState();
      applyState(payload);
    } catch {
      setConnection('offline', '实时通道断开，轮询也失败');
    }
  }, 3000);
}

function connectEvents() {
  if (state.dataMode === 'static') {
    setConnection('online', '静态页面已加载，随 GitHub Pages 构建更新');
    addFeed('静态页面已加载，合并 main 后自动发布');
    return;
  }

  if (!('EventSource' in window)) {
    setConnection('offline', '浏览器不支持 SSE，改用轮询模式');
    startFallbackPolling();
    return;
  }

  const source = new EventSource('events');

  source.addEventListener('open', () => {
    setConnection('online', '实时反馈通道已连接');
    addFeed('SSE 实时通道已连接');
  });

  source.addEventListener('state', (event) => {
    const payload = JSON.parse(event.data);
    setConnection(payload.ok ? 'online' : 'offline', payload.ok ? 'Live 已连接' : '实时通道在线，数据等待修复');
    applyState(payload);
  });

  source.addEventListener('pulse', (event) => {
    const payload = JSON.parse(event.data);
    toast(payload.message || '收到新的课堂反馈');
  });

  source.addEventListener('heartbeat', (event) => {
    const payload = JSON.parse(event.data);
    if (elements.statPulse) elements.statPulse.textContent = formatTime(payload.at);
  });

  source.addEventListener('error', () => {
    setConnection('offline', '实时通道断开，已尝试轮询');
    startFallbackPolling();
  });
}

function openActivityPanel() {
  if (!elements.activityOverlay || !elements.activityPanel) return;

  state.activityReturnFocus = document.activeElement;
  renderFeed();
  elements.activityOverlay.hidden = false;
  if (elements.viewAllFeed) elements.viewAllFeed.setAttribute('aria-expanded', 'true');
  document.body.classList.add('activity-open');
  elements.activityPanel.focus();
}

function closeActivityPanel() {
  if (!elements.activityOverlay) return;

  elements.activityOverlay.hidden = true;
  if (elements.viewAllFeed) elements.viewAllFeed.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('activity-open');

  if (state.activityReturnFocus && typeof state.activityReturnFocus.focus === 'function') {
    state.activityReturnFocus.focus();
  }
}

function bindActivityPanel() {
  if (elements.viewAllFeed) {
    elements.viewAllFeed.addEventListener('click', openActivityPanel);
  }

  if (elements.closeActivity) {
    elements.closeActivity.addEventListener('click', closeActivityPanel);
  }

  if (elements.activityOverlay) {
    elements.activityOverlay.addEventListener('click', (event) => {
      if (event.target === elements.activityOverlay) closeActivityPanel();
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && elements.activityOverlay && !elements.activityOverlay.hidden) {
      closeActivityPanel();
    }
  });
}

function setWallExpanded(expanded) {
  state.wallExpanded = expanded;

  if (expanded) {
    state.wallVisibleCount = Math.max(state.wallVisibleCount, WALL_PAGE_SIZE);
  } else {
    state.wallVisibleCount = WALL_PREVIEW_LIMIT;
    if (elements.wallSearch) elements.wallSearch.value = '';
  }

  renderWall();

  if (expanded && elements.wallSearch) {
    elements.wallSearch.focus();
  }
}

function bindWallControls() {
  if (elements.toggleWallMode) {
    elements.toggleWallMode.addEventListener('click', () => {
      setWallExpanded(!state.wallExpanded);
    });
  }

  if (elements.wallSearch) {
    elements.wallSearch.addEventListener('input', () => {
      state.wallVisibleCount = WALL_PAGE_SIZE;
      renderWall();
    });
  }

  if (elements.clearWallSearch) {
    elements.clearWallSearch.addEventListener('click', () => {
      if (elements.wallSearch) {
        elements.wallSearch.value = '';
        elements.wallSearch.focus();
      }
      state.wallVisibleCount = WALL_PAGE_SIZE;
      renderWall();
    });
  }

  if (elements.loadMoreWall) {
    elements.loadMoreWall.addEventListener('click', () => {
      state.wallVisibleCount += WALL_PAGE_SIZE;
      renderWall();
    });
  }
}

function selectedStyle() {
  return $('input[name="style"]:checked')?.value || 'nature';
}

function selectedAvatar() {
  return $('input[name="avatar"]:checked')?.value || AVATARS[0];
}

function readBuilderProfile() {
  const stack = formFields.stack.value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);

  return {
    name: formFields.name.value.trim() || 'New Contributor',
    github: formFields.github.value.trim() || 'your-github-id',
    role: formFields.role.value.trim() || 'First-time contributor',
    motto: formFields.motto.value.trim() || '今天完成我的第一个开源 PR',
    stack: stack.length ? stack : ['Git', 'Open Source'],
    city: formFields.city.value.trim() || 'Classroom',
    style: selectedStyle(),
    avatar: selectedAvatar(),
    homepage: ''
  };
}

function filenameFor(profile) {
  return `${String(profile.github || 'your-github-id').trim().toLowerCase()}.json`;
}

function updateBuilder() {
  if (!elements.profilePreview || !elements.jsonPreview) return;

  const profile = readBuilderProfile();
  const profileWithFile = { ...profile, file: filenameFor(profile) };
  const json = JSON.stringify(profile, null, 2);

  elements.profilePreview.innerHTML = cardMarkup(profileWithFile, { preview: true });
  elements.jsonPreview.textContent = json;
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    toast('复制失败，请手动选择文本复制');
  }
}

function renderAvatarPicker() {
  if (!elements.avatarPicker) return;

  elements.avatarPicker.innerHTML = AVATARS.map((avatar, index) => `
    <label class="avatar-choice" title="头像 ${index + 1}">
      <input type="radio" name="avatar" value="${avatar}" ${index === 0 ? 'checked' : ''} />
      <img src="${avatar}" alt="头像 ${index + 1}" />
    </label>
  `).join('');
}

function bindBuilder() {
  renderAvatarPicker();

  Object.values(formFields).forEach((field) => {
    if (!field) return;
    field.addEventListener('input', updateBuilder);
    field.addEventListener('change', updateBuilder);
  });

  $$('input[name="style"]').forEach((field) => {
    field.addEventListener('change', updateBuilder);
  });

  if (elements.avatarPicker) {
    elements.avatarPicker.addEventListener('change', updateBuilder);
  }

  if (elements.copyJson) {
    elements.copyJson.addEventListener('click', () => {
      updateBuilder();
      copyText(elements.jsonPreview.textContent, '已复制 JSON');
    });
  }

  if (elements.copyFilename) {
    elements.copyFilename.addEventListener('click', () => {
      copyText(filenameFor(readBuilderProfile()), '已复制文件名');
    });
  }

  if (elements.copyCloneCommand) {
    elements.copyCloneCommand.addEventListener('click', () => {
      copyText(elements.terminalCommands ? elements.terminalCommands.textContent : '', '已复制课堂命令');
    });
  }

  updateBuilder();
}

bindBuilder();
bindActivityPanel();
bindWallControls();
bindHistoryControls();
renderFeed();

fetchState()
  .then((payload) => {
    applyState(payload);
    connectEvents();
  })
  .catch(() => {
    setConnection('offline', '无法读取贡献者数据');
  });
