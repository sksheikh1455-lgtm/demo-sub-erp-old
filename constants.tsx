
import React from 'react';
import { Account, AccountType } from './types';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Global Currency Formatter for Bangladesh Taka (Accounting Format)
export const formatBDT = (amount: number) => {
  if (amount === undefined || amount === null || isNaN(amount)) return '0.00 ৳';
  const isNeg = amount < 0;
  const formatted = Math.abs(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${isNeg ? '-' : ''}${formatted} ৳`;
};

/**
 * Global Number Formatter for Indian Accounting Format
 */
export const formatNumber = (amount: number | string) => {
  if (amount === undefined || amount === null) return '0.00';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0.00';
  amount = num;
  return (amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

/**
 * Global Date-Time Formatter for Bangladesh Local Time (AM/PM)
 */
export const formatDateTime = (date: string | Date | number) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleString('en-BD', {
    timeZone: 'Asia/Dhaka',
    hour12: true,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

/**
 * Utility to export report data to CSV
 */

/**
 * Get operational date based on Bangladesh Standard Time (UTC+6).
 * Rolls over at 12:00 AM BST.
 */
export const getOpDateBST = () => {
  const dateObj = new Date();
  const bstTime = dateObj.getTime() + (6 * 60 * 60 * 1000);
  const bstDate = new Date(bstTime);
  return bstDate.toISOString().split('T')[0];
};

export const exportToCSV = (filename: string, rows: any[][]) => {
  const content = rows.map(r => r.map(cell => {
    const val = cell === null || cell === undefined ? '' : cell;
    return `"${val.toString().replace(/"/g, '""')}"`;
  }).join(',')).join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

/**
 * Utility to export report data to XLSX (Excel)
 */
export const exportToXLSX = (filename: string, rows: any[][]) => {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  
  // Auto-fit column widths for Excel
  const colWidths = rows[0].map((_, colIdx) => {
    const maxLen = rows.reduce((max, row) => {
      const cellVal = row[colIdx] ? row[colIdx].toString() : '';
      return Math.max(max, cellVal.length);
    }, 10);
    return { wch: maxLen + 2 };
  });
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
  
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Utility to prepare rows based on visible columns
 */
export const prepareExportRows = (data: any[], columns: { id: string, label: string, visible?: boolean }[], totals?: any) => {
  const visibleCols = columns.filter(c => c.visible !== false);
  const headers = visibleCols.map(c => c.label);
  const rows = data.map(item => visibleCols.map(c => {
    const val = item[c.id];
    if (typeof val === 'number') return val;
    return val || '';
  }));
  
  const result = [headers, ...rows];
  if (totals) {
    result.push(visibleCols.map(c => {
      const val = totals[c.id];
      if (typeof val === 'number') return val;
      return val || '';
    }));
  }
  return result;
};

/**
 * Utility to export report data to PDF
 */
export const exportToPDF = (filename: string, rows: any[][]) => {
  const doc = new jsPDF('landscape');
  
  doc.setFontSize(14);
  doc.text(filename.replace(/_/g, ' '), 14, 15);
  doc.setFontSize(9);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 22);

  const headers = rows[0];
  const data = rows.slice(1);

  autoTable(doc, {
    head: [headers],
    body: data,
    startY: 25,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  doc.save(`${filename}_${new Date().toISOString().split('T')[0]}.pdf`);
};

export const INITIAL_ACCOUNTS: Omit<Account, 'companyId'>[] = [
  { id: '100100', code: '100100', name: 'Cash', type: AccountType.ASSET, subType: 'CASH' },
  { id: '100201', code: '100201', name: 'Accounts Receivable', type: AccountType.ASSET, subType: 'ACCOUNTS_RECEIVABLE' },
  { id: '100300', code: '100300', name: 'Advance to Suppliers', type: AccountType.ASSET, subType: 'OTHER_CURRENT_ASSET' },
  { id: '100400', code: '100400', name: 'Prepaid Expenses', type: AccountType.ASSET, subType: 'OTHER_CURRENT_ASSET' },
  { id: '100501', code: '100501', name: 'Inventory Asset', type: AccountType.ASSET, subType: 'INVENTORY' },
  { id: '100502', code: '100502', name: 'Finished Goods', type: AccountType.ASSET, subType: 'INVENTORY' },
  { id: '200101', code: '200101', name: 'Accounts Payable', type: AccountType.LIABILITY, subType: 'ACCOUNTS_PAYABLE' },
  { id: '200201', code: '200201', name: 'Credit Card', type: AccountType.LIABILITY, subType: 'CREDIT_CARD' },
  { id: '200300', code: '200300', name: 'Advance from Customers', type: AccountType.LIABILITY, subType: 'OTHER_CURRENT_LIABILITY' },
  { id: '200400', code: '200400', name: 'VAT/Tax Payable', type: AccountType.LIABILITY, subType: 'OTHER_CURRENT_LIABILITY' },
  { id: '200500', code: '200500', name: 'Accrued Expenses', type: AccountType.LIABILITY, subType: 'OTHER_CURRENT_LIABILITY' },
  { id: '300100', code: '300100', name: "Owner's Equity", type: AccountType.EQUITY, subType: 'EQUITY' },
  { id: '300200', code: '300200', name: 'Retained Earnings', type: AccountType.EQUITY, subType: 'RETAINED_EARNINGS' },
  { id: '400100', code: '400100', name: 'Sales Revenue', type: AccountType.REVENUE, subType: 'REVENUE' },
  { id: '400200', code: '400200', name: 'Service Revenue', type: AccountType.REVENUE, subType: 'REVENUE' },
  { id: '400300', code: '400300', name: 'Discount Given', type: AccountType.REVENUE, subType: 'REVENUE' },
  { id: '400400', code: '400400', name: 'Other Income', type: AccountType.REVENUE, subType: 'OTHER_REVENUE' },
  { id: '500101', code: '500101', name: 'Cost of Goods Sold', type: AccountType.COST_OF_REVENUE, subType: 'COGS' },
  { id: '600100', code: '600100', name: 'Rent Expense', type: AccountType.EXPENSE, subType: 'EXPENSE' },
  { id: '600200', code: '600200', name: 'Utility Expense', type: AccountType.EXPENSE, subType: 'EXPENSE' },
  { id: '600300', code: '600300', name: 'Salary Expense', type: AccountType.EXPENSE, subType: 'EXPENSE' },
  { id: '600400', code: '600400', name: 'Office Supplies', type: AccountType.EXPENSE, subType: 'EXPENSE' },
  { id: '600500', code: '600500', name: 'Bank Charges', type: AccountType.EXPENSE, subType: 'EXPENSE' },
  { id: '600600', code: '600600', name: 'Travel Expense', type: AccountType.EXPENSE, subType: 'EXPENSE' },
  { id: '600700', code: '600700', name: 'Meals and Entertainment', type: AccountType.EXPENSE, subType: 'EXPENSE' },
  { id: '600800', code: '600800', name: 'Marketing & Advertising', type: AccountType.EXPENSE, subType: 'EXPENSE' },
  { id: '600900', code: '600900', name: 'Repairs & Maintenance', type: AccountType.EXPENSE, subType: 'EXPENSE' },
  { id: '601000', code: '601000', name: 'Inventory Shrinkage', type: AccountType.EXPENSE, subType: 'EXPENSE' }
];

export const ICONS = {
  Dashboard: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>,
  Journal: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>,
  Invoice: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>,
  Chart: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>,
  Import: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>,
  Settings: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
};

export const generateUUID = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
