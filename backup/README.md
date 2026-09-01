# Suborno ERP Database Backup & Restore Guide

This directory contains the **complete, standalone backup** of your Suborno ERP database.

---

## 📁 Backup Contents

| File / Folder | Description |
|---|---|
| [`01_schema_and_triggers.sql`](file:///c:/Users/user/Downloads/Suborno-ERP-main/Suborno-ERP-main/backup/01_schema_and_triggers.sql) | All PostgreSQL tables, indexes, triggers, and RPC functions. |
| [`data_backup.sql`](file:///c:/Users/user/Downloads/Suborno-ERP-main/Suborno-ERP-main/backup/data_backup.sql) | Complete SQL `INSERT` statements for all records (Invoices, Journals, Contacts, Payments, Inventory Transactions, Bills, Lines). |
| [`data/`](file:///c:/Users/user/Downloads/Suborno-ERP-main/Suborno-ERP-main/backup/data) | Raw JSON dumps of each table for portable data access. |

---

## 🚀 How to Restore on Local PostgreSQL

### Option 1: Using `psql` command line
Run the following commands in PowerShell / Terminal:

```bash
# 1. Create a fresh local database
createdb -U postgres suborno_erp

# 2. Restore schema, tables, triggers & RPCs
psql -U postgres -d suborno_erp -f backup/01_schema_and_triggers.sql

# 3. Restore all data
psql -U postgres -d suborno_erp -f backup/data_backup.sql
```

### Option 2: Using pgAdmin or DBeaver
1. Open pgAdmin / DBeaver and connect to your local PostgreSQL server.
2. Create a new database named `suborno_erp`.
3. Open Query Tool and run [`01_schema_and_triggers.sql`](file:///c:/Users/user/Downloads/Suborno-ERP-main/Suborno-ERP-main/backup/01_schema_and_triggers.sql).
4. Run [`data_backup.sql`](file:///c:/Users/user/Downloads/Suborno-ERP-main/Suborno-ERP-main/backup/data_backup.sql).

---

## ☁️ How to Restore to a New Supabase / Cloud Postgres Project
1. Create your new Supabase project at [https://supabase.com](https://supabase.com).
2. Go to **SQL Editor** in the Supabase Dashboard.
3. Paste and run [`01_schema_and_triggers.sql`](file:///c:/Users/user/Downloads/Suborno-ERP-main/Suborno-ERP-main/backup/01_schema_and_triggers.sql).
4. Run [`data_backup.sql`](file:///c:/Users/user/Downloads/Suborno-ERP-main/Suborno-ERP-main/backup/data_backup.sql) or connect via `psql` to import the data.
5. Update your local [`.env`](file:///c:/Users/user/Downloads/Suborno-ERP-main/Suborno-ERP-main/.env) file with the new project credentials.
