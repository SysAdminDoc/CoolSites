'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIME_TYPES = {
  '.atom': 'application/atom+xml; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
};

const requestedPort = Number.parseInt(process.env.PORT || process.argv[2] || '4173', 10);
const host = process.env.HOST || '127.0.0.1';

if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) {
  console.error('PORT must be an integer between 0 and 65535.');
  process.exitCode = 1;
} else {
  const server = http.createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end('Method Not Allowed');
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname);
    } catch {
      response.writeHead(400);
      response.end('Bad Request');
      return;
    }

    const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filePath = path.resolve(ROOT, relativePath);
    if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    if (isHidden(filePath)) {
      sendNotFound(response);
      return;
    }

    fs.stat(filePath, (statError, stats) => {
      if (statError) {
        sendNotFound(response);
        return;
      }

      const resolvedPath = stats.isDirectory() ? path.join(filePath, 'index.html') : filePath;
      fs.readFile(resolvedPath, (readError, data) => {
        if (readError) {
          sendNotFound(response);
          return;
        }
        const extension = path.extname(resolvedPath).toLowerCase();
        response.writeHead(200, {
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Length': data.length,
          'Content-Type': MIME_TYPES[extension] || 'application/octet-stream'
        });
        if (request.method === 'HEAD') response.end();
        else response.end(data);
      });
    });
  });

  server.listen(requestedPort, host, () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : requestedPort;
    console.log(`CoolSites is available at http://${host}:${port}/`);
    console.log('Press Ctrl+C to stop the server.');
  });

  process.once('SIGINT', () => server.close(() => process.exit(0)));
  process.once('SIGTERM', () => server.close(() => process.exit(0)));
}

// The repository is the document root, so dotfiles (.git, .env) must never be
// served even though they sit inside it.
function isHidden(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).some(segment => segment.startsWith('.'));
}

function sendNotFound(response) {
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not Found');
}
