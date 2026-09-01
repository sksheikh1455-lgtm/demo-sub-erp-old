import fs from 'fs';

const fixFile = (path: string) => {
    let content = fs.readFileSync(path, 'utf8');
    content = content.replace(
        /const payment = await postPayment\(\{\s*status: paymentDetails\.status \|\| 'POSTED',\s*status: paymentDetails\.status \|\| 'POSTED',/g,
        "const payment = await postPayment({\n      status: paymentDetails.status || 'POSTED',"
    );
    fs.writeFileSync(path, content);
};

fixFile('store/useAccountingStore.ts');
console.log('Fixed');
