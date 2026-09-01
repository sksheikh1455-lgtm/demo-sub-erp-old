import fs from 'fs';

const code = `
interface State {
  users: User[];
  invoices: Invoice[];
}

function calculateDiff(before, after) {
  const changes = [];
  for (const key of Object.keys(after)) {
    if (Array.isArray(after[key]) && before[key] !== after[key]) {
       // Assuming arrays of objects with 'id'
       const beforeMap = new Map(before[key].map(i => [i.id, i]));
       for (const item of after[key]) {
         const old = beforeMap.get(item.id);
         if (!old) {
            changes.push({ action: 'INSERT', table: key, data: item });
         } else if (JSON.stringify(old) !== JSON.stringify(item)) {
            changes.push({ action: 'UPDATE', table: key, data: item });
         }
         beforeMap.delete(item.id);
       }
       for (const [id, item] of beforeMap.entries()) {
          changes.push({ action: 'DELETE', table: key, id: id });
       }
    }
  }
  return changes;
}
`;
console.log("concept loaded");
