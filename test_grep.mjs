import fs from 'fs';
const content = fs.readFileSync('components/Dashboard.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((l, i) => {
  if (l.includes('dueInstallments') || l.includes('stats') || l.includes('todayCashIn')) {
    console.log(i + 1, l.trim());
  }
});
