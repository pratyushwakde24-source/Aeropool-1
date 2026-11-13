const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-test-'));

console.log('Testing chrome launch...');
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--user-data-dir=${tmpProfile}`,
    '--remote-debugging-port=9333',
    '--remote-debugging-address=127.0.0.1',
    'about:blank'
  ],
  { stdio: ['pipe', 'pipe', 'pipe'] }
);

chrome.stdout.on('data', d => console.log('STDOUT:', d.toString()));
chrome.stderr.on('data', d => console.log('STDERR:', d.toString()));

chrome.on('exit', code => {
  console.log('Chrome exited with code:', code);
});

setTimeout(() => {
  const http = require('http');
  http.get('http://127.0.0.1:9333/json/list', res => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      console.log('Targets:', data);
      chrome.kill();
      process.exit(0);
    });
  }).on('error', err => {
    console.log('HTTP error:', err.message);
    chrome.kill();
    process.exit(1);
  });
}, 3000);

