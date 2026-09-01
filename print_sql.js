const fs = require('fs');
const sql = fs.readFileSync('workspace/apply_rpc_fixed2.mjs', 'utf8').match(/const sql = `([\s\S]+?)`;/)[1];
console.log(sql);
