const http = require('http');

async function check() {
  http.get('http://localhost:3000/app/book', (res) => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => {
      console.log('HTML status:', res.statusCode);
      console.log('HTML length:', body.length);
    });
  });
}
check();

