const http = require('http');

const data = JSON.stringify({
  subtitles: [{
    index: 1,
    startTime: '00:00:01,000',
    endTime: '00:00:03,000',
    text: 'Hello world'
  }],
  targetLanguage: 'pt-BR'
});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/subtitles/translate',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

console.log('Making request to translation API...');

const req = http.request(options, (res) => {
  console.log(`statusCode: ${res.statusCode}`);
  console.log(`headers:`, res.headers);
  
  let responseData = '';
  res.on('data', (chunk) => {
    responseData += chunk;
  });
  
  res.on('end', () => {
    console.log('Response:', responseData);
  });
});

req.on('error', (error) => {
  console.error('Request error:', error.message);
});

req.write(data);
req.end();
