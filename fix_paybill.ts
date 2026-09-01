import fs from 'fs';

const fixFile = (path: string) => {
    let content = fs.readFileSync(path, 'utf8');
    content = content.replace(
        /const payBill = useCallback\(async \(billId: string, paymentDetails: any\) => \{[\s\S]*?appliedBills: \[\{/g,
        (match) => {
            return match.replace(
                "const payment = await postPayment({",
                "const payment = await postPayment({\n      status: paymentDetails.status || 'POSTED',"
            );
        }
    );
    fs.writeFileSync(path, content);
};

fixFile('store/useAccountingStore.ts');
console.log('Fixed');
