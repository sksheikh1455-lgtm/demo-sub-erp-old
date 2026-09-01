import fs from 'fs';
import path from 'path';

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

walkDir('./components', function(filePath) {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    content = content.replace(/Date\.now\(\)\.toString\(\) \+ Math\.random\(\)\.toString\(\)/g, "crypto.randomUUID()");
    content = content.replace(/Date\.now\(\)\.toString\(\) \+ Math\.random\(\)/g, "crypto.randomUUID()");
    content = content.replace(/\$\{Date\.now\(\)\}-\$\{Math\.random\(\)\.toString\(36\)\.substr\([0-9,\s]+\)\}/g, "${crypto.randomUUID()}");
    content = content.replace(/Date\.now\(\)\.toString\(\)/g, "crypto.randomUUID()");
    content = content.replace(/\`MSG-[A-Z]+-\$\{Date\.now\(\)\}\`/g, "crypto.randomUUID()");
    content = content.replace(/\`LOAN-\$\{Date\.now\(\)\.toString\(\)\.slice\(-6\)\}\`/g, "`LOAN-${crypto.randomUUID().slice(0,6).toUpperCase()}`");
    content = content.replace(/\`P-\$\{Date\.now\(\)\.toString\(\)\.slice\(-4\)\}\`/g, "`P-${crypto.randomUUID().slice(0,4).toUpperCase()}`");
    
    // For refund maps:
    content = content.replace(/id: \`\$\{item\.id\}-refund-\$\{Date\.now\(\)\}\`/g, "id: `refund-${crypto.randomUUID()}`");

    // For newSerials array from Date.now():
    content = content.replace(/\`\$\{prod\.sku \|\| 'SN'\}\-\$\{Date\.now\(\)\}-\$\{[\s\S]*?\}\`/g, "crypto.randomUUID()");
    content = content.replace(/\`\$\{formData\.sku \|\| 'SN'\}\-\$\{Date\.now\(\)\}-\$\{[\s\S]*?\}\`/g, "crypto.randomUUID()");

    if (original !== content) {
      fs.writeFileSync(filePath, content);
      console.log('Updated ' + filePath);
    }
  }
});
