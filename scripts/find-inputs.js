import fs from 'fs';
import path from 'path';

function findInputs(dir) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) {
             findInputs(p);
        } else if (p.endsWith('.tsx') && !p.includes('node_modules')) {
             const cont = fs.readFileSync(p, 'utf-8');
             // look for input tags with value={something}
             
             const lines = cont.split('\n');
             for (let i = 0; i<lines.length; i++) {
                 if (lines[i].includes('value={') && lines[i].includes('<input')) {
                     if (!lines[i].includes('||') && !lines[i].includes('??') && !lines[i].includes('typeof') && !lines[i].includes('?') && !lines[i].includes("''")) {
                         console.log(`${p}:${i+1}: ${lines[i].trim()}`);
                     }
                 }
             }
        }
    }
}

findInputs('./components');
