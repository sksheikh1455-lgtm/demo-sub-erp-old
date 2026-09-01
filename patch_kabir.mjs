import fs from 'fs';
const path = 'store/useAccountingStore.ts';
let code = fs.readFileSync(path, 'utf8');

const target = "safeSet(fetchedUsers, 'users', 'docs_users');";
const inject = `safeSet(fetchedUsers, 'users', 'docs_users');
            
            // Auto-grant Kabir access to Suborno Electric and Suborno New
            const kabir = fetchedUsers?.find((u: any) => String(u.email).toLowerCase() === 'kabir@gmail.com');
            const subornoElec = fetchedComps?.find((c: any) => String(c.name).toLowerCase().includes('electric'));
            const subornoNew = fetchedComps?.find((c: any) => String(c.name).toLowerCase().includes('new'));
            
            if (kabir && subornoElec && subornoNew) {
                const requiredIds = [subornoElec.id, subornoNew.id];
                const currentIds = kabir.company_ids || [];
                // Check if they are already exactly these two
                const needsUpdate = !requiredIds.every(id => currentIds.includes(id)) || currentIds.length !== requiredIds.length;
                if (needsUpdate) {
                    supabase.from('docs_users').update({ company_ids: requiredIds }).eq('id', kabir.id).then((res) => {
                       console.log("Updated kabir access to", requiredIds, res);
                    });
                }
            }`;

if (code.includes(target) && !code.includes('kabir@gmail.com')) {
    code = code.replace(target, inject);
    fs.writeFileSync(path, code);
    console.log("Patched successfully");
} else {
    console.log("Failed to patch or already patched");
}
