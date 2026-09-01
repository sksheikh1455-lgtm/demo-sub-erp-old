
import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function migrate() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log('Starting migration...');

  try {
    // 1. Migrate Invoices
    const invoices = await client.query('SELECT * FROM docs_invoices');
    for (const inv of invoices.rows) {
      const data = inv.data;
      if (!data) continue;

      // Update parent columns
      await client.query(`
        UPDATE docs_invoices 
        SET 
          date = $1, 
          customer_id = $2, 
          status = $3, 
          total = $4
        WHERE id = $5
      `, [data.date, data.customerId, data.status, data.total, inv.id]);

      // Migrate lines
      if (data.items && Array.isArray(data.items)) {
        for (const item of data.items) {
          const lineId = item.id || `LINE-${Date.now()}-${Math.random()}`;
          await client.query(`
            INSERT INTO docs_invoice_lines (id, invoice_id, company_id, product_id, quantity, unit_price, discount, tax, total, description)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (id) DO NOTHING
          `, [
            lineId, 
            inv.id, 
            inv.company_id, 
            item.productId, 
            item.quantity, 
            item.unitPrice, 
            item.discountValue || 0, 
            item.taxValue || 0, 
            (item.quantity * item.unitPrice) - (item.discountValue || 0) + (item.taxValue || 0),
            item.description || ''
          ]);

          // Create Inventory Transaction if status is POSTED/PAID
          if (['POSTED', 'PAID', 'PARTIAL'].includes(data.status) && item.type === 'PRODUCT') {
            await client.query(`
              INSERT INTO docs_inventory_transactions (id, company_id, product_id, transaction_type, quantity, reference_id, reference_type, date, unit_price)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              ON CONFLICT (id) DO NOTHING
            `, [
              `IT-INV-${lineId}`,
              inv.company_id,
              item.productId,
              'OUT',
              item.quantity,
              inv.id,
              'INVOICE',
              data.date,
              item.unitPrice
            ]);
          }
        }
      }
    }
    console.log('Invoices migrated.');

    // 2. Migrate Bills
    const bills = await client.query('SELECT * FROM docs_bills');
    for (const bill of bills.rows) {
      const data = bill.data;
      if (!data) continue;

      await client.query(`
        UPDATE docs_bills 
        SET 
          date = $1, 
          vendor_id = $2, 
          status = $3, 
          total = $4
        WHERE id = $5
      `, [data.date, data.vendorId || data.supplierId, data.status, data.total, bill.id]);

      if (data.items && Array.isArray(data.items)) {
        for (const item of data.items) {
          const lineId = item.id || `LINE-B-${Date.now()}-${Math.random()}`;
          await client.query(`
            INSERT INTO docs_bill_lines (id, bill_id, company_id, product_id, quantity, unit_price, discount, tax, total, description)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (id) DO NOTHING
          `, [
            lineId, 
            bill.id, 
            bill.company_id, 
            item.productId, 
            item.quantity, 
            item.unitPrice, 
            item.discountValue || 0, 
            item.taxValue || 0, 
            (item.quantity * item.unitPrice) - (item.discountValue || 0) + (item.taxValue || 0),
            item.description || ''
          ]);

          if (['POSTED', 'PAID', 'PARTIAL'].includes(data.status) && item.type === 'PRODUCT') {
            await client.query(`
              INSERT INTO docs_inventory_transactions (id, company_id, product_id, transaction_type, quantity, reference_id, reference_type, date, cost_price)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              ON CONFLICT (id) DO NOTHING
            `, [
              `IT-BIL-${lineId}`,
              bill.company_id,
              item.productId,
              'IN',
              item.quantity,
              bill.id,
              'BILL',
              data.date,
              item.unitPrice
            ]);
          }
        }
      }
    }
    console.log('Bills migrated.');

    // 3. Migrate Journals
    const journals = await client.query('SELECT * FROM docs_journals');
    for (const jrn of journals.rows) {
      const data = jrn.data;
      if (!data) continue;

      await client.query(`
        UPDATE docs_journals 
        SET 
          date = $1, 
          journal_type = $2, 
          status = $3
        WHERE id = $4
      `, [data.date, data.journalType || 'JOURNAL', data.status, jrn.id]);

      if (data.lines && Array.isArray(data.lines)) {
        for (const line of data.lines) {
          await client.query(`
            INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (id) DO NOTHING
          `, [
            line.id || `JL-${Date.now()}-${Math.random()}`,
            jrn.id,
            jrn.company_id,
            line.accountId,
            line.contactId || null,
            line.debit || 0,
            line.credit || 0,
            line.description || ''
          ]);
        }
      }
    }
    console.log('Journals migrated.');

    // 4. Migrate Products and Contacts basic columns
    const products = await client.query('SELECT * FROM docs_products');
    for (const prod of products.rows) {
      const data = prod.data;
      if (!data) continue;
      await client.query(`
        UPDATE docs_products 
        SET 
          name = $1, 
          sku = $2, 
          price = $3, 
          cost_price = $4
        WHERE id = $5
      `, [data.name, data.sku || data.barcode, data.price || 0, data.costPrice || data.initialCost || 0, prod.id]);
    }

    const contacts = await client.query('SELECT * FROM docs_contacts');
    for (const cont of contacts.rows) {
      const data = cont.data;
      if (!data) continue;
      await client.query(`
        UPDATE docs_contacts 
        SET 
          name = $1, 
          type = $2
        WHERE id = $3
      `, [data.name, data.type || 'BOTH', cont.id]);
    }

    const accounts = await client.query('SELECT * FROM docs_accounts');
    for (const acc of accounts.rows) {
      const data = acc.data;
      if (!data) continue;
      await client.query(`
        UPDATE docs_accounts 
        SET 
          name = $1, 
          code = $2
        WHERE id = $3
      `, [data.name, data.code, acc.id]);
    }
    console.log('Products, Contacts and Accounts column info updated.');

    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

migrate();
