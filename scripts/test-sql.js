import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function testSQL() {
  const client = new Client({ connectionString });
  await client.connect();

  // Catch notices
  client.on('notice', (msg) => {
    console.log('PG NOTICE:', msg.message);
  });

  async function getSeq() {
    const res = await client.query("SELECT last_value FROM company_doc_sequences WHERE company_code = 'CO' AND seq_group = 'BILL'");
    return res.rows[0]?.last_value;
  }
  
  const journals = await client.query("SELECT id, reference_number, journal_type, data->>'reference' as data_ref, company_id FROM docs_journals ORDER BY updated_at DESC LIMIT 20");
  console.log('Last 20 Journals:', journals.rows);

  const companyId = 'CO'; 
  const billId = 'TEST_BILL_' + Date.now();
  
  console.log('Initial Seq:', await getSeq());

  console.log('-- Simulating Bill Creation (DRAFT) via INSERT --');
  await client.query(`
    INSERT INTO docs_bills (id, company_id, data, status) 
    VALUES ($1, $2, $3, 'DRAFT')
  `, [billId, companyId, JSON.stringify({ status: 'DRAFT', number: 'DRAFT-123' })]);
  console.log('Seq after Insert:', await getSeq());

  console.log('-- Simulating updateBill (UPSERT to POSTED) --');
  // This is what store.updateBill does:
  const updatedData = { status: 'POSTED', number: 'DRAFT-123', someOtherField: 'value' };
  await client.query(`
    INSERT INTO docs_bills (id, company_id, data, status) 
    VALUES ($1, $2, $3, 'POSTED')
    ON CONFLICT (id) DO UPDATE SET 
      data = EXCLUDED.data,
      status = EXCLUDED.status,
      updated_at = NOW()
  `, [billId, companyId, JSON.stringify(updatedData)]);
  console.log('Seq after updateBill:', await getSeq());

  console.log('-- Simulating postBill (RPC UPDATE to POSTED) --');
  // This is what post_bill_v2 does:
  await client.query(`
    UPDATE docs_bills 
    SET status = 'POSTED', 
        data = jsonb_set(data, '{status}', '"POSTED"'),
        updated_at = NOW() 
    WHERE id = $1
  `, [billId]);
  console.log('Seq after postBill:', await getSeq());

  const seqs1 = await client.query("SELECT * FROM docs_document_sequences;");
  console.log('docs_document_sequences:', seqs1.rows);

  const seqs2 = await client.query("SELECT * FROM company_doc_sequences;");
  console.log('company_doc_sequences:', seqs2.rows);

  const bills = await client.query("SELECT id, bill_number, status, data->>'number' as data_num FROM docs_bills ORDER BY updated_at DESC LIMIT 10;");
  console.log('Bills:', bills.rows);

  await client.end();
}

testSQL();
