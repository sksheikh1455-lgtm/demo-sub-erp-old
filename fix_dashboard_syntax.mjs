import fs from 'fs';
const path = 'components/Dashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

// I need to replace the entire `useEffect(() => { ...` block and that hanging `className=...` with just a clean useEffect and no button (since I already appended a new share button).

const regex = /useEffect\(\(\) => \{\n    const runMigration = async \(\) => \{[\s\S]*?FORCE COPY PRODUCTS TO SUBORNO NEW\n        <\/button>\n      <\/div>/;

const replacement = `useEffect(() => {
    // Advanced migration logic removed from hook
  }, []);
`;

content = content.replace(regex, replacement);
fs.writeFileSync(path, content);
console.log('Fixed dashboard syntax');
