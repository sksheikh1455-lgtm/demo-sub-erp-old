import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
  host: 'db.buspgzsamhfmjrmmwpmo.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'sk445@raihan',
  database: 'postgres'
});

async function check() {
  await client.connect();
  console.log("Connected!");
  const res = await client.query('SELECT COUNT(*) FROM docs_products;');
  console.log("Total Products:", res.rows[0].count);
  
  const res2 = await client.query('SELECT id, name FROM docs_companies;');
  console.log("Companies:", res2.rows);

  const res3 = await client.query("SELECT COUNT(*) FROM docs_products WHERE 'comp-1' = ANY(company_ids);");
  console.log("Products in comp-1:", res3.rows[0].count);
  
  // Find Suborno New ID
  const subornoNew = res2.rows.find(c => c.name.toLowerCase() === 'suborno new');
  if (subornoNew) {
     const res4 = await client.query("SELECT COUNT(*) FROM docs_products WHERE $1 = ANY(company_ids);", [subornoNew.id]);
     console.log(`Products in Suborno New (${subornoNew.id}):`, res4.rows[0].count);
  } else {
     console.log("Suborno New not found in docs_companies table. Maybe it's stored differently.");
     
     // Let's check docs_users
     const res5 = await client.query("SELECT id, data FROM docs_users LIMIT 1;");
     if (res5.rows.length > 0) {
        const d = res5.rows[0].data;
        if (d && d.companies) {
           const subNew = d.companies.find(c => c.name.toLowerCase() === 'suborno new');
           if (subNew) {
              const res6 = await client.query("SELECT COUNT(*) FROM docs_products WHERE $1 = ANY(company_ids);", [subNew.id]);
              console.log(`Products in Suborno New (${subNew.id}):`, res6.rows[0].count);
           }
        }
     }
  }

  await client.end();
}

check().catch(console.error);
