const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// WebSocket implementation using standard Node.js
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
          } catch (e) {
            // ignore partial json
          }
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
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };

  const server = http.createServer((req, res) => {
    let filePath = path.join(dir, req.url.split('?')[0]);
    if (filePath.endsWith(path.sep) || !path.extname(filePath)) {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      } else if (!fs.existsSync(filePath)) {
        filePath = path.join(dir, 'index.html'); // SPA fallback
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

async function main() {
  console.log('--- 1. Starting Built-in Static Server for dist/ on port 3000 ---');
  const distDir = path.resolve(__dirname, '..', 'dist');
  const server = await startStaticServer(distDir, 3000);
  console.log('✓ Static server listening at http://127.0.0.1:3000');

  console.log('--- 2. Starting Chrome in Headless CDP mode ---');
  const chromePath = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';

  const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'aeropool-chrome-profile-'));
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--remote-debugging-port=9223',
      '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${tmpProfile}`,
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      'http://127.0.0.1:3000',
    ],
    { stdio: 'ignore' }
  );

  await pollHttp('http://127.0.0.1:9223/json/list', 15000);
  console.log('✓ Chrome CDP listening on port 9223');

  const targets = await new Promise((res, rej) => {
    http.get('http://127.0.0.1:9223/json/list', (r) => {
      let data = '';
      r.on('data', (c) => (data += c));
      r.on('end', () => res(JSON.parse(data)));
    }).on('error', rej);
  });

  const pageTarget = targets.find((t) => t.type === 'page');
  if (!pageTarget) throw new Error('No page target found');

  const cdp = await createCdpConnection(pageTarget.webSocketDebuggerUrl);
  console.log('✓ Connected to CDP page WebSocket');

  await cdp.sendCommand('Page.enable');
  await cdp.sendCommand('DOM.enable');
  await cdp.sendCommand('Runtime.enable');

  console.log('--- 3. Setting Viewport to Mobile (390 x 844, scale 3) ---');
  await cdp.sendCommand('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
  });

  await cdp.sendCommand('Page.navigate', { url: 'http://127.0.0.1:3000' });
  await new Promise((r) => setTimeout(r, 2000));

  console.log('--- 4. Inspecting DOM elements on Mobile View ---');
  const evalResult = await cdp.sendCommand('Runtime.evaluate', {
    expression: `(() => {
      return {
        title: document.title,
        headingText: document.querySelector('h1')?.innerText,
        pickupText: document.body.innerText.includes('CSMIA – Terminal 2') || document.body.innerText.includes('Pickup (Airport)'),
        dropToText: document.body.innerText.includes('Drop to') || document.body.innerText.includes('Enter your destination'),
        flightDetailsText: document.body.innerText.includes('Flight Details'),
        passengersText: document.body.innerText.includes('1 passenger'),
        findRideCta: Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Find a Pool Ride')),
        howItWorksCard: Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('How It Works')),
        safetyKycCard: Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Safety & KYC')),
        fleetPartnerCard: Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Fleet Partner')),
        supportCard: Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Support')),
        saveBanner: document.body.innerText.includes('Save up to 40%'),
        atCsmiaCard: document.body.innerText.includes('At CSMIA'),
        mobileBottomNavHome: Array.from(document.querySelectorAll('nav[aria-label="Mobile Navigation"] button')).some(b => b.innerText.includes('Home')),
        mobileBottomNavRides: Array.from(document.querySelectorAll('nav[aria-label="Mobile Navigation"] button')).some(b => b.innerText.includes('My Rides')),
        mobileBottomNavSafety: Array.from(document.querySelectorAll('nav[aria-label="Mobile Navigation"] button')).some(b => b.innerText.includes('Safety')),
        mobileBottomNavProfile: Array.from(document.querySelectorAll('nav[aria-label="Mobile Navigation"] button')).some(b => b.innerText.includes('Profile')),
      };
    })()`,
    returnByValue: true,
  });

  console.log('DOM Evaluation Output:\n', JSON.stringify(evalResult.result.value, null, 2));

  console.log('--- 5. Testing Interactive Controls ---');
  // Test A: Click Terminal Selector
  const termClick = await cdp.sendCommand('Runtime.evaluate', {
    expression: `(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Pickup (Airport)'));
      if (btn) { btn.click(); return true; }
      return false;
    })()`,
    returnByValue: true,
  });
  console.log('Terminal selector clicked:', termClick.result.value);
  await new Promise((r) => setTimeout(r, 600));

  const modalOpened = await cdp.sendCommand('Runtime.evaluate', {
    expression: `document.body.innerText.includes('Select Departure Terminal')`,
    returnByValue: true,
  });
  console.log('Terminal modal opened:', modalOpened.result.value);

  // Close modal
  await cdp.sendCommand('Runtime.evaluate', {
    expression: `(() => {
      const closeBtn = document.querySelector('button[aria-label="Close"]') || Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Terminal 2'));
      if (closeBtn) closeBtn.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 400));

  console.log('--- 6. Capturing Mobile Screenshot (390px) ---');
  fs.mkdirSync('public/screenshots', { recursive: true });
  const mobileShot = await cdp.sendCommand('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('public/screenshots/aeropool-mobile-home-390px.png', Buffer.from(mobileShot.data, 'base64'));
  console.log('✓ Saved public/screenshots/aeropool-mobile-home-390px.png');

  console.log('--- 7. Setting Viewport to Desktop (1280 x 800) & Capturing ---');
  await cdp.sendCommand('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await new Promise((r) => setTimeout(r, 1000));
  const desktopShot = await cdp.sendCommand('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('public/screenshots/aeropool-desktop-home-1280px.png', Buffer.from(desktopShot.data, 'base64'));
  console.log('✓ Saved public/screenshots/aeropool-desktop-home-1280px.png');

  console.log('--- 8. Cleanup & Shutdown ---');
  cdp.close();
  chrome.kill();
  server.close();
  try {
    fs.rmSync(tmpProfile, { recursive: true, force: true });
  } catch (e) {}

  console.log('✓ Verification complete!');
  process.exit(0);
}

main().catch((err) => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});

