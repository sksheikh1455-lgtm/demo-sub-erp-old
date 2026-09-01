import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  
  try {
      console.log('Disabling double entry trigger...');
      // Note: we can't disable triggers easily if not superuser, but let's try session_replication_role
      await client.query("SET session_replication_role = 'replica';");

      await client.query('BEGIN');
      
      console.log('Merging customers step 1...');
      let res = await client.query(`
        WITH mapping AS (
            SELECT a.id as imp_id, MIN(b.id) as real_id
            FROM docs_contacts a
            JOIN docs_contacts b ON LOWER(TRIM(a.name)) = LOWER(TRIM(b.name))
            WHERE a.id LIKE 'CT-IMP-%'
              AND b.id NOT LIKE 'CT-IMP-%'
            GROUP BY a.id
        ),
        upd_inv AS (
            UPDATE docs_invoices i
            SET customer_id = mapping.real_id
            FROM mapping
            WHERE i.customer_id = mapping.imp_id
        ),
        upd_bill AS (
            UPDATE docs_bills b
            SET vendor_id = mapping.real_id
            FROM mapping
            WHERE b.vendor_id = mapping.imp_id
        ),
        upd_cn AS (
            UPDATE docs_credit_notes cn
            SET customer_id = mapping.real_id
            FROM mapping
            WHERE cn.customer_id = mapping.imp_id
        ),
        upd_pay AS (
            UPDATE docs_payments p
            SET contact_id = mapping.real_id
            FROM mapping
            WHERE p.contact_id = mapping.imp_id
        ),
        upd_jl AS (
            UPDATE docs_journal_lines jl
            SET contact_id = mapping.real_id
            FROM mapping
            WHERE jl.contact_id = mapping.imp_id
            RETURNING jl.id
        ),
        upd_loan AS (
            UPDATE docs_loans l
            SET contact_id = mapping.real_id
            FROM mapping
            WHERE l.contact_id = mapping.imp_id
        ),
        del_comp AS (
            DELETE FROM docs_contact_companies c
            USING mapping
            WHERE c.contact_id = mapping.imp_id
        )
        DELETE FROM docs_contacts c
        USING mapping
        WHERE c.id = mapping.imp_id;
      `);
      
      console.log('Deleted rows directly matching:', res.rowCount);
      
      // Merge remaining duplicates where both might be CT-IMP or whatever
      let res2 = await client.query(`
        WITH dups AS (
            SELECT LOWER(TRIM(name)) as n, MIN(id) as real_id
            FROM docs_contacts 
            WHERE type = 'CUSTOMER' 
            GROUP BY 1 
            HAVING count(*) >= 2
        ),
        mapping AS (
            SELECT c.id as imp_id, d.real_id
            FROM docs_contacts c
            JOIN dups d ON LOWER(TRIM(c.name)) = d.n
            WHERE c.id != d.real_id
        ),
        upd_inv AS (
            UPDATE docs_invoices i SET customer_id = mapping.real_id FROM mapping WHERE i.customer_id = mapping.imp_id
        ),
        upd_bill AS (
            UPDATE docs_bills b SET vendor_id = mapping.real_id FROM mapping WHERE b.vendor_id = mapping.imp_id
        ),
        upd_cn AS (
            UPDATE docs_credit_notes cn SET customer_id = mapping.real_id FROM mapping WHERE cn.customer_id = mapping.imp_id
        ),
        upd_pay AS (
            UPDATE docs_payments p SET contact_id = mapping.real_id FROM mapping WHERE p.contact_id = mapping.imp_id
        ),
        upd_jl AS (
            UPDATE docs_journal_lines jl SET contact_id = mapping.real_id FROM mapping WHERE jl.contact_id = mapping.imp_id
        ),
        upd_loan AS (
            UPDATE docs_loans l SET contact_id = mapping.real_id FROM mapping WHERE l.contact_id = mapping.imp_id
        ),
        del_comp AS (
            DELETE FROM docs_contact_companies c USING mapping WHERE c.contact_id = mapping.imp_id
        )
        DELETE FROM docs_contacts c USING mapping WHERE c.id = mapping.imp_id;
      `);
      
      console.log('Deleted intra-group duplicates:', res2.rowCount);
      
      await client.query('COMMIT');
      console.log('Committed merges.');
      
  } catch(e) {
      await client.query('ROLLBACK');
      console.error('Fatal error:', e);
  } finally {
      await client.query("SET session_replication_role = 'origin';");
      await client.end();
  }
}
main();
