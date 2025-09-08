const http = require('http');
const data = JSON.stringify({ segments: ['Hello world', 'This is a test subtitle', 'How are you?', 'Computer'] });

const opts = { hostname: 'localhost', port: 3000, path: '/translate', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } };
const req = http.request(opts, (res) => { let body = ''; res.on('data', (d) => body += d); res.on('end', () => { try { console.log(JSON.parse(body)); } catch (e) { console.log('Non-JSON response', body); } }); });
req.on('error', (e) => console.error('request error', e));
req.write(data);
req.end();
