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
      socket.on('error', () => {}); // Prevent unhandled socket error on process termination
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

      resolve({ sendCommand, socket });
    });

    req.on('error', reject);
    req.end();
  });
}

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

async function getWsUrl(port) {
  for (let i = 0; i < 30; i++) {
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

async function waitForCondition(pageConn, jsExpr, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await pageConn.sendCommand('Runtime.evaluate', {
        expression: jsExpr,
        returnByValue: true,
      });
      if (res.result && res.result.value) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
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
    const parsedUrl = new URL(req.url, `http://127.0.0.1:${port}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);
    const cleanPath = pathname.replace(/^\/+/, '');
    let filePath = path.join(dir, cleanPath);

    // If root or directory, serve index.html
    if (!cleanPath || (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory())) {
      filePath = path.join(dir, 'index.html');
    } else if (!fs.existsSync(filePath)) {
      // SPA route fallback for extensionless URLs like /app/book
      if (!path.extname(pathname)) {
        filePath = path.join(dir, 'index.html');
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404);
        res.end('Not Found: ' + err.code);
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function runMapVerification() {
  const screenshotDir = path.resolve('C:/Users/praty/.gemini/antigravity/brain/9fd74342-e2dd-4c04-9295-c7cd439e32bf/screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const serverPort = 3012;
  const distDir = path.resolve(__dirname, '..', 'dist');
  console.log(`Starting local SPA server on port ${serverPort}...`);
  const server = await startStaticServer(distDir, serverPort);
  console.log(`✓ Local SPA server listening on http://127.0.0.1:${serverPort}`);

  const chromePath = findChrome();
  console.log('Spawning Chrome from:', chromePath);

  const port = 9260;
  const tempProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-map-audit-'));
  const chromeProcess = spawn(
    chromePath,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${tempProfile}`,
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      `http://127.0.0.1:${serverPort}/app/book`,
    ],
    { stdio: 'ignore' }
  );

  try {
    const wsUrl = await getWsUrl(port);
    console.log('Connected to CDP at:', wsUrl);
    const { sendCommand, socket } = await createCdpConnection(wsUrl);

    const pageWsRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/json`, (r) => {
        let body = '';
        r.on('data', (c) => (body += c));
        r.on('end', () => resolve(JSON.parse(body)));
      }).on('error', reject);
    });

    const targetInfo = pageWsRes.find((t) => t.type === 'page') || pageWsRes[0];
    const pageConn = await createCdpConnection(targetInfo.webSocketDebuggerUrl);

    await pageConn.sendCommand('Page.enable');
    await pageConn.sendCommand('DOM.enable');
    await pageConn.sendCommand('Runtime.enable');

    console.log('\n--- 1. CONFIGURING MOBILE VIEWPORT (390px) ---');
    await pageConn.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });

    console.log(`Navigating to http://127.0.0.1:${serverPort}/app/book...`);
    await pageConn.sendCommand('Page.navigate', { url: `http://127.0.0.1:${serverPort}/app/book` });
    await new Promise((r) => setTimeout(r, 2000));

    // Wait for "Continue to Destination" button to appear (meaning PassengerBookView has rendered)
    console.log('Waiting for PassengerBookView "Continue to Destination" button...');
    const foundStep1 = await waitForCondition(
      pageConn,
      `Boolean(Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Continue to Destination')))`
    );
    console.log('Step 1 button found:', foundStep1);

    // Enter flight number if empty and click "Continue to Destination"
    console.log('Clicking "Continue to Destination" to activate Step 2...');
    await pageConn.sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const input = document.querySelector('input[placeholder*="Flight"]') || document.querySelector('input');
        if (input && !input.value) {
          input.value = '6E 5312';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Continue to Destination'));
        if (btn) btn.click();
      })()`,
    });

    // Wait for the Mapbox GL canvas to mount
    console.log('Waiting for Mapbox GL canvas to mount...');
    await waitForCondition(pageConn, `Boolean(document.querySelector('.mapboxgl-canvas') || document.querySelector('canvas'))`, 12000);

    // Wait 5 seconds for vector tiles, road networks, markers, and polyline route to render
    console.log('Rendering 3D vector tiles, route polylines, and custom markers...');
    await new Promise((r) => setTimeout(r, 5500));

    // Audit map elements
    const auditRes = await pageConn.sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const mapCanvas = document.querySelector('.mapboxgl-canvas') || document.querySelector('canvas');
        const pickupMarker = document.querySelector('.aeropool-pickup-marker');
        const destMarker = document.querySelector('.aeropool-destination-marker');
        const locateBtn = document.querySelector('button[title*="Locate"]');
        const zoomInBtn = document.querySelector('button[title="Zoom in"]');
        const zoomOutBtn = document.querySelector('button[title="Zoom out"]');
        const layerBtn = document.querySelector('button[title="Toggle Map Style"]');

        return {
          hasMapCanvas: Boolean(mapCanvas),
          canvasWidth: mapCanvas ? mapCanvas.clientWidth : 0,
          canvasHeight: mapCanvas ? mapCanvas.clientHeight : 0,
          hasPickupMarker: Boolean(pickupMarker),
          pickupMarkerText: pickupMarker ? pickupMarker.innerText.replace(/\\n/g, ' ').trim() : null,
          hasDestinationMarker: Boolean(destMarker),
          hasLocateButton: Boolean(locateBtn),
          hasZoomIn: Boolean(zoomInBtn),
          hasZoomOut: Boolean(zoomOutBtn),
          hasLayerToggle: Boolean(layerBtn),
          mapboxGLAvailable: typeof window.mapboxgl !== 'undefined',
        };
      })()`,
      returnByValue: true,
    });

    console.log('Mobile Map Audit Result (390px):', JSON.stringify(auditRes.result.value, null, 2));

    // Scroll to position map prominently in the frame
    await pageConn.sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const mapEl = document.querySelector('.mapboxgl-canvas')?.parentElement?.parentElement;
        if (mapEl) {
          mapEl.scrollIntoView({ behavior: 'instant', block: 'center' });
        }
      })()`,
    });
    await new Promise((r) => setTimeout(r, 600));

    // Capture Mobile Screenshot for Default BKC
    const mobileShot = await pageConn.sendCommand('Page.captureScreenshot', { format: 'png' });
    const mobilePath = path.join(screenshotDir, 'interactive-map-mobile-390px.png');
    fs.writeFileSync(mobilePath, Buffer.from(mobileShot.data, 'base64'));
    console.log('📸 Saved Mobile Screenshot:', mobilePath);

    // --- 2. AUDIT ALL 6 POPULAR MUMBAI DESTINATIONS ---
    console.log('\n--- 2. AUDITING ALL 6 POPULAR MUMBAI HUBS INDIVIDUALLY ---');
    const destinations = [
      { id: 'bkc-bandra', name: 'Bandra Kurla Complex', short: 'bkc' },
      { id: 'bandra-west', name: 'Bandra West', short: 'bandra-west' },
      { id: 'lower-parel-worli', name: 'Lower Parel & Worli', short: 'lower-parel-worli' },
      { id: 'nariman-colaba', name: 'South Mumbai', short: 'south-mumbai' },
      { id: 'powai-hiranandani', name: 'Powai', short: 'powai' },
      { id: 'andheri-lokhandwala', name: 'Andheri West', short: 'andheri-west' },
    ];

    const hubAuditResults = [];

    for (let i = 0; i < destinations.length; i++) {
      const dest = destinations[i];
      console.log(`\nTesting Hub [${i + 1}/6]: ${dest.name} (${dest.id})`);

      // Click the hub button
      const clickResult = await pageConn.sendCommand('Runtime.evaluate', {
        expression: `(() => {
          const btn = document.querySelector('[data-testid="hub-${dest.id}"]') ||
                      Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('${dest.name}'));
          if (btn) {
            btn.click();
            return { clicked: true, text: btn.innerText.replace(/\\n/g, ' ') };
          }
          return { clicked: false };
        })()`,
        returnByValue: true,
      });
      console.log('Hub button clicked:', clickResult.result.value);

      // Wait 3.5s for route geometry calculation, marker repositioning, and camera bounds animation
      await new Promise((r) => setTimeout(r, 3500));

      // Inspect updated map and destination card state
      const hubState = await pageConn.sendCommand('Runtime.evaluate', {
        expression: `(() => {
          const canvas = document.querySelector('.mapboxgl-canvas') || document.querySelector('canvas');
          const pickupMarker = document.querySelector('.aeropool-pickup-marker');
          const destMarker = document.querySelector('.aeropool-destination-marker');
          const targetCard = Array.from(document.querySelectorAll('div')).find(d => (d.innerText || '').includes('Target Drop-Off Point'));
          
          let cardText = '';
          if (targetCard) {
            cardText = targetCard.innerText.replace(/\\n/g, ' | ');
          }

          const btn = document.querySelector('[data-testid="hub-${dest.id}"]') ||
                      Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('${dest.name}'));
          const isPressed = btn ? btn.getAttribute('aria-pressed') : null;

          return {
            hasCanvas: Boolean(canvas),
            canvasWidth: canvas ? canvas.clientWidth : 0,
            canvasHeight: canvas ? canvas.clientHeight : 0,
            hasPickupMarker: Boolean(pickupMarker),
            hasDestMarker: Boolean(destMarker),
            isAriaPressed: isPressed,
            cardSummary: cardText.slice(0, 160),
          };
        })()`,
        returnByValue: true,
      });

      console.log(`Hub [${i + 1}/6] State:`, JSON.stringify(hubState.result.value, null, 2));
      hubAuditResults.push({
        index: i + 1,
        ...dest,
        state: hubState.result.value,
      });

      // Capture screenshot for this destination
      const shot = await pageConn.sendCommand('Page.captureScreenshot', { format: 'png' });
      const filename = `destination-${i + 1}-${dest.short}-390px.png`;
      const fullPath = path.join(screenshotDir, filename);
      fs.writeFileSync(fullPath, Buffer.from(shot.data, 'base64'));
      console.log(`📸 Saved destination screenshot: ${filename}`);
    }

    fs.writeFileSync('scratch/hub_audit_results.json', JSON.stringify(hubAuditResults, null, 2));

    // --- 3. SATELLITE / MIDNIGHT MAP STYLE TOGGLE ---
    console.log('\n--- 3. TESTING SATELLITE / MIDNIGHT STYLE TOGGLE ---');
    await pageConn.sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const toggleBtn = document.querySelector('button[title="Toggle Map Style"]');
        if (toggleBtn) toggleBtn.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 2500));
    const satShot = await pageConn.sendCommand('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotDir, 'map-control-satellite-390px.png'), Buffer.from(satShot.data, 'base64'));
    console.log('📸 Saved satellite mode screenshot: map-control-satellite-390px.png');

    // Toggle back to Midnight
    await pageConn.sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const toggleBtn = document.querySelector('button[title="Toggle Map Style"]');
        if (toggleBtn) toggleBtn.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 2000));

    // --- 4. RESPONSIVE VIEWPORT AUDIT (360px & 430px) ---
    console.log('\n--- 4. TESTING RESPONSIVE VIEWPORTS (360px & 430px) ---');
    await pageConn.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 360,
      height: 780,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await new Promise((r) => setTimeout(r, 1000));
    const shot360 = await pageConn.sendCommand('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotDir, 'map-viewport-360px.png'), Buffer.from(shot360.data, 'base64'));
    console.log('📸 Saved 360px viewport screenshot: map-viewport-360px.png');

    await pageConn.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 430,
      height: 932,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await new Promise((r) => setTimeout(r, 1000));
    const shot430 = await pageConn.sendCommand('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotDir, 'map-viewport-430px.png'), Buffer.from(shot430.data, 'base64'));
    console.log('📸 Saved 430px viewport screenshot: map-viewport-430px.png');

    console.log('\n--- 5. DESKTOP 1280px AUDIT & VERIFICATION ---');
    await pageConn.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1.5,
      mobile: false,
    });

    await pageConn.sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const mapEl = document.querySelector('.mapboxgl-canvas')?.parentElement?.parentElement;
        if (mapEl) {
          mapEl.scrollIntoView({ behavior: 'instant', block: 'center' });
        }
      })()`,
    });
    await new Promise((r) => setTimeout(r, 2000));

    const desktopShot = await pageConn.sendCommand('Page.captureScreenshot', { format: 'png' });
    const desktopPath = path.join(screenshotDir, 'interactive-map-desktop-1280px.png');
    fs.writeFileSync(desktopPath, Buffer.from(desktopShot.data, 'base64'));
    console.log('📸 Saved Desktop Screenshot:', desktopPath);

    // Test Zoom In Click
    console.log('\n--- 6. TESTING REAL INTERACTIVE MAP ZOOM CONTROLS ---');
    const zoomTestRes = await pageConn.sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const zoomIn = document.querySelector('button[title="Zoom in"]');
        if (zoomIn) {
          zoomIn.click();
          return { zoomInClicked: true };
        }
        return { zoomInClicked: false };
      })()`,
      returnByValue: true,
    });
    console.log('Zoom in control clicked:', zoomTestRes.result.value);

    // Wait and verify camera moved
    await new Promise((r) => setTimeout(r, 600));

    // Test Zoom Out Click
    const zoomOutTestRes = await pageConn.sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const zoomOut = document.querySelector('button[title="Zoom out"]');
        if (zoomOut) {
          zoomOut.click();
          return { zoomOutClicked: true };
        }
        return { zoomOutClicked: false };
      })()`,
      returnByValue: true,
    });
    console.log('Zoom out control clicked:', zoomOutTestRes.result.value);

    pageConn.socket.destroy();
    socket.destroy();
  } finally {
    try { server.close(); } catch {}
    chromeProcess.kill();
    try {
      fs.rmSync(tempProfile, { recursive: true, force: true });
    } catch {
      // ignore cleanup
    }
  }
}

runMapVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
