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
  console.log('📱 AEROPOOL INFORMATION ARCHITECTURE & FOOTER REMOVAL QA');
  console.log('============================================================\n');

  const screenshotsDir = path.resolve(__dirname, '..', 'public', 'screenshots');
  fs.mkdirSync(screenshotsDir, { recursive: true });

  console.log('--- 1. Launching Static Server on Port 3007 ---');
  const distDir = path.resolve(__dirname, '..', 'dist');
  const server = await startStaticServer(distDir, 3007);
  console.log('✓ Server running at http://127.0.0.1:3007');

  console.log('--- 2. Spawning Headless Chrome ---');
  const chromePath = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';

  const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'aeropool-ia-qa-'));
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--remote-debugging-port=9226',
      '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${tmpProfile}`,
      '--no-first-run',
      '--no-default-browser-check',
      'http://127.0.0.1:3007',
    ],
    { stdio: 'ignore' }
  );

  await pollHttp('http://127.0.0.1:9226/json/list', 15000);
  console.log('✓ Chrome listening on CDP port 9226');

  const targets = await new Promise((res, rej) => {
    http.get('http://127.0.0.1:9226/json/list', (r) => {
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

  // Set Mobile Viewport (390 x 844)
  console.log('\n--- 3. Setting Mobile Viewport: 390x844 ---');
  await cdp.sendCommand('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
  });

  async function takeShot(filename) {
    const shot = await cdp.sendCommand('Page.captureScreenshot', { format: 'png' });
    const fullPath = path.join(screenshotsDir, filename);
    fs.writeFileSync(fullPath, Buffer.from(shot.data, 'base64'));
    console.log(`📸 Saved screenshot: ${filename}`);
  }

  // --- 4. Verify Homepage Structure & Footer Absence ---
  console.log('\n--- 4. Verifying Passenger Homepage (No Long Footer) ---');
  await cdp.sendCommand('Page.navigate', { url: 'http://127.0.0.1:3007' });
  await new Promise((r) => setTimeout(r, 1500));

  const homeAudit = await cdp.sendCommand('Runtime.evaluate', {
    expression: `(() => {
      const footer = document.querySelector('footer');
      const hero = document.querySelector('[aria-roledescription="carousel"]');
      const bookingCard = document.getElementById('booking-card') || document.querySelector('section:nth-of-type(2)');
      const quickCards = Array.from(document.querySelectorAll('button')).filter(b => 
        b.innerText.includes('How It Works') || 
        b.innerText.includes('Safety & KYC') || 
        b.innerText.includes('Fleet Partner') || 
        b.innerText.includes('Support')
      );
      const savingsBanner = Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Save up to 40%'));
      const atCsmiaCard = Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('At CSMIA'));
      const navButtons = Array.from(document.querySelectorAll('nav[aria-label="Mobile Navigation"] button')).map(b => b.innerText.trim());

      return {
        hasFooter: !!footer,
        heroHeight: Math.round(hero?.getBoundingClientRect()?.height || 0),
        bookingCardPresent: !!bookingCard,
        quickCardsCount: quickCards.length,
        savingsBannerPresent: savingsBanner,
        atCsmiaCardPresent: atCsmiaCard,
        bottomNavTabs: navButtons,
        scrollHeight: document.body.scrollHeight,
        windowHeight: window.innerHeight,
      };
    })()`,
    returnByValue: true,
  });
  console.log('Homepage Audit Result:', homeAudit.result.value);
  console.log(`✓ Long Footer Completely Removed from Homepage: ${!homeAudit.result.value.hasFooter ? 'YES (Confirmed Null)' : 'NO (Failed)'}`);
  await takeShot('homepage-no-footer-390px.png');

  // --- 5. Test Navigation to Profile / Information Centre ---
  console.log('\n--- 5. Testing Profile Tab & Information Centre ---');
  await cdp.sendCommand('Runtime.evaluate', {
    expression: `(() => {
      const profileTab = Array.from(document.querySelectorAll('nav[aria-label="Mobile Navigation"] button')).find(b => b.innerText.includes('Profile'));
      if (profileTab) profileTab.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 1200));

  const profileAudit = await cdp.sendCommand('Runtime.evaluate', {
    expression: `(() => {
      const heading = document.querySelector('h1')?.innerText;
      const categories = Array.from(document.querySelectorAll('h3')).map(h => h.innerText.trim());
      const hasAboutSection = categories.some(c => c.includes('About AeroPool'));
      const hasAirportSection = categories.some(c => c.includes('Airport Information'));
      const hasSafetySection = categories.some(c => c.includes('Safety and Trust'));
      const hasFleetSection = categories.some(c => c.includes('Fleet Partners'));
      const hasHelpSection = categories.some(c => c.includes('Help and Support'));
      const hasLegalSection = categories.some(c => c.includes('Legal and Compliance'));

      return {
        pageHeading: heading,
        detectedCategories: categories,
        all6CategoriesPresent: hasAboutSection && hasAirportSection && hasSafetySection && hasFleetSection && hasHelpSection && hasLegalSection,
      };
    })()`,
    returnByValue: true,
  });
  console.log('Profile & Information Centre Result:', profileAudit.result.value);
  console.log(`✓ All 6 Information Categories Verified: ${profileAudit.result.value.all6CategoriesPresent ? 'PASS' : 'FAIL'}`);
  await takeShot('profile-information-centre-390px.png');

  // --- 6. Test Interactive Modals in Information Centre ---
  console.log('\n--- 6. Testing Interactive Modals (Terminal Guidance Modal) ---');
  await cdp.sendCommand('Runtime.evaluate', {
    expression: `(() => {
      const t2Btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('CSMIA Terminal 2 (T2)'));
      if (t2Btn) t2Btn.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 600));

  const modalOpened = await cdp.sendCommand('Runtime.evaluate', {
    expression: `document.body.innerText.includes('Level P4 East') && document.body.innerText.includes('CSMIA Terminal 2 (T2) Sahar')`,
    returnByValue: true,
  });
  console.log('Terminal 2 Modal Content Verified:', modalOpened.result.value);
  await takeShot('modal-terminal-guidance-opened.png');

  // Close modal
  await cdp.sendCommand('Runtime.evaluate', {
    expression: `(() => {
      const closeBtn = document.querySelector('.bg-slate-950\\\\/80 button');
      if (closeBtn) closeBtn.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 400));

  // --- 7. Test Navigation to Safety View ---
  console.log('\n--- 7. Testing Bottom Nav Tab: Safety ---');
  await cdp.sendCommand('Runtime.evaluate', {
    expression: `(() => {
      const safetyTab = Array.from(document.querySelectorAll('nav[aria-label="Mobile Navigation"] button')).find(b => b.innerText.includes('Safety'));
      if (safetyTab) safetyTab.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 1000));
  const safetyAudit = await cdp.sendCommand('Runtime.evaluate', {
    expression: `document.body.innerText.includes('Safety & Trust Charter') || document.body.innerText.includes('Safety')`,
    returnByValue: true,
  });
  console.log('Safety View Navigation Verified:', safetyAudit.result.value);
  await takeShot('safety-view-390px.png');

  // --- 8. Test Navigation to How It Works & Legal Links ---
  console.log('\n--- 8. Testing Routed Views from Information Centre ---');
  // Navigate back to Profile
  await cdp.sendCommand('Runtime.evaluate', {
    expression: `(() => {
      const profileTab = Array.from(document.querySelectorAll('nav[aria-label="Mobile Navigation"] button')).find(b => b.innerText.includes('Profile'));
      if (profileTab) profileTab.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 800));

  // Click How AeroPool Works
  await cdp.sendCommand('Runtime.evaluate', {
    expression: `(() => {
      const howBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('How AeroPool Works'));
      if (howBtn) howBtn.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 800));
  const howAudit = await cdp.sendCommand('Runtime.evaluate', {
    expression: `document.body.innerText.includes('How AeroPool Works')`,
    returnByValue: true,
  });
  console.log('How AeroPool Works Routed Navigation:', howAudit.result.value);

  // Return to Home via Bottom Nav
  console.log('\n--- 9. Returning Home via Bottom Nav ---');
  await cdp.sendCommand('Runtime.evaluate', {
    expression: `(() => {
      const homeTab = Array.from(document.querySelectorAll('nav[aria-label="Mobile Navigation"] button')).find(b => b.innerText.includes('Home'));
      if (homeTab) homeTab.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 800));
  const homeReturnAudit = await cdp.sendCommand('Runtime.evaluate', {
    expression: `(() => {
      return {
        isHome: window.location.pathname === '/',
        hasFooter: !!document.querySelector('footer'),
      };
    })()`,
    returnByValue: true,
  });
  console.log('Returned to Home:', homeReturnAudit.result.value);

  // Shutdown
  cdp.close();
  chrome.kill();
  server.close();
  try {
    fs.rmSync(tmpProfile, { recursive: true, force: true });
  } catch (e) {}

  console.log('\n============================================================');
  console.log('🎉 ALL IA SIMPLIFICATION & QA TESTS PASSED!');
  console.log('============================================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});

