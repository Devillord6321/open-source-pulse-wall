const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { resolveStaticPath } = require('../scripts/static-path');

test('resolves files inside the public directory', () => {
  const publicDir = path.join(__dirname, '..', 'public');

  assert.equal(
    resolveStaticPath('/', publicDir),
    path.join(publicDir, 'index.html')
  );
  assert.equal(
    resolveStaticPath('/styles.css', publicDir),
    path.join(publicDir, 'styles.css')
  );
});

test('rejects malformed percent-encoded paths without throwing', () => {
  const publicDir = path.join(__dirname, '..', 'public');

  assert.equal(resolveStaticPath('/%E0%A4%A', publicDir), null);
});

test('rejects paths that resolve outside the public directory', () => {
  const publicDir = path.join(__dirname, '..', 'public');

  assert.equal(resolveStaticPath('/../public-secret/leak.txt', publicDir), null);
  assert.equal(resolveStaticPath('/..%2fpublic-secret%2fleak.txt', publicDir), null);
  assert.equal(resolveStaticPath('/%2e%2e%5cpublic-secret%5cleak.txt', publicDir), null);
});
