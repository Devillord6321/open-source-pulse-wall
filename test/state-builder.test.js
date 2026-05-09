const assert = require('node:assert/strict');
const test = require('node:test');

const { fetchGithubState } = require('../scripts/state-builder');

function jsonResponse(body, headers = {}) {
  return {
    ok: true,
    headers: {
      get(name) {
        return headers[String(name).toLowerCase()] || null;
      }
    },
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    }
  };
}

test('uses paginated GitHub collections instead of treating the first page as totals', async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url) => {
    const parsed = new URL(url);
    calls.push(parsed.pathname + parsed.search);

    if (parsed.pathname === '/repos/acme/wall') {
      return jsonResponse({
        full_name: 'acme/wall',
        stargazers_count: 3,
        clone_url: 'https://github.com/acme/wall.git',
        html_url: 'https://github.com/acme/wall',
        pushed_at: '2026-05-09T00:00:00Z'
      });
    }

    if (parsed.pathname === '/repos/acme/wall/contributors') {
      return jsonResponse([{ login: 'a' }]);
    }

    if (parsed.pathname === '/repos/acme/wall/commits') {
      return jsonResponse([]);
    }

    if (parsed.pathname === '/repos/acme/wall/issues') {
      const page = Number(parsed.searchParams.get('page') || '1');
      const issue = (number) => ({
        number,
        title: `Issue ${number}`,
        state: number % 2 ? 'open' : 'closed',
        user: { login: 'student' },
        created_at: '2026-05-09T00:00:00Z',
        updated_at: '2026-05-09T00:00:00Z',
        closed_at: number % 2 ? null : '2026-05-09T01:00:00Z',
        comments: 0,
        labels: []
      });

      if (page === 1) {
        return jsonResponse([issue(1), issue(2)], {
          link: '<https://api.github.com/repos/acme/wall/issues?state=all&page=2>; rel="next"'
        });
      }
      return jsonResponse([issue(3)]);
    }

    if (parsed.pathname === '/repos/acme/wall/pulls') {
      const page = Number(parsed.searchParams.get('page') || '1');
      const pr = (number) => ({
        number,
        title: `PR ${number}`,
        state: 'open',
        user: { login: 'student' },
        created_at: '2026-05-09T00:00:00Z',
        updated_at: '2026-05-09T00:00:00Z',
        requested_reviewers: [],
        requested_teams: []
      });

      if (page === 1) {
        return jsonResponse([pr(1)], {
          link: '<https://api.github.com/repos/acme/wall/pulls?state=open&page=2>; rel="next"'
        });
      }
      return jsonResponse([pr(2)]);
    }

    throw new Error(`Unexpected URL ${url}`);
  };

  try {
    const state = await fetchGithubState({ repository: 'acme/wall' });

    assert.equal(state.issuesTotal, 3);
    assert.equal(state.openIssuesTotal, 2);
    assert.equal(state.pullRequestsTotal, 2);
    assert.ok(calls.some((call) => call.includes('/issues') && call.includes('page=2')));
    assert.ok(calls.some((call) => call.includes('/pulls') && call.includes('page=2')));
  } finally {
    global.fetch = originalFetch;
  }
});
