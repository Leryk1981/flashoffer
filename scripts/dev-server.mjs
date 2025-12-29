import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 4173);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const resolvePath = (pathname) => {
  const decoded = decodeURIComponent(pathname.split('?')[0]);
  let candidate = path.join(root, decoded);
  if (candidate.endsWith(path.sep)) {
    candidate = path.join(candidate, 'index.html');
  }
  return candidate;
};

const server = createServer(async (req, res) => {
  if (!req.url) {
    res.statusCode = 400;
    res.end('Bad request');
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const filePath = resolvePath(url.pathname);

  try {
    const stats = await stat(filePath);
    const target = stats.isDirectory() ? path.join(filePath, 'index.html') : filePath;
    const buffer = await readFile(target);
    const ext = path.extname(target).toLowerCase();
    res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
    res.statusCode = 200;
    res.end(buffer);
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      console.error(error);
    }
    res.statusCode = 404;
    res.end('Not found');
  }
});

server.listen(port, () => {
  console.log(`FlashOffer dev server running at http://localhost:${port}`);
});
