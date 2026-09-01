const fs = require('fs');
const path = require('path');

function replaceInDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (file === 'node_modules' || file === '.git' || file === 'dist' || file === 'src') continue;
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            replaceInDir(fullPath);
        } else if (stat.isFile() && (fullPath.endsWith('.ts') || fullPath.endsWith('.js') || fullPath.endsWith('.cjs') || fullPath.endsWith('.mjs'))) {
            let content = fs.readFileSync(fullPath, 'utf8');
            const target = "process.env.SUPABASE_DB_URL";
            const target2 = 'process.env.SUPABASE_DB_URL';
            const target3 = 'process.env.SUPABASE_DB_URL';
            
            if (content.includes(target) || content.includes(target2) || content.includes(target3)) {
                content = content.split(target).join('process.env.SUPABASE_DB_URL');
                content = content.split(target2).join('process.env.SUPABASE_DB_URL');
                content = content.split(target3).join('process.env.SUPABASE_DB_URL');
                
                if (!content.includes('dotenv')) {
                    if (fullPath.endsWith('.cjs') || fullPath.endsWith('.js')) {
                        content = "require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });\n" + content;
                    } else {
                        content = "import * as dotenv from 'dotenv';\nimport path from 'path';\ndotenv.config({ path: path.resolve(__dirname, '.env') });\n" + content;
                    }
                }
                
                fs.writeFileSync(fullPath, content);
                console.log('Updated', fullPath);
            }
        }
    }
}
replaceInDir('/app/applet');
replaceInDir('/app/applet/src');

const envPath = '/app/applet/.env';
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    if (!envContent.includes('SUPABASE_DB_URL=')) {
        fs.appendFileSync(envPath, '\nSUPABASE_DB_URL=process.env.SUPABASE_DB_URL\n');
        console.log('Appended to .env');
    }
}
