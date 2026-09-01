const finalStockLevels = { "electric-cid": 120 };
const activeCids = ["new-cid"];
let qty = 0;
if (finalStockLevels && Object.keys(finalStockLevels).length > 0) {
   qty = activeCids.reduce((sum, cid) => sum + (Number(finalStockLevels[cid]) || 0), 0);
} else {
   qty = 999; // dummy
}
console.log("Qty:", qty);
