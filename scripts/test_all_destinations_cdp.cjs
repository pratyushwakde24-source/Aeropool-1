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

async function main() {
  const screenshotDir = path.resolve('C:/Users/praty/.gemini/antigravity/brain/9fd74342-e2dd-4c04-9295-c7cd439e32bf/screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const chromePath = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9345;
  const tempProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-audit-dest-'));
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
      'http://127.0.0.1:3000/app/book',
    ],
    { stdio: 'ignore' }
  );

  try {
    const wsUrl = await getWsUrl(port);
    const { sendCommand, socket } = await createCdpConnection(wsUrl);

    const pageWsRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/json`, (r) => {
        let body = '';
        r.on('data', (c) => (body += c));
        r.on('end', () => resolve(JSON.parse(body)));
      }).on('error', reject);
    });

    const targetInfo = pageWsRes.find((t) => t.type === 'page');
    if (!targetInfo) throw new Error('No page target found');
    const pageConn = await createCdpConnection(targetInfo.webSocketDebuggerUrl);

    await pageConn.sendCommand('Page.enable');
    await pageConn.sendCommand('DOM.enable');
    await pageConn.sendCommand('Runtime.enable');
    await pageConn.sendCommand('Log.enable');

    pageConn.socket.on('data', (d) => {
      // debug logs if needed
    });

    await pageConn.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });

    console.log('Navigating and clicking to Step 2...');
    await waitForCondition(
      pageConn,
      `Boolean(Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Continue to Destination')))`
    );

    await pageConn.sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Continue to Destination'));
        if (btn) btn.click();
      })()`,
    });

    await waitForCondition(pageConn, `Boolean(document.querySelector('.mapboxgl-canvas') || document.querySelector('canvas'))`, 12000);
    await new Promise((r) => setTimeout(r, 3000));

    // Get list of destination chip buttons
    const hubs = await pageConn.sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const buttons = Array.from(document.querySelectorAll('button')).filter(b => {
          const txt = b.innerText || '';
          return txt.includes('km') && !txt.includes('Continue');
        });
        return buttons.map(b => b.innerText.replace(/\\n/g, ' ').trim());
      })()`,
      returnByValue: true,
    });
    console.log('Found hub buttons:', hubs.result.value);

    const testDestinations = [
      'Bandra Kurla Complex',
      'Bandra West',
      'Lower Parel & Worli',
      'South Mumbai',
      'Powai',
      'Andheri West',
    ];

    const results = [];

    for (let i = 0; i < testDestinations.length; i++) {
      const destName = testDestinations[i];
      console.log(`\nTesting destination ${i + 1}/${testDestinations.length}: ${destName}`);

      // Click the button matching destName
      const clickRes = await pageConn.sendCommand('Runtime.evaluate', {
        expression: `(() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('${destName}'));
          if (btn) {
            btn.click();
            return { clicked: true, text: btn.innerText.replace(/\\n/g, ' ') };
          }
          return { clicked: false };
        })()`,
        returnByValue: true,
      });
      console.log('Click result:', clickRes.result.value);

      // Wait 3.5 seconds for route calculation and map render
      await new Promise((r) => setTimeout(r, 3500));

      // Inspect map state
      const state = await pageConn.sendCommand('Runtime.evaluate', {
        expression: `(() => {
          const mapCanvas = document.querySelector('.mapboxgl-canvas') || document.querySelector('canvas');
          const pickupMarker = document.querySelector('.aeropool-pickup-marker');
          const destMarker = document.querySelector('.aeropool-destination-marker');
          const targetCard = Array.from(document.querySelectorAll('div')).find(d => (d.innerText || '').includes('Target Drop-Off Point'));
          
          let cardText = '';
          if (targetCard) {
            cardText = targetCard.innerText.replace(/\\n/g, ' | ');
          }

          return {
            hasCanvas: Boolean(mapCanvas),
            canvasWidth: mapCanvas?.clientWidth,
            canvasHeight: mapCanvas?.clientHeight,
            hasPickupMarker: Boolean(pickupMarker),
            hasDestMarker: Boolean(destMarker),
            cardText: cardText.slice(0, 150),
          };
        })()`,
        returnByValue: true,
      });

      console.log(`State for ${destName}:`, state.result.value);
      results.push({ dest: destName, state: state.result.value });

      // Scroll to map and screenshot
      await pageConn.sendCommand('Runtime.evaluate', {
        expression: `(() => {
          const mapEl = document.querySelector('.mapboxgl-canvas')?.parentElement?.parentElement;
          if (mapEl) {
            mapEl.scrollIntoView({ behavior: 'instant', block: 'center' });
          }
        })()`,
      });
      await new Promise((r) => setTimeout(r, 600));

      const shot = await pageConn.sendCommand('Page.captureScreenshot', { format: 'png' });
      const shotPath = path.join(screenshotDir, `dest-${i + 1}-${destName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-390px.png`);
      fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
      console.log(`📸 Saved screenshot: ${shotPath}`);
    }

    fs.writeFileSync('scratch/dest_test_results.json', JSON.stringify(results, null, 2));
    console.log('\nAll destination test completed!');

    pageConn.socket.destroy();
    socket.destroy();
  } finally {
    chromeProcess.kill();
    try {
      fs.rmSync(tempProfile, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
