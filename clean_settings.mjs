import fs from 'fs';
const path = 'components/Settings.tsx';
let content = fs.readFileSync(path, 'utf8');

// The function starts at "const handleCopyProducts = async () => {"
// and goes down to "};" before "return ("
const startIdx = content.indexOf('const handleCopyProducts = async () => {');
if (startIdx !== -1) {
  const returnIdx = content.indexOf('return (', startIdx);
  if (returnIdx !== -1) {
    content = content.substring(0, startIdx) + content.substring(returnIdx);
    fs.writeFileSync(path, content);
    console.log("Cleaned Settings.tsx");
  }
}
