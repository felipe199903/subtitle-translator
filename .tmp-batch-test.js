const http = require('http');

const phrases = [
  'Hello world',
  'Hello, world!',
  'Hello   world',
  'hello world',
  'This is a test subtitle',
  'This is a test subtitle.',
  'this is a test subtitle',
  'How are you?',
  'How are you',
  'How are you!!',
  'Computer',
  'computer',
  'Computers',
  'Subtitle',
  'subtitle',
  'A phrase not in TM or dict',
  'test',
  'hello',
  'world'
];

const data = JSON.stringify({ segments: phrases });
const opts = { hostname: 'localhost', port: 3000, path: '/translate', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } };

const req = http.request(opts, (res) => {
  let body = '';
  res.on('data', (d) => body += d);
  res.on('end', () => {
    let json;
    try { json = JSON.parse(body); } catch (e) { console.error('Invalid JSON response', body); process.exit(1); }
    console.log('RAW_RESPONSE:', JSON.stringify(json, null, 2));

    const rows = json.data || [];
    const summary = { TM: [], FUZZY: [], DICT: [], NONE: [], OTHER: [] };
    for (const r of rows) {
      const via = (r.via || 'NONE').toUpperCase();
      if (via === 'TM') summary.TM.push(r);
      else if (via === 'FUZZY') summary.FUZZY.push(r);
      else if (via === 'DICT') summary.DICT.push(r);
      else if (via === 'NONE') summary.NONE.push(r);
      else summary.OTHER.push(r);
    }

    console.log('\nSUMMARY:');
    console.log(' total tested:', rows.length);
    console.log(' TM exact matches:', summary.TM.length);
    console.log(' FUZZY matches:', summary.FUZZY.length);
    console.log(' DICT matches:', summary.DICT.length);
    console.log(' NONE:', summary.NONE.length);
    console.log(' OTHER:', summary.OTHER.length);

    const sample = (arr) => arr.slice(0,3).map(x => ({ src: x.src, tgt: x.tgt, via: x.via, score: x.score }));
    console.log('\nExample TM:', sample(summary.TM));
    console.log('Example FUZZY:', sample(summary.FUZZY));
    console.log('Example DICT:', sample(summary.DICT));
    console.log('Example NONE:', sample(summary.NONE));
  });
});
req.on('error', (e) => { console.error('request error', e); process.exit(1); });
req.write(data);
req.end();
