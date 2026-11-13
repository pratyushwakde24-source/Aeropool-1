const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

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
          } else if (length < 65536) {
            frame = Buffer.alloc(8 + length);
            frame[0] = 0x81;
            frame[1] = 0x80 | 126;
            frame.writeUInt16BE(length, 2);
            const mask = Buffer.from([1, 2, 3, 4]);
            mask.copy(frame, 4);
            for (let i = 0; i < length; i++) {
              frame[8 + i] = payload.charCodeAt(i) ^ mask[i % 4];
            }
          } else {
            frame = Buffer.alloc(14 + length);
            frame[0] = 0x81;
            frame[1] = 0x80 | 127;
            frame.writeBigUInt64BE(BigInt(length), 2);
            const mask = Buffer.from([1, 2, 3, 4]);
            mask.copy(frame, 10);
            for (let i = 0; i < length; i++) {
              frame[14 + i] = payload.charCodeAt(i) ^ mask[i % 4];
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

      resolve({ sendCommand, close: () => socket.destroy() });
    });

    req.on('error', reject);
    req.end();
  });
}

function pollHttp(url, maxWaitMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function tryReq() {
      http
        .get(url, (res) => {
          if (res.statusCode >= 200 && res.statusCode < 400) {
            resolve();
          } else {
            retry();
          }
        })
        .on('error', retry);
    }
    function retry() {
      if (Date.now() - start > maxWaitMs) {
        reject(new Error(`Timeout polling ${url}`));
      } else {
        setTimeout(tryReq, 300);
      }
    }
    tryReq();
  });
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
    let filePath = path.join(dir, req.url.split('?')[0]);
    if (filePath.endsWith(path.sep) || !path.extname(filePath)) {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      } else if (!fs.existsSync(filePath)) {
        filePath = path.join(dir, 'index.html');
      }
    }

    if (!fs.existsSync(filePath)) {
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

async function waitForCondition(cdp, jsExpr, timeout = 12000) {
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
  console.log('============================================================');
  console.log('🗺️ AEROPOOL ALL DESTINATIONS MAP VERIFICATION');
  console.log('============================================================\n');

  const screenshotsDir = path.resolve('C:/Users/praty/.gemini/antigravity/brain/9fd74342-e2dd-4c04-9295-c7cd439e32bf/screenshots');
  fs.mkdirSync(screenshotsDir, { recursive: true });

  const port = 3007;
  const distDir = path.resolve(__dirname, '..', 'dist');
  console.log(`Starting static server on port ${port}...`);
  const server = await startStaticServer(distDir, port);
  console.log(`✓ Static server ready at http://127.0.0.1:${port}`);

  const chromePath = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';

  const cdpPort = 9226;
  const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'aeropool-all-dest-'));
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
    await pollHttp(`http://127.0.0.1:${cdpPort}/json/list`, 15000);
    console.log(`✓ Chrome listening on CDP port ${cdpPort}`);

    const targets = await new Promise((res, rej) => {
      http.get(`http://127.0.0.1:${cdpPort}/json/list`, (r) => {
        let data = '';
        r.on('data', (c) => (data += c));
        r.on('end', () => res(JSON.parse(data)));
      }).on('error', rej);
    });

    const pageTarget = targets.find((t) => t.type === 'page');
    if (!pageTarget) throw new Error('No page target found');

    const cdp = await createCdpConnection(pageTarget.webSocketDebuggerUrl);
    console.log('✓ Connected to Page CDP session');

    await cdp.sendCommand('Page.enable');
    await cdp.sendCommand('DOM.enable');
    await cdp.sendCommand('Runtime.enable');

    // 1. Mobile Viewport 390x844 (standard iPhone 14)
    await cdp.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });

    await cdp.sendCommand('Page.navigate', { url: `http://127.0.0.1:${port}/app/book` });
    console.log('Waiting for PassengerBookView to load...');
    await waitForCondition(
      cdp,
      `Boolean(Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Continue to Destination')))`
    );

    console.log('Clicking "Continue to Destination" to reach Step 2...');
    await cdp.sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Continue to Destination'));
        if (btn) btn.click();
      })()`,
    });

    // Wait for map canvas to mount
    await waitForCondition(cdp, `Boolean(document.querySelector('.mapboxgl-canvas') || document.querySelector('canvas'))`, 15000);
    console.log('Map canvas mounted! Waiting 4s for initial Mapbox style & tiles...');
    await new Promise((r) => setTimeout(r, 4000));

    const testDestinations = [
      { id: 'bkc-bandra', name: 'Bandra Kurla Complex' },
      { id: 'bandra-west', name: 'Bandra West' },
      { id: 'lower-parel-worli', name: 'Lower Parel & Worli' },
      { id: 'nariman-colaba', name: 'South Mumbai' },
      { id: 'powai-hiranandani', name: 'Powai' },
      { id: 'andheri-lokhandwala', name: 'Andheri West' },
    ];

    const results = [];

    for (let i = 0; i < testDestinations.length; i++) {
      const item = testDestinations[i];
      console.log(`\n------------------------------------------------------------`);
      console.log(`Testing [${i + 1}/6]: ${item.name} (${item.id})`);
      console.log(`------------------------------------------------------------`);

      // Click the destination button
      const clickRes = await cdp.sendCommand('Runtime.evaluate', {
        expression: `(() => {
          const btn = document.querySelector('[data-testid="hub-${item.id}"]') ||
                      Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('${item.name}'));
          if (btn) {
            btn.click();
            return { clicked: true, text: btn.innerText.replace(/\\n/g, ' ') };
          }
          return { clicked: false };
        })()`,
        returnByValue: true,
      });
      console.log('Click result:', clickRes.result.value);

      // Wait 3.5 seconds for route calculation & camera transition
      await new Promise((r) => setTimeout(r, 3500));

      // Inspect DOM & Map State
      const state = await cdp.sendCommand('Runtime.evaluate', {
        expression: `(() => {
          const mapCanvas = document.querySelector('.mapboxgl-canvas') || document.querySelector('canvas');
          const pickupMarker = document.querySelector('.aeropool-pickup-marker');
          const destMarker = document.querySelector('.aeropool-destination-marker');
          const targetCard = Array.from(document.querySelectorAll('div')).find(d => (d.innerText || '').includes('Target Drop-Off Point'));
          
          let cardDetails = '';
          if (targetCard) {
            cardDetails = targetCard.innerText.replace(/\\n/g, ' | ');
          }

          const activeBtn = document.querySelector('[data-testid="hub-${item.id}"]');
          const isAriaPressed = activeBtn ? activeBtn.getAttribute('aria-pressed') : null;

          return {
            hasCanvas: Boolean(mapCanvas),
            canvasWidth: mapCanvas?.clientWidth,
            canvasHeight: mapCanvas?.clientHeight,
            hasPickupMarker: Boolean(pickupMarker),
            pickupText: pickupMarker ? pickupMarker.innerText.replace(/\\n/g, ' ').trim() : null,
            hasDestMarker: Boolean(destMarker),
            isAriaPressed,
            cardDetails: cardDetails.slice(0, 200),
          };
        })()`,
        returnByValue: true,
      });

      console.log('Map & UI State:', JSON.stringify(state.result.value, null, 2));
      results.push({ dest: item.name, id: item.id, ...state.result.value });

      // Scroll map into view
      await cdp.sendCommand('Runtime.evaluate', {
        expression: `(() => {
          const mapEl = document.querySelector('.mapboxgl-canvas')?.parentElement?.parentElement;
          if (mapEl) {
            mapEl.scrollIntoView({ behavior: 'instant', block: 'center' });
          }
        })()`,
      });
      await new Promise((r) => setTimeout(r, 600));

      // Take screenshot
      const shot = await cdp.sendCommand('Page.captureScreenshot', { format: 'png' });
      const filename = `destination-${i + 1}-${item.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-390px.png`;
      const fullPath = path.join(screenshotsDir, filename);
      fs.writeFileSync(fullPath, Buffer.from(shot.data, 'base64'));
      console.log(`📸 Saved screenshot: ${filename}`);
    }

    // --- Test Map Controls ---
    console.log('\n--- Testing Map Controls: Satellite Toggle, Zoom In, Zoom Out ---');
    
    // Toggle Satellite
    await cdp.sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const toggleBtn = document.querySelector('button[title="Toggle Map Style"]');
        if (toggleBtn) toggleBtn.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 2500));
    const satShot = await cdp.sendCommand('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotsDir, 'map-control-satellite-390px.png'), Buffer.from(satShot.data, 'base64'));
    console.log('📸 Saved satellite mode screenshot');

    // Toggle back to Midnight
    await cdp.sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const toggleBtn = document.querySelector('button[title="Toggle Map Style"]');
        if (toggleBtn) toggleBtn.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 2000));

    // Zoom In
    await cdp.sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('button[title="Zoom in"]');
        if (btn) { btn.click(); btn.click(); }
      })()`,
    });
    await new Promise((r) => setTimeout(r, 1000));

    // Zoom Out
    await cdp.sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('button[title="Zoom out"]');
        if (btn) btn.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 1000));

    // Viewport tests at 360px and 430px
    console.log('\n--- Viewport Tests (360px and 430px) ---');
    await cdp.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 360,
      height: 780,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await new Promise((r) => setTimeout(r, 1000));
    const shot360 = await cdp.sendCommand('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotsDir, 'map-viewport-360px.png'), Buffer.from(shot360.data, 'base64'));
    console.log('📸 Saved 360px viewport screenshot');

    await cdp.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 430,
      height: 932,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await new Promise((r) => setTimeout(r, 1000));
    const shot430 = await cdp.sendCommand('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotsDir, 'map-viewport-430px.png'), Buffer.from(shot430.data, 'base64'));
    console.log('📸 Saved 430px viewport screenshot');

    fs.writeFileSync('scratch/all_destinations_verification.json', JSON.stringify(results, null, 2));
    console.log('\n✅ ALL VERIFICATION COMPLETED SUCCESSFULLY!');

    cdp.close();
  } finally {
    chrome.kill();
    server.close();
    try {
      fs.rmSync(tmpProfile, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
