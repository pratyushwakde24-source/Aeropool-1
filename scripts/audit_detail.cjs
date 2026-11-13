const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

function findChrome() {
  const commonPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
  ];
  for (const p of commonPaths) {
    if (fs.existsSync(p)) return p;
  }
  return 'chrome';
}

function startStaticServer(dir, port) {
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };

  const server = http.createServer((req, res) => {
    const rawPath = req.url.split('?')[0];
    const cleanRelative = rawPath.replace(/^\/+/, '');
    let filePath = path.join(dir, cleanRelative);

    if (!cleanRelative || (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory())) {
      filePath = path.join(dir, 'index.html');
    } else if (!fs.existsSync(filePath)) {
      filePath = path.join(dir, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end('Server Error: ' + err.code);
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

function createCdpConnection(wsUrl) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(wsUrl);
    const key = Buffer.from(Math.random().toString()).toString('base64');
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13',
      },
    });

    req.on('upgrade', (res, socket) => {
      socket.on('error', () => {});
      let idCounter = 1;
      const callbacks = new Map();

      function sendCommand(method, params = {}) {
        return new Promise((resCmd, rejCmd) => {
          const id = idCounter++;
          callbacks.set(id, { resolve: resCmd, reject: rejCmd });
          const payload = JSON.stringify({ id, method, params });
          const length = Buffer.byteLength(payload);
          let frame;
          if (length < 126) {
            frame = Buffer.alloc(6 + length);
            frame[0] = 0x81;
            frame[1] = 0x80 | length;
            const mask = Buffer.from([1, 2, 3, 4]);
            mask.copy(frame, 2);
            for (let i = 0; i < length; i++) {
              frame[6 + i] = payload.charCodeAt(i) ^ mask[i % 4];
            }
          } else {
            frame = Buffer.alloc(8 + length);
            frame[0] = 0x81;
            frame[1] = 0x80 | 126;
            frame.writeUInt16BE(length, 2);
            const mask = Buffer.from([1, 2, 3, 4]);
            mask.copy(frame, 4);
            for (let i = 0; i < length; i++) {
              frame[8 + i] = payload.charCodeAt(i) ^ mask[i % 4];
            }
          }
          socket.write(frame);
        });
      }

      let buffer = Buffer.alloc(0);
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length >= 2) {
          const secondByte = buffer[1];
          const isMasked = (secondByte & 0x80) !== 0;
          let payloadLength = secondByte & 0x7f;
          let offset = 2;
          if (payloadLength === 126) {
            if (buffer.length < 4) break;
            payloadLength = buffer.readUInt16BE(2);
            offset = 4;
          } else if (payloadLength === 127) {
            if (buffer.length < 10) break;
            payloadLength = Number(buffer.readBigUInt64BE(2));
            offset = 10;
          }
          let maskKey = null;
          if (isMasked) {
            if (buffer.length < offset + 4) break;
            maskKey = buffer.slice(offset, offset + 4);
            offset += 4;
          }
          if (buffer.length < offset + payloadLength) break;
          const data = buffer.slice(offset, offset + payloadLength);
          if (isMasked) {
            for (let i = 0; i < payloadLength; i++) {
              data[i] ^= maskKey[i % 4];
            }
          }
          buffer = buffer.slice(offset + payloadLength);
          try {
            const msg = JSON.parse(data.toString('utf8'));
            if (msg.id && callbacks.has(msg.id)) {
              const { resolve: r, reject: rej } = callbacks.get(msg.id);
              callbacks.delete(msg.id);
              if (msg.error) rej(msg.error);
              else r(msg.result);
            }
          } catch (e) {}
        }
      });

      resolve({
        sendCommand,
        close: () => socket.destroy(),
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function getWsUrl(port) {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/json/version`, (r) => {
          let body = '';
          r.on('data', (chunk) => (body += chunk));
          r.on('end', () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              reject(e);
            }
          });
        }).on('error', reject);
      });
      if (res && res.webSocketDebuggerUrl) return res.webSocketDebuggerUrl;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw new Error('Chrome remote debugging connection timed out');
}

async function waitForCondition(cdp, jsExpr, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await cdp.sendCommand('Runtime.evaluate', {
        expression: jsExpr,
        returnByValue: true,
      });
      if (res.result && res.result.value) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function main() {
  const port = 3039;
  const distDir = path.resolve(__dirname, '..', 'dist');
  const server = await startStaticServer(distDir, port);
  const chromePath = findChrome();
  const cdpPort = 9297;
  const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'aeropool-detail-audit-'));
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      `--remote-debugging-port=${cdpPort}`,
      '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${tmpProfile}`,
      '--no-first-run',
      '--no-default-browser-check',
      `http://127.0.0.1:${port}/app/book`,
    ],
    { stdio: 'ignore' }
  );

  try {
    const wsUrl = await getWsUrl(cdpPort);
    const targets = await new Promise((res, rej) => {
      http.get(`http://127.0.0.1:${cdpPort}/json`, (r) => {
        let data = '';
        r.on('data', (c) => (data += c));
        r.on('end', () => res(JSON.parse(data)));
      }).on('error', rej);
    });

    const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
    const cdp = await createCdpConnection(pageTarget.webSocketDebuggerUrl);

    await cdp.sendCommand('Page.enable');
    await cdp.sendCommand('DOM.enable');
    await cdp.sendCommand('Runtime.enable');

    await new Promise((r) => setTimeout(r, 1500));

    // Step 1 -> Step 2
    await waitForCondition(cdp, `Boolean(Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Continue to Destination')))`, 15000);
    await cdp.sendCommand('Runtime.evaluate', {
      expression: `Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Continue to Destination')).click()`,
    });

    // Step 2 -> Step 3
    await waitForCondition(cdp, `Boolean(Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Continue to Preferences')))`, 15000);
    await cdp.sendCommand('Runtime.evaluate', {
      expression: `Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Continue to Preferences')).click()`,
    });

    await waitForCondition(cdp, `Boolean(document.querySelector('[data-testid="ride-category-shared"]'))`, 15000);

    const testViewports = [
      { name: '320px', width: 320, height: 640 },
      { name: '360px', width: 360, height: 800 },
      { name: '375px', width: 375, height: 667 },
      { name: '390px', width: 390, height: 844 },
      { name: '430px', width: 430, height: 932 },
      { name: '768px', width: 768, height: 1024 },
      { name: '1280px', width: 1280, height: 900 },
    ];

    for (const vp of testViewports) {
      await cdp.sendCommand('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 2,
        mobile: vp.width < 768,
      });
      await new Promise((r) => setTimeout(r, 400));

      const details = await cdp.sendCommand('Runtime.evaluate', {
        expression: `(() => {
          function getCard(testId) {
            const card = document.querySelector('[data-testid="' + testId + '"]');
            const h3 = card.querySelector('h3');
            const badge = card.querySelector('span.rounded-full');
            const desc = card.querySelector('p');
            const cardRect = card.getBoundingClientRect();
            const h3Rect = h3.getBoundingClientRect();
            const badgeRect = badge.getBoundingClientRect();
            
            // Text line count
            const lineCount = h3.getClientRects().length;
            const sameRow = Math.abs(h3Rect.top - badgeRect.top) < 15;
            const badgeBelowTitle = badgeRect.top >= (h3Rect.bottom - 2);

            return {
              title: h3.innerText.replace(/\\n/g, ' '),
              lineCount,
              sameRow,
              badgeBelowTitle,
              h3Width: Math.round(h3Rect.width),
              badgeWidth: Math.round(badgeRect.width),
              cardWidth: Math.round(cardRect.width),
              cardHeight: Math.round(cardRect.height),
            };
          }

          return {
            shared: getCard('ride-category-shared'),
            private: getCard('ride-category-private'),
          };
        })()`,
        returnByValue: true,
      });

      console.log(`\n--- Viewport ${vp.name} (${vp.width}px) ---`);
      console.log(`  Shared: lines: ${details.result.value.shared.lineCount}, sameRowAsBadge: ${details.result.value.shared.sameRow}, badgeBelowTitle: ${details.result.value.shared.badgeBelowTitle}`);
      console.log(`  Private: lines: ${details.result.value.private.lineCount}, sameRowAsBadge: ${details.result.value.private.sameRow}, badgeBelowTitle: ${details.result.value.private.badgeBelowTitle}`);
      console.log(`  Card dims: Shared ${details.result.value.shared.cardWidth}x${details.result.value.shared.cardHeight} | Private ${details.result.value.private.cardWidth}x${details.result.value.private.cardHeight}`);
    }

    cdp.close();
  } catch (err) {
    console.error('Audit error:', err);
  } finally {
    try {
      chrome.kill('SIGKILL');
    } catch {}
    server.close();
  }
}

main();

