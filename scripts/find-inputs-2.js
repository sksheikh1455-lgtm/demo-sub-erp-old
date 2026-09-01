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
             let m;
             const re = /<input[^>]+value={([^}]+)}[^>]*>/g;
             while ((m = re.exec(cont)) !== null) {
                 const inner = m[1];
                 if (!inner.includes('||') && !inner.includes('??') && !inner.includes('?')) {
                     console.log(`${p}: ${m[0]}`);
                 }
             }
        }
    }
}

findInputs('./components');
