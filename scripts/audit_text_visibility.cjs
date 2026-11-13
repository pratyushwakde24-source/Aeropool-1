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
  console.log('=================================================================');
  console.log('🔍 AEROPOOL RIDE CATEGORY CARDS TEXT VISIBILITY VERIFICATION');
  console.log('=================================================================\n');

  const screenshotsDir = path.resolve('C:/Users/praty/.gemini/antigravity/brain/d0c3ad49-1940-41c2-a2dd-1751a968c15b/screenshots');
  fs.mkdirSync(screenshotsDir, { recursive: true });

  const port = 3040;
  const distDir = path.resolve(__dirname, '..', 'dist');
  console.log(`Starting static server on port ${port}...`);
  const server = await startStaticServer(distDir, port);
  console.log(`✓ Static server ready at http://127.0.0.1:${port}`);

  const chromePath = findChrome();
  const cdpPort = 9298;
  const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'aeropool-verify-'));
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
    console.log(`✓ Chrome listening on CDP port ${cdpPort}`);

    const targets = await new Promise((res, rej) => {
      http.get(`http://127.0.0.1:${cdpPort}/json`, (r) => {
        let data = '';
        r.on('data', (c) => (data += c));
        r.on('end', () => res(JSON.parse(data)));
      }).on('error', rej);
    });

    const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
    const cdp = await createCdpConnection(pageTarget.webSocketDebuggerUrl);
    console.log('✓ Connected to Page CDP session');

    await cdp.sendCommand('Page.enable');
    await cdp.sendCommand('DOM.enable');
    await cdp.sendCommand('Runtime.enable');

    await new Promise((r) => setTimeout(r, 1500));

    // 1. Advance Step 1 -> Step 2
    await waitForCondition(cdp, `Boolean(Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Continue to Destination')))`, 15000);
    await cdp.sendCommand('Runtime.evaluate', {
      expression: `Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Continue to Destination')).click()`,
    });

    // 2. Advance Step 2 -> Step 3
    await waitForCondition(cdp, `Boolean(Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Continue to Preferences')))`, 15000);
    await cdp.sendCommand('Runtime.evaluate', {
      expression: `Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Continue to Preferences')).click()`,
    });

    // 3. Confirm Step 3 is rendered
    await waitForCondition(cdp, `Boolean(document.querySelector('[data-testid="ride-category-shared"]'))`, 15000);
    console.log('✓ Step 3 successfully rendered\n');

    async function inspectCardDetails() {
      const res = await cdp.sendCommand('Runtime.evaluate', {
        expression: `(() => {
          const c1 = document.querySelector('[data-testid="ride-category-shared"]');
          const c2 = document.querySelector('[data-testid="ride-category-private"]');
          if (!c1 || !c2) return null;

          function getCardInfo(card) {
            const h3 = card.querySelector('h3');
            const badge = card.querySelector('span.rounded-full');
            const desc = card.querySelector('p');
            const r = card.getBoundingClientRect();
            const h3Rect = h3.getBoundingClientRect();
            const badgeRect = badge.getBoundingClientRect();
            
            // Check text truncation / clipping
            const h3Truncated = h3 ? h3.scrollWidth > h3.clientWidth : false;
            const descTruncated = desc ? desc.scrollHeight > desc.clientHeight : false;

            // Check horizontal overflow
            const hasHOverflow = card.scrollWidth > card.clientWidth;

            // Get text line count using Range
            let textLines = 1;
            if (h3 && h3.firstChild) {
              const range = document.createRange();
              range.selectNodeContents(h3);
              const rects = range.getClientRects();
              textLines = rects.length;
            }

            return {
              rect: { width: Math.round(r.width * 10) / 10, height: Math.round(r.height * 10) / 10 },
              titleText: h3 ? h3.innerText : '',
              titleScrollWidth: h3 ? h3.scrollWidth : 0,
              titleClientWidth: h3 ? h3.clientWidth : 0,
              titleHeight: Math.round(h3Rect.height * 10) / 10,
              titleTruncated: h3Truncated,
              textLines,
              badgeText: badge ? badge.innerText : '',
              badgeTop: Math.round(badgeRect.top * 10) / 10,
              badgeLeft: Math.round(badgeRect.left * 10) / 10,
              descText: desc ? desc.innerText : '',
              descTruncated,
              hasHOverflow,
            };
          }

          const r1 = c1.getBoundingClientRect();
          const r2 = c2.getBoundingClientRect();

          return {
            card1: getCardInfo(c1),
            card2: getCardInfo(c2),
            equalDimensions: Math.abs(r1.width - r2.width) < 1 && Math.abs(r1.height - r2.height) < 1,
            bodyScrollWidth: document.body.scrollWidth,
            windowInnerWidth: window.innerWidth,
            bodyOverflow: document.body.scrollWidth > window.innerWidth,
          };
        })()`,
        returnByValue: true,
      });
      return res.result.value;
    }

    const testViewports = [
      { name: '320px', width: 320, height: 640 },
      { name: '360px', width: 360, height: 800 },
      { name: '375px', width: 375, height: 667 },
      { name: '390px', width: 390, height: 844 },
      { name: '430px', width: 430, height: 932 },
      { name: 'tablet-768px', width: 768, height: 1024 },
      { name: 'desktop-1280px', width: 1280, height: 900 },
    ];

    const allAuditData = [];

    for (const vp of testViewports) {
      await cdp.sendCommand('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 2,
        mobile: vp.width < 768,
      });
      await new Promise((r) => setTimeout(r, 500));

      // Scroll into view
      await cdp.sendCommand('Runtime.evaluate', {
        expression: `(() => {
          const el = document.querySelector('[data-testid="ride-category-shared"]');
          if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
        })()`
      });
      await new Promise((r) => setTimeout(r, 300));

      const info = await inspectCardDetails();
      allAuditData.push({ viewport: vp.name, width: vp.width, height: vp.height, ...info });

      console.log(`\n================ Viewport ${vp.name} (${vp.width}x${vp.height}) ================`);
      console.log(`  Shared AeroPool:`);
      console.log(`    Title: "${info.card1.titleText}" | Lines: ${info.card1.textLines} | Height: ${info.card1.titleHeight}px | Truncated: ${info.card1.titleTruncated}`);
      console.log(`    Badge: "${info.card1.badgeText}"`);
      console.log(`    Dimensions: ${info.card1.rect.width}px W × ${info.card1.rect.height}px H`);
      console.log(`  Private Airport Taxi:`);
      console.log(`    Title: "${info.card2.titleText}" | Lines: ${info.card2.textLines} | Height: ${info.card2.titleHeight}px | Truncated: ${info.card2.titleTruncated}`);
      console.log(`    Badge: "${info.card2.badgeText}"`);
      console.log(`    Dimensions: ${info.card2.rect.width}px W × ${info.card2.rect.height}px H`);
      console.log(`  Equal Dimensions: ${info.equalDimensions ? '✅ YES' : '❌ NO'}`);
      console.log(`  Body Horizontal Overflow: ${info.bodyOverflow ? '❌ YES' : '✅ NO'}`);

      // Capture screenshot
      const shot = await cdp.sendCommand('Page.captureScreenshot', { format: 'png' });
      const filename = `ride-category-fixed-${vp.name}.png`;
      fs.writeFileSync(path.join(screenshotsDir, filename), Buffer.from(shot.data, 'base64'));
      console.log(`  ✓ Screenshot: screenshots/${filename}`);
    }

    // Interactive selection test
    console.log('\n--- Testing Interactive Selection Switching ---');
    await cdp.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await new Promise((r) => setTimeout(r, 400));

    // Click Private Taxi
    await cdp.sendCommand('Runtime.evaluate', {
      expression: `document.querySelector('[data-testid="ride-category-private"]').click()`,
    });
    await new Promise((r) => setTimeout(r, 400));
    const privateActiveShot = await cdp.sendCommand('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotsDir, 'ride-category-fixed-private-active-390px.png'), Buffer.from(privateActiveShot.data, 'base64'));
    console.log('  ✓ Private active screenshot saved');

    // Click Shared Pool
    await cdp.sendCommand('Runtime.evaluate', {
      expression: `document.querySelector('[data-testid="ride-category-shared"]').click()`,
    });
    await new Promise((r) => setTimeout(r, 400));
    const sharedActiveShot = await cdp.sendCommand('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotsDir, 'ride-category-fixed-shared-active-390px.png'), Buffer.from(sharedActiveShot.data, 'base64'));
    console.log('  ✓ Shared active screenshot saved');

    // Save full JSON report
    fs.writeFileSync(
      path.join(screenshotsDir, 'audit_report.json'),
      JSON.stringify(allAuditData, null, 2)
    );

    console.log('\n✅ Verification complete! All screenshots and JSON data saved.');
    cdp.close();
  } catch (err) {
    console.error('Verification failed:', err);
  } finally {
    try {
      chrome.kill('SIGKILL');
    } catch {}
    server.close();
  }
}

main();
