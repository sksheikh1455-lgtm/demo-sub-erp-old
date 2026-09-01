import fs from 'fs';

const p = {
    id: "prod-1",
    company_id: "comp-1",
    companyIds: ["comp-1", "comp-2"],
    quantity_on_hand: 120, // database computed
    initialStockLevels: {},
    data: {
       stockLevels: {}
    }
};

const activeCids = ["comp-2"];

const dbStockLevels = (p).stockLevels || (p).stock_levels || (p).data?.stockLevels || (p).data?.stock_levels;
const dbQty = (p).quantity_on_hand !== undefined ? Number((p).quantity_on_hand) : ((p).quantityOnHand !== undefined ? Number((p).quantityOnHand) : undefined);

const stockLevels = {};
const baseLevels = (p).initialStockLevels || (p).data?.initialStockLevels || {};
Object.entries(baseLevels).forEach(([cid, q]) => {
  stockLevels[cid] = Number(q || 0);
});

const calculatedQty = activeCids.reduce((sum, cid) => sum + (stockLevels[cid] || 0), 0);

const finalStockLevels = (dbStockLevels && Object.keys(dbStockLevels).length > 0) ? dbStockLevels : stockLevels;

let qty = 0;
if (finalStockLevels && Object.keys(finalStockLevels).length > 0) {
   qty = activeCids.reduce((sum, cid) => sum + (Number(finalStockLevels[cid]) || 0), 0);
} else {
   const primaryCid = p.company_id || (p).companyId || p.companyIds?.[0];
   if (primaryCid && activeCids.includes(primaryCid)) {
       qty = dbQty !== undefined ? dbQty : calculatedQty;
   } else {
       qty = dbQty !== undefined ? dbQty : calculatedQty; // Wait! I patched it to be qty = 0, right? Let me check the actual code.
   }
}

console.log({ dbQty, dbStockLevels, finalStockLevels, qty });

