import fs from 'fs';
const path = 'components/Dashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

const startIdx = content.indexOf('useEffect(() => {\n    const runMigration = async () => {');
if (startIdx !== -1) {
  const returnIdx = content.indexOf('const fetchDashboardData = useCallback(async () => {', startIdx);
  if (returnIdx !== -1) {
    content = content.substring(0, startIdx) + content.substring(returnIdx);
    fs.writeFileSync(path, content);
    console.log("Cleaned Dashboard.tsx");
  } else {
    console.log("Could not find fetchDashboardData");
  }
} else {
  console.log("Could not find runMigration block");
}
