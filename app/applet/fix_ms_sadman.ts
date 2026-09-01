import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  
  try {
      await client.query('BEGIN');
      
      const pId = 'd2ba33c6-eebb-4f81-83ec-352dbea89624'; 
      const cId = '2c9b09d4-1cb9-4898-bd87-a887c5b00f64'; // MS SADMAN TELICOM
      
      await client.query(`
          UPDATE docs_payments 
          SET contact_id = $1, 
              data = jsonb_set(data, '{contactId}', to_jsonb($1::text))
          WHERE id = $2
      `, [cId, pId]);
      
      console.log('Updated docs_payments');
      
      const jRes = await client.query(`
          SELECT journal_id FROM docs_journal_lines WHERE description LIKE '%CPAY/DRAFT-1ec6%' OR description LIKE '%SUL-001833%'
      `);
      
      const journalIds = [...new Set(jRes.rows.map(r => r.journal_id))];
      console.log('Found Journals:', journalIds);
      
      if (journalIds.length > 0) {
          for (let jId of journalIds) {
              await client.query(`
                  UPDATE docs_journal_lines SET contact_id = $1 WHERE journal_id = $2 AND contact_id = 'contact-cash-sale-global'
              `, [cId, jId]);
              
              const lines = await client.query(`
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'id', id, 
                    'accountId', account_id, 
                    'debit', debit, 
                    'credit', credit, 
                    'description', description, 
                    'contactId', contact_id
                  )
                ) as lines 
                FROM docs_journal_lines 
                WHERE journal_id = $1
              `, [jId]);
              
              await client.query(`
                  UPDATE docs_journals SET data = jsonb_set(data, '{lines}', $2::jsonb) WHERE id = $1
              `, [jId, lines.rows[0].lines]);
          }
          console.log('Updated journals');
      }

      const invId = '82b98fed-1ec6-45e9-af48-47caba524cd3';
      await client.query(`
          UPDATE docs_invoices 
          SET data = data - 'customer_id' 
          WHERE id = $1
      `, [invId]);
      
      await client.query('COMMIT');
      console.log('SUCCESS');
      
  } catch(e) {
      await client.query('ROLLBACK');
      console.log('Error:', e.message);
  } finally {
      await client.end();
  }
}
main();
