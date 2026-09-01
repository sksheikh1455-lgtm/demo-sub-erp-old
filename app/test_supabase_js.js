import { createClient } from "@supabase/supabase-js";
import fs from "fs";

// Load the DEV ENV URL and anon key safely 
const envStr = fs.readFileSync(".dev.env.json", "utf8");
const envData = JSON.parse(envStr);

const supabase = createClient(
  `https://${envData.VITE_SUPABASE_URL}.supabase.co`,
  envData.VITE_SUPABASE_ANON_KEY
);

async function run() {
  try {
    const invoiceId = "37fbe428-33e1-4c2b-b11b-47391f2e476c"; // invoice 1824
    const paymentDetails = { amount: 10, date: new Date().toISOString().split('T')[0], method: "CASH" };
    
    // Simulate what payInvoice does
    const { data } = await supabase.from('docs_invoices').select('*').eq('id', invoiceId).single();
    const inv = data.data;

    let paymentId = "PAY-TEST-FULL-JS";
    
    // simulate postPayment
    let paymentToSave = {
      status: "DRAFT", // because of safeStatus logic
      amount: paymentDetails.amount,
      date: paymentDetails.date,
      method: paymentDetails.method,
      contactId: inv.customerId,
      companyId: inv.companyId,
      type: "RECEIPT",
      reference: `CPAY/${inv.number}`,
      invoiceId: inv.id,
      appliedInvoices: [{
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        amount: paymentDetails.amount,
        remaining: 0
      }]
    };

    console.log("Upserting docs_payments...");
    const { data: ud, error: ue } = await supabase.from('docs_payments').upsert({
      id: paymentId,
      data: paymentToSave,
      company_id: paymentToSave.companyId,
      date: paymentToSave.date,
      contact_id: paymentToSave.contactId,
      status: paymentToSave.status,
      type: paymentToSave.type,
      amount: paymentToSave.amount,
      payment_date: paymentToSave.date,
      applied_invoices: paymentToSave.appliedInvoices,
      account_id: "comp-1-100100", 
      partner_account_id: "comp-1-100201",
      method: "CASH",
      updated_at: new Date().toISOString()
    });

    if (ue) {
      console.log("UPSERT ERROR:", ue);
      return;
    }

    console.log("Calling post_payment RPC...");
    const resp = await supabase.rpc('post_payment', {
      p_payment_id: paymentId,
      p_company_id: paymentToSave.companyId
    });

    if (resp.error) {
      console.log("RPC ERROR:", resp.error);
      return;
    }
    
    console.log("SUCCESS!", resp.data);

  } catch(e) {
    console.log("JS Exception:", e);
  }
}
run();
