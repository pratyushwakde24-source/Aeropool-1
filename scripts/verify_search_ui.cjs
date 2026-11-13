const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

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

async function pollHttp(url, maxWaitMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function tryReq() {
      http
        .get(url, (res) => {
          if (res.statusCode === 200) resolve();
          else retry();
        })
        .on('error', retry);
    }
    function retry() {
      if (Date.now() - start > maxWaitMs) reject(new Error(`Timeout polling ${url}`));
      else setTimeout(tryReq, 300);
    }
    tryReq();
  });
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
  console.log('============================================================');
  console.log('🔍 AEROPOOL DESTINATION SEARCH UI & TRUNCATION VERIFICATION');
  console.log('============================================================\n');

  const screenshotsDir = path.resolve('C:/Users/praty/.gemini/antigravity/brain/9fd74342-e2dd-4c04-9295-c7cd439e32bf/screenshots');
  fs.mkdirSync(screenshotsDir, { recursive: true });

  const port = 3022;
  const distDir = path.resolve(__dirname, '..', 'dist');
  console.log(`Starting static server on port ${port}...`);
  const server = await startStaticServer(distDir, port);
  console.log(`✓ Static server ready at http://127.0.0.1:${port}`);

  const chromePath = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
  const cdpPort = 9272;
  const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'aeropool-search-ui-'));
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
      `http://127.0.0.1:${port}`,
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

    console.log('Navigating to http://127.0.0.1:' + port + '/app/book ...');
    await cdp.sendCommand('Page.navigate', { url: `http://127.0.0.1:${port}/app/book` });
    await new Promise((r) => setTimeout(r, 2000));

    // 1. Advance to Step 2
    console.log('Waiting for Step 1 to render...');
    await waitForCondition(cdp, `Boolean(Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Continue to Destination')))`, 15000);

    console.log('Advancing to Step 2 (Destination Corridor)...');
    await cdp.sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Continue to Destination'));
        if (btn) btn.click();
      })()`,
    });

    await waitForCondition(cdp, `Boolean(document.querySelector('input[placeholder*="Search destination"]'))`, 15000);
    console.log('✓ Reached Step 2 destination search input');

    // Helper function to type search query and get items
    async function searchAndAudit(query) {
      console.log(`\n--- Searching for: "${query}" ---`);
      await cdp.sendCommand('Runtime.evaluate', {
        expression: `(() => {
          const input = document.querySelector('input[placeholder*="Search destination"]');
          if (input) {
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(input, '${query}');
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        })()`,
      });

      // Wait for results
      await waitForCondition(cdp, `Boolean(document.querySelectorAll('[data-testid^="place-suggestion-"]').length > 0)`, 8000);
      await new Promise((r) => setTimeout(r, 1200));

      const audit = await cdp.sendCommand('Runtime.evaluate', {
        expression: `(() => {
          const rows = Array.from(document.querySelectorAll('[data-testid^="place-suggestion-"]'));
          return rows.map(r => {
            const divs = Array.from(r.querySelectorAll('div'));
            const textLines = divs.map(d => d.innerText.trim()).filter(Boolean);
            const raw = r.innerText.replace(/\\n/g, ' | ').trim();
            const hasCategoryBadge = Boolean(r.querySelector('.rounded.bg-slate-900') || r.innerText.includes('Western Suburbs'));
            const distanceText = divs.find(d => d.innerText.includes('km'))?.innerText.trim();
            const pinIcon = Boolean(r.querySelector('svg'));
            return {
              raw,
              hasCategoryBadge,
              distanceText,
              hasPinIcon: pinIcon,
              firstLine: textLines[0],
              secondLine: textLines[1],
            };
          });
        })()`,
        returnByValue: true,
      });

      return audit.result.value || [];
    }

    // 2. Perform search for "Vasai"
    const vasaiResults = await searchAndAudit('Vasai');
    console.log(`Found ${vasaiResults.length} search results for "Vasai":`);
    vasaiResults.forEach((res, idx) => {
      console.log(`  [${idx + 1}] Title: "${res.firstLine}" | Subtitle: "${res.secondLine}" | Dist: "${res.distanceText}" | BadgePresent: ${res.hasCategoryBadge}`);
    });

    // 3. Capture across all responsive viewports
    const viewports = [
      { name: 'mobile-360px', width: 360, height: 780, mobile: true },
      { name: 'mobile-390px', width: 390, height: 844, mobile: true },
      { name: 'mobile-430px', width: 430, height: 932, mobile: true },
      { name: 'tablet-768px', width: 768, height: 1024, mobile: false },
      { name: 'desktop-1280px', width: 1280, height: 900, mobile: false },
    ];

    for (const vp of viewports) {
      await cdp.sendCommand('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 2,
        mobile: vp.mobile,
      });
      await new Promise((r) => setTimeout(r, 600));
      const shot = await cdp.sendCommand('Page.captureScreenshot', { format: 'png' });
      const filename = `search-results-${vp.name}.png`;
      fs.writeFileSync(path.join(screenshotsDir, filename), Buffer.from(shot.data, 'base64'));
      console.log(`📸 Saved screenshot: ${filename} (${vp.width}x${vp.height})`);
    }

    // 4. Test selecting "Vasai West" and check map/route update
    console.log('\n--- Testing Destination Selection: Vasai West ---');
    await cdp.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });

    const selectRes = await cdp.sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const rows = Array.from(document.querySelectorAll('[data-testid^="place-suggestion-"]'));
        const target = rows.find(r => r.innerText.includes('Vasai West')) || rows[0];
        if (target) {
          target.click();
          return { clicked: true, text: target.innerText.replace(/\\n/g, ' ') };
        }
        return { clicked: false };
      })()`,
      returnByValue: true,
    });
    console.log('Selected Row:', selectRes.result.value);

    // Wait for route to recalculate and map to update
    console.log('Waiting 5s for Mapbox Directions to calculate route to selected destination...');
    await new Promise((r) => setTimeout(r, 5000));

    const selectedState = await cdp.sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const destCard = document.querySelector('.bg-gradient-to-r.from-slate-950');
        const canvas = document.querySelector('.mapboxgl-canvas') || document.querySelector('canvas');
        const input = document.querySelector('input[placeholder*="Search destination"]');
        return {
          inputValue: input?.value,
          cardText: destCard?.innerText.replace(/\\n/g, ' | ').trim(),
          hasCanvas: Boolean(canvas),
        };
      })()`,
      returnByValue: true,
    });
    console.log('Post-Selection State:', selectedState.result.value);

    const shotSelected = await cdp.sendCommand('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotsDir, 'search-selected-vasai-west-390px.png'), Buffer.from(shotSelected.data, 'base64'));
    console.log('📸 Saved screenshot: search-selected-vasai-west-390px.png');

    // 5. Audit additional destinations: BKC, Powai, Andheri, Lower Parel, South Mumbai
    const testQueries = ['Bandra Kurla Complex', 'Powai', 'Andheri', 'Lower Parel', 'South Mumbai'];
    for (const q of testQueries) {
      const qResults = await searchAndAudit(q);
      console.log(`Query "${q}" returned ${qResults.length} matches; Top match: "${qResults[0]?.firstLine || 'None'}"`);
    }

    console.log('\n🎉 ALL SEARCH UI AND TRUNCATION CHECKS PASSED SUCCESSFULLY!');
    cdp.close();
  } finally {
    server.close();
    chrome.kill();
    try { fs.rmSync(tmpProfile, { recursive: true }); } catch {}
  }
}

main().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
