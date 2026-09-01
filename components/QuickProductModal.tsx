import { generateUUID } from '../constants';
import React, { useState } from "react";
import { Product, ProductType } from "../types";
import SearchableSelect from "./SearchableSelect";

interface QuickProductModalProps {
  name: string;
  store: any;
  onSave: (p: Product) => void;
  onCancel: () => void;
  themeColor?: string;
}

const QuickProductModal: React.FC<QuickProductModalProps> = ({
  name,
  store,
  onSave,
  onCancel,
  themeColor = "#00A09D",
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [data, setData] = useState({
    name: name || "",
    sku: `P-${generateUUID().slice(-4)}`,
    price: 0,
    costPrice: 0,
    type: "Goods" as ProductType,
    quantityOnHand: 0,
    uom: "Pcs",
    category: "General",
    brand: "",
    description: "",
    lastPurchaseRate: 0,
    companyIds:
      store.activeCompanyIds.length > 0
        ? store.activeCompanyIds
        : [store.companies[0]?.id],
  });

  const categories = Array.from(
    new Set([...(store.categories || []).map((c: any) => c.name), ...(store.products || []).map((p: any) => p.category)].filter(Boolean)),
  ).sort();
  const brands = Array.from(
    new Set([...(store.brands || []).map((b: any) => b.name), ...(store.products || []).map((p: any) => p.brand)].filter(Boolean)),
  ).sort();

  const toggleCompany = (companyId: string) => {
    setData((prev) => {
      const prevIds = prev.companyIds || [];
      const newIds = prevIds.includes(companyId)
        ? prevIds.filter((id) => id !== companyId)
        : [...prevIds, companyId];
      // Ensure at least one company is selected
      return {
        ...prev,
        companyIds: newIds.length > 0 ? newIds : prevIds,
      };
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl animate-in zoom-in duration-200">
        <div
          className="p-6 text-white rounded-t-xl flex justify-between items-center"
          style={{ backgroundColor: themeColor }}
        >
          <h4 className="font-bold text-xs uppercase tracking-widest">
            Quick-Add Product
          </h4>
          <button
            onClick={onCancel}
            className="hover:rotate-90 transition-transform"
          >
            ✕
          </button>
        </div>
        <div className="p-8 pb-48 space-y-6 max-h-[70vh] overflow-y-auto">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
              Product Name
            </label>
            <input
              className="w-full text-2xl font-bold border-b border-slate-200 focus:border-indigo-500 outline-none py-2 transition-colors"
              value={data.name}
              onChange={(e) => setData({ ...data, name: e.target.value })}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                Sales Price
              </label>
              <input
                type="number"
                className="w-full border-b border-slate-200 focus:border-indigo-500 outline-none py-2 font-bold text-emerald-600"
                placeholder="0.00"
                value={data.price}
                onChange={(e) =>
                  setData({ ...data, price: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                WAC (Avg Cost)
              </label>
              <input
                type="number"
                disabled={true}
                readOnly={true}
                className="w-full border-b border-slate-200 outline-none py-2 font-bold text-slate-400 bg-slate-50 cursor-not-allowed"
                placeholder="0.00"
                value={0}
                onChange={() => {}}
              />
              <span className="text-[9px] text-amber-600 block font-black uppercase mt-1 leading-tight">🔒 Auto-Calculated via Purchase / Adjustment</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                Last Purchase Rate
              </label>
              <input
                type="number"
                className="w-full border-b border-slate-200 focus:border-indigo-500 outline-none py-2 font-bold text-amber-600"
                placeholder="0.00"
                value={data.lastPurchaseRate}
                onChange={(e) =>
                  setData({
                    ...data,
                    lastPurchaseRate: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                Initial Stock
              </label>
              <input
                type="number"
                disabled={true}
                readOnly={true}
                className="w-full border-b border-slate-200 outline-none py-2 font-bold text-slate-400 bg-slate-50 cursor-not-allowed"
                placeholder="0.00"
                value={0}
                onChange={() => {}}
              />
              <span className="text-[9px] text-amber-600 block font-black uppercase mt-1 leading-tight">🔒 Controlled via Stock Adjustment Page</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                Category
              </label>
              <SearchableSelect
                options={[
                  ...categories.map((c) => ({
                    id: c as string,
                    name: c as string,
                  })),
                ]}
                value={data.category}
                onSelect={(id) => setData({ ...data, category: id })}
                onQuickCreate={(name) => setData({ ...data, category: name })}
                placeholder="Search or add category..."
                quickCreateLabel="Category"
                className="w-full"
                labelClass="font-bold text-slate-800 border-none px-0 py-2 h-[37px] w-full"
                themeColor={themeColor}
                displayLimit={7}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                Brand
              </label>
              <SearchableSelect
                options={[
                  ...brands.map((b) => ({
                    id: b as string,
                    name: b as string,
                  })),
                ]}
                value={data.brand || ""}
                onSelect={(id) => setData({ ...data, brand: id })}
                onQuickCreate={(name) => setData({ ...data, brand: name })}
                placeholder="Search or add brand..."
                quickCreateLabel="Brand"
                className="w-full"
                labelClass="font-bold text-slate-800 border-none px-0 py-2 h-[37px] w-full"
                themeColor={themeColor}
                displayLimit={7}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                SKU
              </label>
              <input
                type="text"
                className="w-full border-b border-slate-200 focus:border-indigo-500 outline-none py-2 text-sm font-mono"
                value={data.sku || ""}
                onChange={(e) => setData({ ...data, sku: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                UoM
              </label>
              <input
                type="text"
                className="w-full border-b border-slate-200 focus:border-indigo-500 outline-none py-2 text-sm"
                placeholder="e.g. Pcs, Kg"
                value={data.uom || ""}
                onChange={(e) => setData({ ...data, uom: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
              Available In Companies
            </label>
            <div className="flex flex-wrap gap-2">
              {store.companies.map((c: any) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCompany(c.id)}
                  className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all border ${
                    (data.companyIds || []).includes(c.id)
                      ? "bg-indigo-600 border-indigo-600 text-white shadow-md"
                      : "bg-white border-slate-200 text-slate-500 hover:border-indigo-300"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="p-6 bg-slate-50 flex justify-end space-x-3 rounded-b-xl">
          <button
            onClick={onCancel}
            disabled={isSaving}
            className="px-6 py-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
          >
            Discard
          </button>
          <button
            onClick={async () => {
              if (isSaving) return;
              try {
                if (typeof store.addProduct !== "function") {
                  console.error("store.addProduct is not a function", store);
                  alert("Error: Product creation service not available.");
                  return;
                }
                setIsSaving(true);
                const newProd = await store.addProduct(data);
                if (newProd) {
                  onSave(newProd);
                } else {
                  alert("Error: Failed to create product.");
                }
              } catch (err: any) {
                console.error("Failed to add product:", err);
                alert(
                  "Error: An unexpected error occurred while creating the product: " + (err.message || err),
                );
              } finally {
                setIsSaving(false);
              }
            }}
            disabled={isSaving}
            className="px-8 py-2 text-white font-bold rounded shadow-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
            style={{ backgroundColor: themeColor }}
          >
            {isSaving ? "Saving..." : "Save & Select"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickProductModal;
