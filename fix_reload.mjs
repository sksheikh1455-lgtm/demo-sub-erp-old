import fs from 'fs';
const path = 'components/Dashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/setCopyStatus\('সফলভাবে ' \+ newProducts\.length \+ ' টি প্রোডাক্ট কপি করা হয়েছে! দয়া করে পেজটি রিফ্রেশ করুন\。'\);/g, 
`setCopyStatus('সফলভাবে ' + newProducts.length + ' টি প্রোডাক্ট কপি করা হয়েছে! দয়া করে পেজটি রিফ্রেশ করুন।');
setTimeout(() => window.location.reload(), 1500);`);

fs.writeFileSync(path, content);
console.log('Fixed dashboard reload');
