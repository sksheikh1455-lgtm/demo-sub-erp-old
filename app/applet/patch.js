const fs = require('fs');

let f = fs.readFileSync('current_post_invoice.txt', 'utf8');
f = f.replace(
    /SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE code IN \('100100', '1011', '100101', 'CASH', 'BANK'\).*?;[\s\S]*?(?=v_pay_id :=)/m,
`SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE code = '100100' AND company_id = v_effective_company_id LIMIT 1;
                IF v_liquidity_acc IS NULL THEN 
                    RAISE EXCEPTION 'CRITICAL: Account code 100100 (Cash) not found for company %', v_effective_company_id;
                END IF;
                
                `
);
fs.writeFileSync('current_post_invoice.txt', f);

f = fs.readFileSync('post_invoice_v2.sql', 'utf8');
f = f.replace(
    /SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE code IN \('1011', '100100', '100101', 'CASH', 'BANK'\).*?;[\s\S]*?(?=INSERT INTO docs_payments)/m,
`SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE code = '100100' AND company_id = v_effective_company_id LIMIT 1;
                IF v_liquidity_acc IS NULL THEN 
                    RAISE EXCEPTION 'CRITICAL: Account code 100100 (Cash) not found for company %', v_effective_company_id;
                END IF;

                `
);
f = f.replace(
    /SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE code IN \('1011', '100100', '100101', 'CASH', 'BANK'\).*?;[\s\S]*?(?=v_pay_id :=)/m,
`SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE code = '100100' AND company_id = v_effective_company_id LIMIT 1;
        IF v_liquidity_acc IS NULL THEN 
            RAISE EXCEPTION 'CRITICAL: Account code 100100 (Cash) not found for company %', v_effective_company_id;
        END IF;
        
        `
);
fs.writeFileSync('post_invoice_v2.sql', f);

f = fs.readFileSync('post_bill_current.sql', 'utf8');
f = f.replace(
    /SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE code IN \('100100', '1011', '100101', 'CASH', 'BANK'\).*?;[\s\S]*?(?=INSERT INTO docs_payments)/m,
`SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE code = '100100' AND company_id = v_effective_company_id LIMIT 1;
                IF v_liquidity_acc IS NULL THEN 
                    RAISE EXCEPTION 'CRITICAL: Account code 100100 (Cash) not found for company %', v_effective_company_id;
                END IF;

                `
);
fs.writeFileSync('post_bill_current.sql', f);

f = fs.readFileSync('current_post_payment.txt', 'utf8');
f = f.replace(
    /IF v_liquidity_acc IS NULL THEN\s*SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE code IN \('100100', '1011'\) AND company_id = v_effective_company_id ORDER BY CASE WHEN code = '100100' THEN 1 ELSE 2 END LIMIT 1;\s*END IF;\s*IF v_liquidity_acc IS NULL THEN\s*SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE name ILIKE '%Cash%' AND company_id = v_effective_company_id LIMIT 1;\s*END IF;/gm,
`IF v_liquidity_acc IS NULL THEN
        SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE code = '100100' AND company_id = v_effective_company_id LIMIT 1;
    END IF;`
);
fs.writeFileSync('current_post_payment.txt', f);

console.log("Patched all logic");
