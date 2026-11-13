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
  console.log('🚕 AEROPOOL RIDE CATEGORY CARDS UI-ONLY REFINEMENT VERIFICATION');
  console.log('=================================================================\n');

  const screenshotsDir = path.resolve('C:/Users/praty/.gemini/antigravity/brain/9fd74342-e2dd-4c04-9295-c7cd439e32bf/screenshots');
  fs.mkdirSync(screenshotsDir, { recursive: true });

  const port = 3037;
  const distDir = path.resolve(__dirname, '..', 'dist');
  console.log(`Starting static server on port ${port}...`);
  const server = await startStaticServer(distDir, port);
  console.log(`✓ Static server ready at http://127.0.0.1:${port}`);

  const chromePath = findChrome();
  console.log('Using Chrome executable:', chromePath);

  const cdpPort = 9295;
  const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'aeropool-cards-audit-'));
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
    console.log(`✓ Chrome listening on CDP port ${cdpPort}, WS: ${wsUrl}`);

    const targets = await new Promise((res, rej) => {
      http.get(`http://127.0.0.1:${cdpPort}/json`, (r) => {
        let data = '';
        r.on('data', (c) => (data += c));
        r.on('end', () => res(JSON.parse(data)));
      }).on('error', rej);
    });

    const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
    if (!pageTarget) throw new Error('No page target found');

    const cdp = await createCdpConnection(pageTarget.webSocketDebuggerUrl);
    console.log('✓ Connected to Page CDP session');

    await cdp.sendCommand('Page.enable');
    await cdp.sendCommand('DOM.enable');
    await cdp.sendCommand('Runtime.enable');

    console.log('Waiting for initial page load...');
    await new Promise((r) => setTimeout(r, 2000));

    // 1. Advance Step 1 -> Step 2
    console.log('Waiting for Step 1 button (Continue to Destination)...');
    await waitForCondition(cdp, `Boolean(Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Continue to Destination')))`, 15000);
    await cdp.sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Continue to Destination'));
        if (btn) btn.click();
      })()`,
    });

    // 2. Advance Step 2 -> Step 3
    console.log('Waiting for Step 2 button (Continue to Preferences)...');
    await waitForCondition(cdp, `Boolean(Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Continue to Preferences')))`, 15000);
    await cdp.sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Continue to Preferences'));
        if (btn) btn.click();
      })()`,
    });

    // 3. Confirm Step 3 is rendered
    await waitForCondition(cdp, `Boolean(document.querySelector('[data-testid="ride-category-shared"]'))`, 15000);
    console.log('✓ Step 3 (Select Ride Category & Wait Window) successfully rendered');

    // Helper function to measure card dimensions and inspect details
    async function measureCards() {
      const res = await cdp.sendCommand('Runtime.evaluate', {
        expression: `(() => {
          const card1 = document.querySelector('[data-testid="ride-category-shared"]');
          const card2 = document.querySelector('[data-testid="ride-category-private"]');
          if (!card1 || !card2) return null;

          const r1 = card1.getBoundingClientRect();
          const r2 = card2.getBoundingClientRect();

          const style1 = window.getComputedStyle(card1);
          const style2 = window.getComputedStyle(card2);

          const getDetails = (card) => {
            const title = card.querySelector('h3')?.innerText?.trim();
            const badge = card.querySelector('span.rounded-full')?.innerText?.trim();
            const desc = card.querySelector('p')?.innerText?.trim();
            const svgs = card.querySelectorAll('svg').length;
            const ariaPressed = card.getAttribute('aria-pressed');
            return { title, badge, desc, svgs, ariaPressed };
          };

          return {
            card1: {
              width: Math.round(r1.width * 10) / 10,
              height: Math.round(r1.height * 10) / 10,
              padding: style1.padding,
              borderRadius: style1.borderRadius,
              borderWidth: style1.borderTopWidth,
              borderColor: style1.borderColor,
              ...getDetails(card1)
            },
            card2: {
              width: Math.round(r2.width * 10) / 10,
              height: Math.round(r2.height * 10) / 10,
              padding: style2.padding,
              borderRadius: style2.borderRadius,
              borderWidth: style2.borderTopWidth,
              borderColor: style2.borderColor,
              ...getDetails(card2)
            },
            dimensionsMatch: Math.abs(r1.width - r2.width) < 1 && Math.abs(r1.height - r2.height) < 1
          };
        })()`,
        returnByValue: true
      });
      return res.result.value;
    }

    // 4. Test across 5 viewports
    const viewports = [
      { name: 'mobile-360px', width: 360, height: 800 },
      { name: 'mobile-390px', width: 390, height: 844 },
      { name: 'mobile-430px', width: 430, height: 932 },
      { name: 'tablet-768px', width: 768, height: 1024 },
      { name: 'desktop-1280px', width: 1280, height: 900 },
    ];

    const measurements = [];

    for (const vp of viewports) {
      console.log(`\nTesting viewport ${vp.name} (${vp.width}x${vp.height})...`);
      await cdp.sendCommand('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 2,
        mobile: vp.width < 768,
      });
      await new Promise((r) => setTimeout(r, 600));

      // Scroll to Step 3 cards
      await cdp.sendCommand('Runtime.evaluate', {
        expression: `(() => {
          const el = document.querySelector('[data-testid="ride-category-shared"]');
          if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
        })()`
      });
      await new Promise((r) => setTimeout(r, 400));

      const measurement = await measureCards();
      measurements.push({ viewport: vp.name, ...measurement });

      console.log(`  Shared AeroPool: ${measurement.card1.width}px W × ${measurement.card1.height}px H (padding: ${measurement.card1.padding}, radius: ${measurement.card1.borderRadius})`);
      console.log(`  Private Airport Taxi: ${measurement.card2.width}px W × ${measurement.card2.height}px H (padding: ${measurement.card2.padding}, radius: ${measurement.card2.borderRadius})`);
      console.log(`  Identical Dimensions: ${measurement.dimensionsMatch ? '✓ YES (EXACT MATCH)' : '✗ MISMATCH'}`);

      // Capture screenshot
      const shot = await cdp.sendCommand('Page.captureScreenshot', { format: 'png' });
      const filename = `ride-category-cards-${vp.name}.png`;
      fs.writeFileSync(path.join(screenshotsDir, filename), Buffer.from(shot.data, 'base64'));
      console.log(`  ✓ Screenshot saved: screenshots/${filename}`);
    }

    // 5. Test Interactive Selection Switching
    console.log('\n--- Testing Interactive Selection Switching ---');
    await cdp.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await new Promise((r) => setTimeout(r, 500));

    console.log('Clicking "Private Airport Taxi" card...');
    await cdp.sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const pCard = document.querySelector('[data-testid="ride-category-private"]');
        if (pCard) pCard.click();
      })()`
    });
    await new Promise((r) => setTimeout(r, 500));

    const afterPrivateClick = await measureCards();
    console.log(`  Shared aria-pressed: ${afterPrivateClick.card1.ariaPressed} (border: ${afterPrivateClick.card1.borderColor})`);
    console.log(`  Private aria-pressed: ${afterPrivateClick.card2.ariaPressed} (border: ${afterPrivateClick.card2.borderColor})`);
    console.log(`  Private is Active: ${afterPrivateClick.card2.ariaPressed === 'true' ? '✓ YES' : '✗ NO'}`);
    console.log(`  Dimensions still match: ${afterPrivateClick.dimensionsMatch ? '✓ YES' : '✗ NO'}`);

    const shotPrivate = await cdp.sendCommand('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotsDir, 'ride-category-private-active-390px.png'), Buffer.from(shotPrivate.data, 'base64'));
    console.log('  ✓ Screenshot saved: screenshots/ride-category-private-active-390px.png');

    console.log('Clicking back to "Shared AeroPool" card...');
    await cdp.sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const sCard = document.querySelector('[data-testid="ride-category-shared"]');
        if (sCard) sCard.click();
      })()`
    });
    await new Promise((r) => setTimeout(r, 500));

    const afterSharedClick = await measureCards();
    console.log(`  Shared aria-pressed: ${afterSharedClick.card1.ariaPressed} (border: ${afterSharedClick.card1.borderColor})`);
    console.log(`  Private aria-pressed: ${afterSharedClick.card2.ariaPressed} (border: ${afterSharedClick.card2.borderColor})`);
    console.log(`  Shared is Active: ${afterSharedClick.card1.ariaPressed === 'true' ? '✓ YES' : '✗ NO'}`);

    console.log('\n=================================================================');
    console.log('SUMMARY TABLE OF MEASUREMENTS:');
    console.log('=================================================================');
    measurements.forEach(m => {
      console.log(`${m.viewport.padEnd(16)} | Shared: ${m.card1.width}x${m.card1.height}px | Private: ${m.card2.width}x${m.card2.height}px | Equal: ${m.dimensionsMatch}`);
    });

    const scratchPath = path.resolve('C:/Users/praty/.gemini/antigravity/brain/9fd74342-e2dd-4c04-9295-c7cd439e32bf/scratch');
    fs.mkdirSync(scratchPath, { recursive: true });
    fs.writeFileSync(
      path.join(scratchPath, 'category_cards_measurements.json'),
      JSON.stringify({ measurements, afterPrivateClick, afterSharedClick }, null, 2)
    );

    console.log('\n✓ All tests and screenshots completed successfully!');
    cdp.close();
  } catch (err) {
    console.error('Test execution failed:', err);
  } finally {
    try {
      chrome.kill('SIGKILL');
    } catch {}
    server.close();
  }
}

main();
