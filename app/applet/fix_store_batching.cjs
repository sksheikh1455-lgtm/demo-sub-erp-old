const fs = require('fs');

let content = fs.readFileSync('/store/useAccountingStore.ts', 'utf-8');

// The regex will find the FIRST occurrence (Phase 1)
const phase1Regex = /const results = await Promise\.allSettled\(\[\s+([\s\S]*?)\s+\]\);/;
const m1 = content.match(phase1Regex);
if (!m1) { console.error('P1 not found'); process.exit(1); }

const p1Lines = m1[1].split('\n').map(l => l.trim()).filter(l => l.length > 0);
const p1Loaders = p1Lines.map(l => {
  if (l.endsWith(',')) l = l.slice(0, -1);
  return `        () => ${l}`;
});

let p1Replace = `
      const loaders = [
${p1Loaders.join(',\n')}
      ];
      const results = [];
      for (let i = 0; i < loaders.length; i += 4) {
        const chunk = loaders.slice(i, i + 4);
        const chunkResults = await Promise.allSettled(chunk.map(fn => fn()));
        results.push(...chunkResults);
      }
`;
content = content.replace(phase1Regex, p1Replace);
console.log('Phase 1 patched.');

const phase2Regex = /const results = await Promise\.allSettled\(\[\s+([\s\S]*?)\s+\]\);/;
const m2 = content.match(phase2Regex);
if (!m2) { console.error('P2 not found'); process.exit(1); }

const p2Lines = m2[1].split('\n').map(l => l.trim()).filter(l => l.length > 0);
const p2Loaders = p2Lines.map(l => {
  if (l.endsWith(',')) l = l.slice(0, -1);
  return `              () => ${l}`;
});

let p2Replace = `
            const loaders = [
${p2Loaders.join(',\n')}
            ];
            const results = [];
            for (let i = 0; i < loaders.length; i += 4) {
              const chunk = loaders.slice(i, i + 4);
              const chunkResults = await Promise.allSettled(chunk.map(fn => fn()));
              results.push(...chunkResults);
            }
`;
content = content.replace(phase2Regex, p2Replace);
console.log('Phase 2 patched.');

fs.writeFileSync('/store/useAccountingStore.ts', content, 'utf-8');
console.log('All patched successfully!');
