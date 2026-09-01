const http = require('http');
const fs = require('fs');

http.createServer((req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      fs.writeFileSync('error_dump.txt', body);
      res.end('ok');
      process.exit(0);
    });
  }
}).listen(3002);
console.log('Listening on 3002');
