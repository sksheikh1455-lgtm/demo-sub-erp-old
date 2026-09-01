import fetch from 'node-fetch';
async function test() {
  const sql = `
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'docs_products';
  `;
  try {
    const res = await fetch('http://localhost:3000/api/execute-sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql })
    });
    console.log(await res.text());
  } catch (e) {
    console.log(e.message);
  }
}
test();
