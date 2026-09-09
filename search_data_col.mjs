import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  "https://buspgzsamhfmjrmmwpmo.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM"
);
async function run() {
  const { data, error } = await supabase
    .from('docs_products')
    .select('id, name, sku, data')
    .textSearch('data', 'Fiber', { type: 'websearch' });
  console.log("By textSearch 'Fiber':", data?.length);
  if (data && data.length > 0) {
      console.log(data.filter(d => JSON.stringify(d).includes('4CORE')));
  }
  
  // also fetch all and filter in memory just to be safe
  let all = [];
  let page = 0;
  while(true) {
    const {data: pageData} = await supabase.from('docs_products').select('id, name, sku, data').range(page*1000, (page+1)*1000-1);
    if (!pageData || pageData.length === 0) break;
    all.push(...pageData);
    page++;
  }
  const found = all.filter(d => JSON.stringify(d).toLowerCase().includes('fiber'));
  console.log("Found in memory:", found.map(d => ({id: d.id, name: d.name, sku: d.sku, data_name: d.data?.name, data_sku: d.data?.sku})));
}
run();
