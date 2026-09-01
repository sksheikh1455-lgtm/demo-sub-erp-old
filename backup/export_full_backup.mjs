import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://buspgzsamhfmjrmmwpmo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Ic2uUZSJ3GaHP5XRpXm8lQ_ZmQUg0A-';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
});

const BACKUP_DIR = path.resolve('backup');
const DATA_DIR = path.join(BACKUP_DIR, 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const tablesToExport = [
  'docs_contacts',
  'docs_invoices',
  'docs_invoice_lines',
  'docs_bills',
  'docs_bill_lines',
  'docs_journals',
  'docs_journal_lines',
  'docs_payments',
  'docs_inventory_transactions',
  'docs_credit_notes',
  'docs_credit_note_lines',
  'docs_loans',
  'docs_accounts',
  'docs_companies',
  'docs_products',
  'docs_categories',
  'docs_brands',
  'docs_users',
  'docs_roles',
  'docs_user_company_access',
  'docs_attendance',
  'docs_warehouses'
];

function escapeSqlValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return isNaN(val) ? 'NULL' : String(val);
  if (typeof val === 'object') {
    const jsonStr = JSON.stringify(val).replace(/'/g, "''");
    return `'${jsonStr}'::jsonb`;
  }
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

async function exportTableData(tableName) {
  console.log(`[+] Exporting table: ${tableName}...`);
  const PAGE_SIZE = 1000;
  let allRows = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const from = page * PAGE_SIZE;
    const to = (page + 1) * PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .range(from, to);

    if (error) {
      console.warn(`[-] Error exporting ${tableName} at page ${page}:`, error.message);
      break;
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allRows.push(...data);
      if (data.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        page++;
        if (page % 5 === 0) {
          console.log(`    fetched ${allRows.length} rows so far...`);
        }
      }
    }
  }

  console.log(`[✓] Table ${tableName}: Total ${allRows.length} records exported.`);

  // Save JSON
  const jsonPath = path.join(DATA_DIR, `${tableName}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(allRows, null, 2), 'utf8');

  return { tableName, rows: allRows };
}

async function run() {
  console.log('=== Starting Full Database Backup ===\n');
  const tableDataMap = {};

  for (const table of tablesToExport) {
    const res = await exportTableData(table);
    tableDataMap[table] = res.rows;
  }

  console.log('\n[+] Generating SQL DDL Schema and INSERT statements...');

  let sqlDump = `-- =========================================================\n`;
  sqlDump += `-- FULL DATABASE BACKUP & RESTORE SCRIPT FOR SUBORNO ERP\n`;
  sqlDump += `-- Generated on: ${new Date().toISOString()}\n`;
  sqlDump += `-- =========================================================\n\n`;

  sqlDump += `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\n`;
  sqlDump += `CREATE EXTENSION IF NOT EXISTS "pgcrypto";\n\n`;

  // Write SQL inserts table by table
  for (const [table, rows] of Object.entries(tableDataMap)) {
    if (rows.length === 0) continue;
    
    sqlDump += `\n-- ---------------------------------------------------------\n`;
    sqlDump += `-- Data for table: ${table} (${rows.length} rows)\n`;
    sqlDump += `-- ---------------------------------------------------------\n`;

    const sampleRow = rows[0];
    const columns = Object.keys(sampleRow);

    const CHUNK_SIZE = 200;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      sqlDump += `INSERT INTO public.${table} (${columns.map(c => `"${c}"`).join(', ')})\nVALUES\n`;
      const valueRows = chunk.map(row => {
        const values = columns.map(col => escapeSqlValue(row[col]));
        return `  (${values.join(', ')})`;
      });
      sqlDump += valueRows.join(',\n') + `\nON CONFLICT (id) DO UPDATE SET\n`;
      sqlDump += columns.filter(c => c !== 'id').map(c => `  "${c}" = EXCLUDED."${c}"`).join(',\n') + `;\n\n`;
    }
  }

  const sqlDumpPath = path.join(BACKUP_DIR, 'data_backup.sql');
  fs.writeFileSync(sqlDumpPath, sqlDump, 'utf8');
  console.log(`[✓] Data SQL dump generated at: ${sqlDumpPath}`);

  // Summary
  console.log('\n=== Backup Summary ===');
  for (const [table, rows] of Object.entries(tableDataMap)) {
    if (rows.length > 0) {
      console.log(`- ${table}: ${rows.length} records`);
    }
  }
  console.log('\n=== Export Complete! ===');
}

run().catch(console.error);
