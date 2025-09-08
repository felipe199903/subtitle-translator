const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./packages/backend/tm.db');

db.serialize(() => {
  db.each("SELECT src, src_norm, tgt, count FROM tm", (err, row) => {
    if (err) { console.error(err); return; }
    console.log(row);
  }, () => db.close());
});
