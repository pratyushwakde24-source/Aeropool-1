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
          let length = secondByte & 0x7f;
          let offset = 2;
          if (length === 126) {
            if (buffer.length < 4) break;
            length = buffer.readUInt16BE(2);
            offset = 4;
          } else if (length === 127) {
            break;
          }
          if (buffer.length < offset + length) break;
          const messageBuf = buffer.slice(offset, offset + length);
          buffer = buffer.slice(offset + length);
          try {
            const data = JSON.parse(messageBuf.toString('utf8'));
            if (data.id && callbacks.has(data.id)) {
              const { resolve: r, reject: rj } = callbacks.get(data.id);
              callbacks.delete(data.id);
              if (data.error) rj(data.error);
              else r(data.result);
            }
          } catch (e) {
            // ignore
          }
        }
      });

      resolve({ sendCommand, socket });
    });

    req.on('error', reject);
    req.end();
  });
}

async function debug() {
  const chromePath = findChrome();
  const port = 9225;
  const tempProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-debug-'));
  const proc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tempProfile}`,
    '--disable-gpu',
    '--no-sandbox',
  ]);

  try {
    const wsUrl = await getWsUrl(port);
    const { sendCommand, socket } = await createCdpConnection(wsUrl);
    const { targetId } = await sendCommand('Target.createTarget', { url: 'http://localhost:3000/app/book' });

    const pageWsRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/json`, (r) => {
        let body = '';
        r.on('data', (c) => (body += c));
        r.on('end', () => resolve(JSON.parse(body)));
      }).on('error', reject);
    });

    const targetInfo = pageWsRes.find((t) => t.id === targetId);
    const pageConn = await createCdpConnection(targetInfo.webSocketDebuggerUrl);

    await pageConn.sendCommand('Page.enable');
    await pageConn.sendCommand('Runtime.enable');
    await new Promise((r) => setTimeout(r, 2000));

    const evalRes = await pageConn.sendCommand('Runtime.evaluate', {
      expression: `(() => {
        return {
          title: document.title,
          h1: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.innerText),
          buttons: Array.from(document.querySelectorAll('button')).map(b => b.innerText),
          bodySnippet: document.body.innerText.substring(0, 300)
        };
      })()`,
      returnByValue: true,
    });
    console.log('Page Debug Info:', JSON.stringify(evalRes.result.value, null, 2));

    pageConn.socket.destroy();
    socket.destroy();
  } finally {
    proc.kill();
    try { fs.rmSync(tempProfile, { recursive: true }); } catch {}
  }
}

debug().catch(console.error);

