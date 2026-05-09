const path = require('path');

function isInsideDirectory(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveStaticPath(urlPath, publicDir) {
  const cleanUrl = String(urlPath || '').split('?')[0].split('#')[0];
  const requested = cleanUrl === '/' ? '/index.html' : cleanUrl;
  let decoded;

  try {
    decoded = decodeURIComponent(requested);
  } catch {
    return null;
  }

  const publicRoot = path.resolve(publicDir);
  const relativeRequest = decoded.replace(/^[/\\]+/, '');
  const fullPath = path.resolve(publicRoot, relativeRequest);

  if (!isInsideDirectory(publicRoot, fullPath)) {
    return null;
  }

  return fullPath;
}

module.exports = {
  resolveStaticPath
};
