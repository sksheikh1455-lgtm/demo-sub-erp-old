
import React, { useState, useRef } from 'react';
import { ContactType } from '../types';
import { GoogleGenAI, Type } from "@google/genai";
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';

const ExcelImporter: React.FC<{ store: any }> = ({ store }) => {
  const [importType, setImportType] = useState<'products' | 'contacts'>('products');
  const [importStats, setImportStats] = useState({ new: 0, update: 0 });
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [step, setStep] = useState(0);
  const [isTesting, setIsTesting] = useState(false);
  const [testResults, setTestResults] = useState<any[] | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string> | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [rawFileData, setRawFileData] = useState<any[] | null>(null);
  const [importComplete, setImportComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const productTemplate = [
    ['External ID', 'Name', 'SKU', 'Sales Price', 'Cost Price', 'Last Purchase Rate', 'Quantity On Hand', 'Type', 'Category', 'Brand', 'UOM', 'Description', 'Can Be Sold', 'Can Be Purchased', 'Tracking Type', 'Companies (Comma Separated)'],
    ['__export__.product_1', 'HP Laptop 15s', 'HP-15S', '65000', '45000', '42000', '10', 'Goods', 'Electronics', 'HP', 'Units', 'Office laptop', 'TRUE', 'TRUE', 'NONE', 'Company A,Company B'],
    ['__export__.product_2', 'Dell Vostro', 'DELL-V3', '72000', '50000', '5', 'Goods', 'Electronics', 'Dell', 'Units', 'Core i7 version', 'TRUE', 'TRUE', 'SERIAL', 'Company A'],
    ['__export__.product_3', 'Office Chair', 'CHAIR-01', '8500', '5500', '25', 'Goods', 'Furniture', 'Regal', 'Units', 'Ergonomic chair', 'TRUE', 'TRUE', 'NONE', 'Company B'],
    ['__export__.product_4', 'Consultancy', 'SRV-01', '5000', '0', '0', 'Service', 'Services', '', 'Hours', 'Technical consulting', 'TRUE', 'FALSE', 'NONE', 'Company A,Company B'],
    ['__export__.product_5', 'Logitech Mouse', 'LOGI-M1', '1200', '800', '50', 'Goods', 'Accessories', 'Logitech', 'Units', 'Wireless mouse', 'TRUE', 'TRUE', 'NONE', 'Company A']
  ];

  const contactTemplate = [
    ['External ID', 'Name', 'Email', 'Type', 'Phone', 'Address', 'Opening Balance', 'Companies (Comma Separated)', 'City', 'Country', 'TIN'],
    ['CT-1001', 'Rahim Traders', 'rahim@example.com', 'CUSTOMER', '01711223344', '123 Dhaka St', '5000', 'Company A', 'Dhaka', 'Bangladesh', '123456789'],
    ['CT-1001', 'Rahim Traders', 'rahim@example.com', 'CUSTOMER', '01711223344', '123 Dhaka St', '2000', 'Company B', 'Dhaka', 'Bangladesh', '123456789'],
    ['CT-1002', 'Sarker Electric', 'sarker@example.com', 'VENDOR', '01811223344', '45 Chittagong Rd', '-2500', 'Company A', 'Chittagong', 'Bangladesh', '987654321'],
    ['EMP-501', 'John Doe', 'john@example.com', 'EMPLOYEE', '01911223344', 'Gulshan 2', '0', 'Company B', 'Dhaka', 'Bangladesh', '']
  ];

  const [validationErrors, setValidationErrors] = useState<{ row: number; column: string; message: string }[]>([]);
  const [importLogs, setImportLogs] = useState<string[]>([]);

  const downloadCSV = (data: string[][], filename: string) => {
    const csvContent = data.map(e => e.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setTestResults(null);
    setImportComplete(false);
    setValidationErrors([]);

    try {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        
        if (data.length > 0) {
          const headers = data[0] as string[];
          const rows = data.slice(1).map((row: any) => {
            const obj: any = {};
            headers.forEach((header, i) => {
              obj[header] = row[i];
            });
            return obj;
          });
          setRawFileData(rows);
          
          // Auto-mapping logic (deterministic)
          const mapping: Record<string, string> = {};
          const sysFields = importType === 'products' 
            ? ['externalId', 'name', 'sku', 'price', 'costPrice', 'lastPurchaseRate', 'quantityOnHand', 'type', 'category', 'brand', 'uom', 'description', 'companyIds']
            : ['externalId', 'name', 'email', 'type', 'phone', 'address', 'openingBalance', 'companyIds'];
          
      sysFields.forEach(field => {
        const match = headers.find(h => {
          const cleanH = String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const cleanF = String(field || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          return cleanH === cleanF || 
                 (field === 'costPrice' && (cleanH === 'purchaseprice' || cleanH === 'cost' || cleanH === 'costrate')) ||
                 (field === 'lastPurchaseRate' && (cleanH === 'lastpurchaserate' || cleanH === 'lastprice' || cleanH === 'lastrate')) ||
                 (field === 'price' && (cleanH === 'salesprice' || cleanH === 'rate' || cleanH === 'unitprice')) ||
                 (field === 'quantityOnHand' && (cleanH === 'stock' || cleanH === 'qty' || cleanH === 'quantity' || cleanH === 'onhand')) ||
                 (field === 'externalId' && (cleanH === 'id' || cleanH === 'extid')) ||
                 (field === 'companyIds' && (cleanH === 'company' || cleanH === 'companyid' || cleanH === 'companies'));
        });
        if (match) mapping[field] = match;
      });
          setColumnMapping(mapping);
        } else {
          setRawFileData([]);
        }
      };
      reader.readAsBinaryString(file);
    } catch (err: any) {
      setError(err.message || 'Failed to read file');
    }
  };

  const validateData = () => {
    if (!rawFileData || !columnMapping) return false;
    const errors: { row: number; column: string; message: string }[] = [];
    const stats = { new: 0, update: 0 };
    
    rawFileData.forEach((row, index) => {
      const rowNum = index + 2; // +1 for header, +1 for 1-based index
      
      // Check required fields
      const required = importType === 'products' ? ['name'] : ['name'];
      required.forEach(field => {
        const header = columnMapping[field];
        if (!header || !row[header]) {
          errors.push({ 
            row: rowNum, 
            column: header || field, 
            message: `CRITICAL: Missing required field "${field}" at Row ${rowNum}. SAP/Odoo protocol requires this for master data integrity.` 
          });
        }
      });

      // Check numeric fields
      const numeric = importType === 'products' 
        ? ['price', 'costPrice', 'lastPurchaseRate', 'quantityOnHand'] 
        : ['openingBalance'];
      
      numeric.forEach(field => {
        const header = columnMapping[field];
        if (header && row[header] !== undefined && row[header] !== '') {
          const val = Number(row[header]);
          if (isNaN(val)) {
            errors.push({ 
              row: rowNum, 
              column: header, 
              message: `DATA TYPE ERROR: Invalid number format "${row[header]}" at Row ${rowNum}, Column "${header}".` 
            });
          }
        }
      });

      // Check company names
      const companyHeader = columnMapping['companyIds'] || columnMapping['companyId'];
      if (companyHeader && row[companyHeader]) {
        const companyNames = String(row[companyHeader]).split(',').map(s => s.trim().toLowerCase());
        const invalidCompanies = companyNames.filter(name => 
          !(store.companies || []).some((comp: any) => comp.id === name || comp.name.toLowerCase() === name)
        );
        if (invalidCompanies.length > 0) {
          errors.push({ row: rowNum, column: companyHeader, message: `Invalid Company Name(s): ${invalidCompanies.join(', ')}` });
        }
      }
      
      // Check enum fields for products
      if (importType === 'products') {
        const typeHeader = columnMapping['type'];
        if (typeHeader && row[typeHeader]) {
          const val = String(row[typeHeader]).trim();
          if (!['Goods', 'Service', 'Combo'].includes(val)) {
            errors.push({ row: rowNum, column: typeHeader, message: `Invalid Product Type: "${val}". Must be Goods, Service, or Combo.` });
          }
        }

        const trackingHeader = columnMapping['trackingType'];
        if (trackingHeader && row[trackingHeader]) {
          const val = String(row[trackingHeader]).trim().toUpperCase();
          if (!['NONE', 'SERIAL', 'LOT'].includes(val)) {
            errors.push({ row: rowNum, column: trackingHeader, message: `Invalid Tracking Type: "${val}". Must be NONE or SERIAL.` });
          }
        }
      }

      // Check enum fields for contacts
      if (importType === 'contacts') {
        const typeHeader = columnMapping['type'];
        if (typeHeader && row[typeHeader]) {
          const val = String(row[typeHeader]).trim().toUpperCase();
          if (!['CUSTOMER', 'VENDOR', 'EMPLOYEE'].includes(val)) {
            errors.push({ row: rowNum, column: typeHeader, message: `Invalid Contact Type: "${val}". Must be CUSTOMER, VENDOR, or EMPLOYEE.` });
          }
        }
      }
      // Stats
      const extIdHeader = columnMapping['externalId'];
      if (extIdHeader && row[extIdHeader]) {
        const extId = String(row[extIdHeader]);
        const exists = importType === 'products' 
          ? (store.products || []).some((p: any) => p.externalId === extId)
          : (store.contacts || []).some((c: any) => c.externalId === extId);
        if (exists) stats.update++;
        else stats.new++;
      } else {
        stats.new++;
      }
    });

    setValidationErrors(errors);
    setImportStats(stats);
    if (errors.length === 0) setStep(3);
    return errors.length === 0;
  };

  const handleAiTest = async () => {
    if (!rawFileData || rawFileData.length === 0) return;
    setIsTesting(true);
    setError(null);
    setValidationErrors([]);

    try {
      
      const headers = Object.keys(rawFileData[0]);
      const sampleData = rawFileData.slice(0, 3);

      const prompt = `
        I have a file with the following headers: ${headers.join(', ')}.
        Here is some sample data: ${JSON.stringify(sampleData)}.
        Map these to my system's ${importType} fields.
        Return JSON with "mapping" (sysField: csvHeader) and "suggestions" (array of strings).
        System Fields: ${importType === 'products' ? 'externalId, name, sku, price, costPrice, lastPurchaseRate, quantityOnHand, type, category, brand, uom, description' : 'externalId, name, email, type, phone, address, openingBalance'}
      `;

      const { data: response, error } = await supabase.functions.invoke('gemini-chat', { body: { model: 'gemini-3-flash-preview', contents: prompt, config: { responseMimeType: 'application/json' } } }); if(error) throw error;

      const result = JSON.parse(response.text || '{"mapping":{}, "suggestions":[]}');
      setColumnMapping(prev => ({ ...prev, ...result.mapping }));
      setAiSuggestions(result.suggestions || []);
      
      // Local validation after AI mapping
      validateData();
    } catch (err: any) {
      setError(`AI Analysis Failed: ${err.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleFinalImport = async () => {
    if (!columnMapping || !rawFileData) return;
    
    if (!validateData()) {
      setError("Validation failed. Please fix the errors below before importing.");
      return;
    }

    setIsImporting(true);
    try {
      const transformed = rawFileData.map(row => {
        const mapped: any = {};
        Object.entries(columnMapping).forEach(([sysField, csvHeader]) => {
          if (csvHeader) {
            let val = row[csvHeader as string];
            if (['price', 'costPrice', 'lastPurchaseRate', 'quantityOnHand', 'openingBalance'].includes(sysField)) {
              val = Number(val) || 0;
            }
            if (sysField === 'companyIds' && val) {
              const names = String(val).split(',').map(s => s.trim().toLowerCase());
              val = names.map(name => {
                const found = (store.companies || []).find((c: any) => c.id === name || c.name.toLowerCase() === name);
                return found ? found.id : null;
              }).filter(Boolean);
            }
            mapped[sysField] = val;
          }
        });

        if (importType === 'products') {
          return {
            ...mapped,
            trackInventory: true,
            type: mapped.type || 'Goods',
            category: mapped.category || 'All',
            brand: mapped.brand || ''
          };
        } else {
          return {
            ...mapped,
            type: mapped.type === 'VENDOR' ? ContactType.VENDOR : 
                  mapped.type === 'EMPLOYEE' ? ContactType.EMPLOYEE : 
                  ContactType.CUSTOMER
          };
        }
      });

      setImportLogs([]);
      setError(null);

      if (importType === 'products') {
        const batchSize = 1000;
        const total = transformed.length;
        setImportProgress({ current: 0, total });
        setImportLogs([`Starting Product Master bulk import. Total record count: ${total}.`]);
        
        for (let i = 0; i < total; i += batchSize) {
          const chunk = transformed.slice(i, i + batchSize);
          const chunkNum = Math.floor(i / batchSize) + 1;
          const totalChunks = Math.ceil(total / batchSize);
          
          setImportLogs(prev => [...prev, `📦 [Batch ${chunkNum}/${totalChunks}]: Preparing ${chunk.length} products...`]);
          
          // 1. Send data to PostgreSQL via Supabase using the store
          await store.bulkImportProducts(chunk);
          setImportLogs(prev => [...prev, `✅ [Batch ${chunkNum}/${totalChunks}]: Upsert completed successfully. ${chunk.length} records processed.`]);
          
          setImportProgress({ current: Math.min(i + batchSize, total), total });
          // Introduce a short breather delay (250ms) to allow reactive state and live rendering to keep up smoothly without blocking the UI thread
          await new Promise(resolve => setTimeout(resolve, 250));
        }
      } else {
        const batchSize = 1000;
        const total = transformed.length;
        setImportProgress({ current: 0, total });
        setImportLogs([`Starting Contact Master bulk import. Total record count: ${total}.`]);
        
        for (let i = 0; i < total; i += batchSize) {
          const chunk = transformed.slice(i, i + batchSize);
          const chunkNum = Math.floor(i / batchSize) + 1;
          const totalChunks = Math.ceil(total / batchSize);
          
          setImportLogs(prev => [...prev, `📦 [Batch ${chunkNum}/${totalChunks}]: Preparing ${chunk.length} contacts...`]);
          
          // 1. Send data to PostgreSQL via Supabase using the store
          await store.bulkImportContacts(chunk);
          setImportLogs(prev => [...prev, `✅ [Batch ${chunkNum}/${totalChunks}]: Upsert completed successfully. ${chunk.length} records processed.`]);
          
          setImportProgress({ current: Math.min(i + batchSize, total), total });
          // Introduce a short breather delay (250ms) to allow reactive state and live rendering to keep up smoothly without blocking the UI thread
          await new Promise(resolve => setTimeout(resolve, 250));
        }
      }
      
      // Trigger cloud sync after a major bulk operation
      if (store.triggerCloudSync) {
        store.triggerCloudSync();
      }

      setImportComplete(true);
      setRawFileData(null);
      setColumnMapping(null);
      setValidationErrors([]);
    } catch (err: any) {
      setError(`Import Failed: ${err.message}`);
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-10 bg-slate-50 min-h-screen">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter">Advanced Data Import</h2>
          <p className="text-slate-500 font-medium">SAP & Odoo Style Bulk Processing with Row-Level Validation</p>
        </div>
        <div className="flex bg-slate-200 p-1.5 rounded-2xl shadow-inner">
          <button 
            onClick={() => { setImportType('products'); setRawFileData(null); setValidationErrors([]); }}
            className={`px-8 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${importType === 'products' ? 'bg-white text-indigo-600 shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Products
          </button>
          <button 
            onClick={() => { setImportType('contacts'); setRawFileData(null); setValidationErrors([]); }}
            className={`px-8 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${importType === 'contacts' ? 'bg-white text-indigo-600 shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Contacts
          </button>
        </div>
      </div>

      {importComplete && (
        <div className="bg-emerald-500 text-white p-6 rounded-3xl flex items-center justify-between shadow-2xl animate-in zoom-in duration-300">
          <div className="flex items-center space-x-6">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>
            </div>
            <div>
              <p className="font-black uppercase text-lg tracking-tight">Import Successful</p>
              <p className="text-sm font-bold opacity-90">All records have been processed and validated.</p>
            </div>
          </div>
          <button onClick={() => setImportComplete(false)} className="bg-white/20 hover:bg-white/30 p-2 rounded-full transition-all">✕</button>
        </div>
      )}

      {error && (
        <div className="bg-rose-500 text-white p-6 rounded-3xl flex items-center space-x-6 shadow-2xl animate-in shake duration-500">
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg>
          </div>
          <div>
            <p className="font-black uppercase text-lg tracking-tight">Import Error</p>
            <p className="text-sm font-bold opacity-90">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white p-10 rounded-[2.5rem] border-2 border-slate-100 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-bl-full -mr-10 -mt-10 z-0"></div>
            <div className="relative z-10">
              <div className="flex items-center space-x-4 mb-8">
                <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                </div>
                <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">1. Upload Source</h3>
              </div>
              
              <input type="file" accept=".csv,.xlsx,.xls" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
              
              {!rawFileData ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-4 border-dashed border-slate-100 rounded-[2rem] p-16 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-200 hover:bg-indigo-50/30 transition-all group"
                >
                  <div className="w-20 h-20 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 group-hover:text-indigo-400 transition-all">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
                  </div>
                  <p className="text-xl font-black text-slate-400 uppercase tracking-widest group-hover:text-indigo-600 transition-colors">Drop CSV File Here</p>
                  <p className="text-sm text-slate-300 font-bold mt-2">or click to browse your computer</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border-2 border-slate-100">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-800 uppercase tracking-tight">File Loaded Successfully</p>
                        <p className="text-xs font-bold text-slate-500">{rawFileData.length} records detected in source.</p>
                      </div>
                    </div>
                    <button onClick={() => setRawFileData(null)} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-50 transition-all">Change File</button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      onClick={validateData}
                      className="py-4 bg-white border-2 border-slate-900 text-slate-900 font-black rounded-2xl hover:bg-slate-50 transition-all flex items-center justify-center space-x-3"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                      <span>Validate Data</span>
                    </button>
                    <button 
                      onClick={handleAiTest}
                      disabled={isTesting}
                      className="py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center space-x-3"
                    >
                      {isTesting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>}
                      <span>AI Smart Map</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {validationErrors.length > 0 && (
            <div className="bg-white p-8 rounded-[2.5rem] border-2 border-rose-100 shadow-xl animate-in slide-in-from-bottom-4">
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-10 h-10 bg-rose-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-rose-100">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                </div>
                <h4 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Validation Errors ({validationErrors.length})</h4>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {validationErrors.map((err, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-rose-50 rounded-xl border border-rose-100">
                    <div className="flex items-center space-x-4">
                      <span className="text-[10px] font-black bg-rose-200 text-rose-700 px-2 py-1 rounded-md uppercase tracking-widest">Row {err.row}</span>
                      <span className="text-xs font-bold text-rose-800">{err.column}: {err.message}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {columnMapping && (
            <div className="bg-white p-10 rounded-[2.5rem] border-2 border-slate-100 shadow-xl">
              <h4 className="text-xl font-black text-slate-800 uppercase tracking-tighter mb-8 flex items-center">
                <span className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center text-xs mr-3">2</span>
                Field Mapping
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Object.keys(columnMapping).map(sysField => (
                  <div key={sysField} className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{sysField}</label>
                    <select 
                      value={columnMapping[sysField]} 
                      onChange={(e) => setColumnMapping({ ...columnMapping, [sysField]: e.target.value })}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    >
                      <option value="">-- Skip Field --</option>
                      {Object.keys(rawFileData?.[0] || {}).map(header => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="mt-10 pt-10 border-t border-slate-100">
                <button 
                  onClick={handleFinalImport}
                  disabled={isImporting || validationErrors.length > 0}
                  className="w-full py-5 bg-slate-900 text-white font-black rounded-3xl shadow-2xl hover:bg-slate-800 disabled:opacity-50 active:scale-95 transition-all flex flex-col items-center justify-center animate-out duration-300"
                >
                  <div className="flex items-center space-x-4">
                    {isImporting ? (
                      <div className="flex items-center space-x-2">
                        <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span>
                          {importProgress 
                            ? `Processing Batch: ${importProgress.current} / ${importProgress.total}`
                            : 'Importing...'
                          }
                        </span>
                      </div>
                    ) : (
                      <>
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>
                        <span className="text-lg uppercase tracking-wider">Execute Master Import</span>
                      </>
                    )}
                  </div>
                  {importStats.new + importStats.update > 0 && !importProgress && (
                    <div className="text-[10px] font-black text-white/60 uppercase tracking-widest mt-1">
                      {importStats.new} New • {importStats.update} Updates
                    </div>
                  )}
                  {importProgress && (
                    <div className="w-4/5 bg-white/20 h-2.5 rounded-full mt-4 overflow-hidden">
                      <div 
                        className="bg-emerald-400 h-full transition-all duration-300"
                        style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                      />
                    </div>
                  )}
                </button>
                {importLogs.length > 0 && (
                  <div className="mt-8 p-6 bg-slate-900 border border-slate-800 rounded-3xl font-mono text-xs text-slate-300 space-y-2 max-h-62 overflow-y-auto shadow-inner text-left">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-2">
                      <span className="text-[10px] uppercase font-black tracking-widest text-[#00A09D]">Forensic Import Terminal</span>
                      <span className="text-[9px] bg-slate-800 text-slate-400 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">Live Ledger Sync</span>
                    </div>
                    {importLogs.map((log, index) => (
                      <div key={index} className="flex items-start space-x-2 leading-relaxed">
                        <span className="text-slate-500 shrink-0">⏰ {new Date().toLocaleTimeString()}</span>
                        <span className={log.includes('✅') ? 'text-emerald-400 font-bold' : log.includes('⚡') ? 'text-cyan-400' : log.includes('❌') || log.includes('Failed') ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                          {log}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-8">
          <div className="bg-[#714B67] p-10 rounded-[2.5rem] shadow-2xl text-white relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-20 -mt-20 group-hover:scale-110 transition-transform duration-700"></div>
            <div className="relative z-10">
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-8 backdrop-blur-md">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tighter mb-4">Sample Templates</h3>
              <p className="text-white/70 text-sm font-medium mb-10 leading-relaxed">Download our professional ERP-grade templates to ensure 100% validation success.</p>
              
              <div className="space-y-4">
                <button 
                  onClick={() => downloadCSV(productTemplate, 'product_import_template.csv')}
                  className="w-full py-4 bg-white text-[#714B67] font-black rounded-2xl hover:bg-slate-50 transition-all flex items-center justify-center space-x-3 shadow-lg"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                  <span>Product Master</span>
                </button>
                <button 
                  onClick={() => downloadCSV(contactTemplate, 'contact_import_template.csv')}
                  className="w-full py-4 bg-white/10 border-2 border-white/20 text-white font-black rounded-2xl hover:bg-white/20 transition-all flex items-center justify-center space-x-3"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                  <span>Contact Master</span>
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] border-2 border-slate-100 shadow-xl">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 border-b pb-4">Import Protocol</h4>
            <div className="space-y-8">
              <div className="flex space-x-4">
                <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center font-black text-xs shrink-0">01</div>
                <div>
                  <p className="text-xs font-black text-slate-800 uppercase tracking-tight mb-1">Unique External ID</p>
                  <p className="text-[10px] text-slate-500 leading-relaxed">System uses External IDs for upsert. Existing IDs will be updated; new ones created.</p>
                </div>
              </div>
              <div className="flex space-x-4">
                <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center font-black text-xs shrink-0">02</div>
                <div>
                  <p className="text-xs font-black text-slate-800 uppercase tracking-tight mb-1">Stock Valuation</p>
                  <p className="text-[10px] text-slate-500 leading-relaxed">Quantity On Hand imports trigger automatic Opening Balance Equity entries.</p>
                </div>
              </div>
              <div className="flex space-x-4">
                <div className="w-8 h-8 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center font-black text-xs shrink-0">03</div>
                <div>
                  <p className="text-xs font-black text-slate-800 uppercase tracking-tight mb-1">Data Types</p>
                  <p className="text-[10px] text-slate-500 leading-relaxed">Numeric fields must contain only digits. Dates should follow ISO format.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExcelImporter;
