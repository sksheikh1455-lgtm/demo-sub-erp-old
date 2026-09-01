import fs from 'fs';
const path = 'components/Dashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

const replacement = `  useEffect(() => {
    // Advanced migration logic removed from hook
  }, []);

  if (loading && !reportData) {
    return (
      <div className="flex flex-col items-center justify-center py-40 space-y-4">
        <Activity className="w-12 h-12 text-indigo-600 animate-spin" />
        <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Loading Dashboard Intelligence...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
`;

content = content.replace(/  useEffect\(\(\) => \{\n    \/\/ Advanced migration logic removed from hook\n  \}, \[\]\);/, replacement);
fs.writeFileSync(path, content);
console.log('Restored render blocks');
