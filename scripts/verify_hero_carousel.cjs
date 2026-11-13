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
            // ignore
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

async function main() {
  console.log('============================================================');
  console.log('🔍 AEROPOOL COMPACT HERO CAROUSEL QA & SCREENSHOT SUITE');
  console.log('============================================================\n');

  const screenshotsDir = path.resolve(__dirname, '..', 'public', 'screenshots');
  fs.mkdirSync(screenshotsDir, { recursive: true });

  console.log('--- 1. Launching Static Server on Port 3006 ---');
  const distDir = path.resolve(__dirname, '..', 'dist');
  const server = await startStaticServer(distDir, 3006);
  console.log('✓ Server running at http://127.0.0.1:3006');

  console.log('--- 2. Spawning Headless Chrome ---');
  const chromePath = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';

  const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'aeropool-compact-qa-'));
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--remote-debugging-port=9225',
      '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${tmpProfile}`,
      '--no-first-run',
      '--no-default-browser-check',
      'http://127.0.0.1:3006',
    ],
    { stdio: 'ignore' }
  );

  await pollHttp('http://127.0.0.1:9225/json/list', 15000);
  console.log('✓ Chrome listening on CDP port 9225');

  const targets = await new Promise((res, rej) => {
    http.get('http://127.0.0.1:9225/json/list', (r) => {
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

  // Set Mobile Viewport (390 x 844 iPhone 14 standard)
  console.log('\n--- 3. Setting Mobile Viewport: 390x844 ---');
  await cdp.sendCommand('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
  });

  await cdp.sendCommand('Page.navigate', { url: 'http://127.0.0.1:3006' });
  await new Promise((r) => setTimeout(r, 1500));

  async function takeShot(filename) {
    const shot = await cdp.sendCommand('Page.captureScreenshot', { format: 'png' });
    const fullPath = path.join(screenshotsDir, filename);
    fs.writeFileSync(fullPath, Buffer.from(shot.data, 'base64'));
    console.log(`📸 Saved screenshot: ${filename}`);
  }

  // --- 4. Verify Dimensions and Booking Card Position ---
  console.log('\n--- 4. Verifying Compact Dimensions & Booking Card Position ---');
  const metrics = await cdp.sendCommand('Runtime.evaluate', {
    expression: `(() => {
      const hero = document.querySelector('[aria-roledescription="carousel"]');
      const bookingCard = document.getElementById('booking-card') || document.querySelector('section:nth-of-type(2)');
      const heroRect = hero?.getBoundingClientRect();
      const bookingRect = bookingCard?.getBoundingClientRect();
      const indicators = document.querySelectorAll('[role="tab"]');
      
      return {
        heroWidth: Math.round(heroRect?.width || 0),
        heroHeight: Math.round(heroRect?.height || 0),
        heroTop: Math.round(heroRect?.top || 0),
        bookingTop: Math.round(bookingRect?.top || 0),
        distanceBetweenCards: Math.round((bookingRect?.top || 0) - (heroRect?.bottom || 0)),
        indicatorCount: indicators.length,
        hasNoLargeBadges: !document.querySelector('.tracking-wider'),
        hasNoCtaButtons: !hero?.querySelector('button:not([role="tab"])'),
      };
    })()`,
    returnByValue: true,
  });
  console.log('Hero Card & Layout Verification:', metrics.result.value);

  // --- 5. Capture All 4 Slides at 390px ---
  console.log('\n--- 5. Testing Slide Indicators (0, 1, 2, 3) & Capturing Mobile 390px Slides ---');
  for (let i = 0; i < 4; i++) {
    await cdp.sendCommand('Runtime.evaluate', {
      expression: `document.querySelectorAll('[role="tab"]')[${i}].click()`,
    });
    await new Promise((r) => setTimeout(r, 600));

    const slideInfo = await cdp.sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const activeSlide = document.querySelector('[aria-roledescription="slide"]');
        const h1 = activeSlide?.querySelector('h1')?.innerText?.replace(/\\n/g, ' ');
        const desc = activeSlide?.querySelector('p')?.innerText;
        const hero = document.querySelector('[aria-roledescription="carousel"]');
        const height = Math.round(hero?.getBoundingClientRect()?.height || 0);
        return { slideIndex: ${i}, h1, desc, cardHeight: height };
      })()`,
      returnByValue: true,
    });
    console.log(`✓ Slide ${i + 1} State:`, slideInfo.result.value);
    await takeShot(`compact-slide-${i + 1}-mobile-390px.png`);
  }

  // --- 6. Test Automatic Rotation ---
  console.log('\n--- 6. Testing 5-Second Automatic Rotation ---');
  await cdp.sendCommand('Runtime.evaluate', {
    expression: `document.querySelectorAll('[role="tab"]')[0].click()`,
  });
  await new Promise((r) => setTimeout(r, 500));
  const beforeHeading = await cdp.sendCommand('Runtime.evaluate', {
    expression: `document.querySelector('[aria-roledescription="slide"] h1')?.innerText`,
    returnByValue: true,
  });
  console.log(`Initial heading: "${beforeHeading.result.value?.replace(/\n/g, ' ')}"`);
  console.log('Waiting 5.3s for automatic rotation to trigger...');
  await new Promise((r) => setTimeout(r, 5300));
  const afterHeading = await cdp.sendCommand('Runtime.evaluate', {
    expression: `document.querySelector('[aria-roledescription="slide"] h1')?.innerText`,
    returnByValue: true,
  });
  console.log(`Heading after 5s: "${afterHeading.result.value?.replace(/\n/g, ' ')}"`);
  const rotated = beforeHeading.result.value !== afterHeading.result.value;
  console.log(`✓ Automatic rotation: ${rotated ? 'PASS' : 'FAIL'}`);

  // --- 7. Test Mobile Touch Swipe ---
  console.log('\n--- 7. Testing Mobile Touch Swipe ---');
  await cdp.sendCommand('Runtime.evaluate', {
    expression: `(() => {
      const carousel = document.querySelector('[aria-roledescription="carousel"]');
      if (!carousel) return false;
      const rect = carousel.getBoundingClientRect();
      const startX = rect.left + rect.width * 0.8;
      const endX = rect.left + rect.width * 0.2;
      const y = rect.top + rect.height / 2;

      const touchStart = new Touch({ identifier: 1, target: carousel, clientX: startX, clientY: y });
      const touchEnd = new Touch({ identifier: 1, target: carousel, clientX: endX, clientY: y });

      carousel.dispatchEvent(new TouchEvent('touchstart', { touches: [touchStart], bubbles: true }));
      carousel.dispatchEvent(new TouchEvent('touchmove', { touches: [touchEnd], bubbles: true }));
      carousel.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [touchEnd], bubbles: true }));
      return true;
    })()`,
  });
  await new Promise((r) => setTimeout(r, 600));
  const swipeHeading = await cdp.sendCommand('Runtime.evaluate', {
    expression: `document.querySelector('[aria-roledescription="slide"] h1')?.innerText`,
    returnByValue: true,
  });
  console.log(`✓ Heading after touch swipe: "${swipeHeading.result.value?.replace(/\n/g, ' ')}"`);

  // --- 8. Capture Across Responsive Breakpoints (360px, 390px, 430px) ---
  console.log('\n--- 8. Testing Responsive Breakpoints (360px, 390px, 430px) ---');
  for (const bp of [360, 390, 430]) {
    await cdp.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: bp,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
    });
    await new Promise((r) => setTimeout(r, 400));
    const bpMetrics = await cdp.sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const hero = document.querySelector('[aria-roledescription="carousel"]');
        return Math.round(hero?.getBoundingClientRect()?.height || 0);
      })()`,
      returnByValue: true,
    });
    console.log(`✓ Viewport ${bp}px: Carousel Height = ${bpMetrics.result.value}px`);
    await takeShot(`compact-carousel-${bp}px.png`);
  }

  // Shutdown
  cdp.close();
  chrome.kill();
  server.close();
  try {
    fs.rmSync(tmpProfile, { recursive: true, force: true });
  } catch (e) {}

  console.log('\n============================================================');
  console.log('🎉 COMPACT HERO CAROUSEL QA VERIFICATION COMPLETE!');
  console.log('============================================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
  process.exit(1);
});
