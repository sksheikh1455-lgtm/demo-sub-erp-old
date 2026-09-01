import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');
import dotenv from "dotenv";
dotenv.config({ override: true });

import express from "express";
import nodemailer from "nodemailer";
import path from "path";
import pg from "pg";
import crypto from "crypto";
import { prisma } from "./lib/prisma.js";
import { backendOrchestratorRouter } from "./backend-routes.js";
import { authMiddleware } from "./lib/auth-middleware.js";

const { Client } = pg;


const __dirname = process.cwd();

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Custom robust CORS middleware with zero-dependencies
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    
    // Handle preflight OPTIONS request
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // Enterprise Supabase Proxy Route (handles direct database fetches cleanly bypassing mixed-content blockages in iframes)
  app.all("/api/supabase-proxy", async (req: any, res: any) => {
    try {
      const { path: relativePath } = req.query;
      if (!relativePath) {
        return res.status(400).json({ error: "Missing path parameter" });
      }

      let targetBase = process.env.VITE_SUPABASE_URL || "";
      if (targetBase && !targetBase.startsWith("http")) {
         targetBase = `https://${targetBase}.supabase.co`;
      }
      
      const targetUrl = `${targetBase}${relativePath}`;
console.log("PROXYING TO", targetUrl);

      const headers: Record<string, string> = {};
      const allowedHeaders = new Set([
        "content-type",
        "apikey",
        "authorization",
        "prefer",
        "x-client-info",
        "accept",
        "accept-language",
        "user-agent",
        "range",
        "if-none-match",
        "if-match",
        "if-modified-since"
      ]);

      for (const [key, val] of Object.entries(req.headers)) {
        const lowerKey = key.toLowerCase();
        if (typeof val === "string" && (allowedHeaders.has(lowerKey) || lowerKey.startsWith("x-") || lowerKey.startsWith("supabase-"))) {
          headers[key] = val;
        }
      }

      let body: any = undefined;
      if (req.method !== "GET" && req.method !== "HEAD") {
        if (Buffer.isBuffer(req.body)) {
          body = req.body;
        } else if (typeof req.body === "string") {
          body = Buffer.from(req.body);
        } else if (typeof req.body === "object" && req.body !== null && Object.keys(req.body).length > 0) {
          body = Buffer.from(JSON.stringify(req.body));
        } else {
          try {
            const chunks: any[] = [];
            for await (const chunk of req) {
              chunks.push(chunk);
            }
            if (chunks.length > 0) {
              body = Buffer.concat(chunks);
            }
          } catch (streamErr) {
            console.error("Stream read error:", streamErr);
          }
        }
      }

      const response = await fetch(targetUrl, {
        method: req.method,
        headers: headers,
        body: body,
      });

      response.headers.forEach((val, key) => {
        const lowerKey = key.toLowerCase();
        if (
          lowerKey !== "transfer-encoding" && 
          lowerKey !== "content-encoding" && lowerKey !== "content-length" && 
          lowerKey !== "connection" &&
          lowerKey !== "keep-alive" && !lowerKey.startsWith("access-control-")
        ) {
          res.setHeader(key, val);
        }
      });

      res.status(response.status);
      const resBuffer = await response.arrayBuffer();
      res.send(Buffer.from(resBuffer));
    } catch (err: any) {
      console.error("Supabase proxy error:", err);
      res.status(500).json({ error: err.message || "Proxy failed" });
    }
  });

  app.use(express.json());
  
  // SECURE ALL /api ROUTES WITH JWT MIDDLEWARE
  // Exclude /api/execute-sql from auth middleware for local admin
  app.use("/api", (req, res, next) => {
    if (req.path === '/execute-sql') return next();
    authMiddleware(req, res, next);
  });
  
  // Enterprise Orchestrator API
  app.use("/api", backendOrchestratorRouter);

  // SMTP Transporter
  
  app.post("/api/batch-payment", async (req: any, res: any) => {
    try {
      const { type, documentIds, amount, date, method, paymentCategory, reference, accountId, companyId } = req.body;
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '', {
         global: { headers: { Authorization: req.headers.authorization } }
      });
      
      if (!reference) {
         return res.status(400).json({ success: false, error: "Memo/Reference is required." });
      }

      // Check for double submission
      const { data: existing } = await supabase.from('docs_payments').select('id, data').eq('reference', reference);
      if (existing && existing.length > 0) {
         // Check if there is an exact match for date and amount to prevent double-clicks
         const isDuplicate = existing.some((p: any) => p.data?.amount === amount && p.data?.date === date);
         if (isDuplicate) {
            return res.status(400).json({ success: false, error: "Duplicate payment detected. A payment with this exact Memo, Amount, and Date already exists." });
         }
      }

      const isInvoice = type === 'INVOICE';
      const docTable = isInvoice ? 'docs_invoices' : 'docs_bills';
      
      const { data: rawDocs, error: docErr } = await supabase.from(docTable).select('data').in('id', documentIds);
      if (docErr) throw docErr;
      const docs = (rawDocs || []).map((d: any) => d.data);

      const groupedDocs = docs.reduce((acc: any, doc: any) => {
         const partnerId = isInvoice ? doc.customerId : doc.vendorId;
         acc[partnerId] = acc[partnerId] || [];
         acc[partnerId].push(doc);
         return acc;
      }, {});

      const { data: rawPayments } = await supabase.from('docs_payments').select('data').eq('company_id', companyId).eq('status', 'POSTED');
      const payments = (rawPayments || []).map((p: any) => p.data);

      let remainingBatchAmount = amount;
      const results = [];
      const { data: contacts } = await supabase.from('docs_contacts').select('id, data').in('id', Object.keys(groupedDocs));

      for (const [partnerId, groupDocs] of Object.entries(groupedDocs)) {
        if (remainingBatchAmount <= 0) break;
        
        const partnerDue = (groupDocs as any[]).reduce((sum: number, doc: any) => {
          const paid = payments.filter((p: any) => p.status === 'POSTED' && (isInvoice ? (p.invoiceId === doc.id || (p.appliedInvoices || p.applied_invoices || []).some((a: any) => a.invoiceId === doc.id)) : (p.billId === doc.id || (p.appliedBills || p.applied_bills || []).some((a: any) => a.billId === doc.id)))).reduce((s: number, p: any) => {
            if (isInvoice && p.invoiceId === doc.id) return s + p.amount;
            if (!isInvoice && p.billId === doc.id) return s + p.amount;
            const a = isInvoice ? (p.appliedInvoices || p.applied_invoices || []).find((ai: any) => ai.invoiceId === doc.id) : (p.appliedBills || p.applied_bills || []).find((ai: any) => ai.billId === doc.id);
            return s + (a?.amount || 0);
          }, 0);
          return sum + (doc.total - paid);
        }, 0);

        if (partnerDue > 0) {
          const allocateAmount = Math.min(remainingBatchAmount, partnerDue);
          
          const partnerName = contacts?.find((c: any) => c.id === partnerId)?.data?.name || partnerId;
          const refSuffix = Object.keys(groupedDocs).length > 1 ? ` (Partner ${partnerName})` : '';
          
          const payload: any = {
             id: crypto.randomUUID(),
             contactId: partnerId,
             amount: allocateAmount,
             date,
             method,
             paymentCategory,
             reference: `${reference}${refSuffix}`,
             companyId,
             accountId,
          };
          if (isInvoice) {
             payload.invoiceIds = (groupDocs as any[]).map(d => d.id);
          } else {
             payload.billIds = (groupDocs as any[]).map(d => d.id);
          }
          

          // Bypass DB RPC to avoid post_payment unique constraint crash on advance payments
          let data, error;
          try {
             // 1. Fetch unallocated advance payments
             const { data: advances } = await supabase.from('docs_payments').select('id, amount, applied_invoices, applied_bills')
                .eq('company_id', companyId)
                .eq('contact_id', partnerId)
                .eq('status', 'POSTED')
                .eq('type', isInvoice ? 'RECEIPT' : 'PAYMENT');
                
             let advanceUpdates = {};
             let remainingDocs = [...(groupDocs as any[])];
             
             // 2. Map and calculate unallocated amounts
             let availableAdvances = (advances || []).map(adv => {
                const applied = isInvoice ? adv.applied_invoices : adv.applied_bills;
                const appliedArr = Array.isArray(applied) ? applied : [];
                const appliedSum = appliedArr.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
                return { ...adv, unallocated: Number(adv.amount) - appliedSum, applied: appliedArr };
             }).filter(a => a.unallocated > 0);
             
             let docUnpaids = {};
             
             // 3. Apply advances to docs
             for (const doc of remainingDocs) {
                let docUnpaid = Number(doc.total);
                const paidByOthers = payments.filter((p: any) => p.status === 'POSTED' && (isInvoice ? (p.invoiceId === doc.id || (p.appliedInvoices || p.applied_invoices || []).some((a: any) => a.invoiceId === doc.id)) : (p.billId === doc.id || (p.appliedBills || p.applied_bills || []).some((a: any) => a.billId === doc.id)))).reduce((s: number, p: any) => {
                  if (isInvoice && p.invoiceId === doc.id) return s + p.amount;
                  if (!isInvoice && p.billId === doc.id) return s + p.amount;
                  const a = isInvoice ? (p.appliedInvoices || p.applied_invoices || []).find((ai: any) => ai.invoiceId === doc.id) : (p.appliedBills || p.applied_bills || []).find((ai: any) => ai.billId === doc.id);
                  return s + (a?.amount || 0);
                }, 0);
                docUnpaid -= paidByOthers;
                
                if (docUnpaid > 0) {
                   for (const adv of availableAdvances) {
                      if (docUnpaid <= 0) break;
                      if (adv.unallocated > 0) {
                         const alloc = Math.min(docUnpaid, adv.unallocated);
                         adv.unallocated -= alloc;
                         docUnpaid -= alloc;
                         
                         const newAlloc = isInvoice 
                            ? { invoiceId: doc.id, invoiceNumber: doc.number, amount: alloc }
                            : { billId: doc.id, billNumber: doc.number, amount: alloc };
                            
                         adv.applied.push(newAlloc);
                         advanceUpdates[adv.id] = adv.applied;
                      }
                   }
                }
                docUnpaids[doc.id] = docUnpaid;
             }
             
             // 4. Update advance payments in DB
             for (const [advId, newApplied] of Object.entries(advanceUpdates)) {
                const updateField = isInvoice ? { applied_invoices: newApplied } : { applied_bills: newApplied };
                await supabase.from('docs_payments').update(updateField).eq('id', advId);
             }
             
             // 4.5 Update invoice/bill statuses if they are fully paid by advances
             for (const doc of remainingDocs) {
                const docUnpaid = docUnpaids[doc.id] || 0;
                if (docUnpaid <= 0.01) {
                   await supabase.from(isInvoice ? 'docs_invoices' : 'docs_bills')
                     .update({ status: 'PAID' })
                     .eq('id', doc.id);
                } else if (docUnpaid < Number(doc.total)) {
                   await supabase.from(isInvoice ? 'docs_invoices' : 'docs_bills')
                     .update({ status: 'PARTIAL' })
                     .eq('id', doc.id);
                }
             }
             
             // 5. Create new payment if needed
             let newPaymentAmt = 0;
             let allocationsForNew = [];
             for (const doc of remainingDocs) {
                let docUnpaid = docUnpaids[doc.id] || 0;
                if (docUnpaid > 0 && remainingBatchAmount > 0) {
                   const alloc = Math.min(docUnpaid, remainingBatchAmount);
                   const newAlloc = isInvoice
                      ? { invoiceId: doc.id, invoiceNumber: doc.number, amount: alloc, remaining: docUnpaid - alloc }
                      : { billId: doc.id, billNumber: doc.number, amount: alloc, remaining: docUnpaid - alloc };
                   allocationsForNew.push(newAlloc);
                   remainingBatchAmount -= alloc;
                   newPaymentAmt += alloc;
                }
             }
             
             if (newPaymentAmt > 0 || (allocateAmount > 0 && allocationsForNew.length === 0 && Object.keys(advanceUpdates).length === 0)) {
                const newPaymentId = 'PAY-' + crypto.randomUUID();
                const insertData = {
                   id: newPaymentId,
                   company_id: companyId,
                   status: 'DRAFT',
                   type: isInvoice ? 'RECEIPT' : 'PAYMENT',
                   amount: newPaymentAmt > 0 ? newPaymentAmt : allocateAmount,
                   date: date,
                   payment_date: date,
                   contact_id: partnerId,
                   method: method,
                   reference: payload.reference,
                   account_id: accountId,
                   data: {
                      paymentCategory,
                      companyId,
                      accountId,
                      contactId: partnerId,
                      amount: newPaymentAmt > 0 ? newPaymentAmt : allocateAmount,
                      date,
                      method,
                      type: isInvoice ? 'RECEIPT' : 'PAYMENT'
                   },
                   applied_invoices: isInvoice ? allocationsForNew : [],
                   applied_bills: !isInvoice ? allocationsForNew : []
                };
                
                const { error: insErr } = await supabase.from('docs_payments').insert(insertData);
                if (insErr) throw insErr;
                
                // Call post_payment for the NEW payment
                const { data: postData, error: postErr } = await supabase.rpc('post_payment', { p_payment_id: newPaymentId, p_company_id: companyId });
                if (postErr) throw postErr;
                
                data = { success: true, payment_id: newPaymentId };
             } else {
                data = { success: true, payment_id: null, message: "Covered by advance payments" };
             }
             
          } catch (err) {
             error = err;
          }
          if (error) throw error;
          
          results.push(data);

          remainingBatchAmount -= allocateAmount;
        }
      }

      res.json({ success: true, results });
    } catch (error: any) {
      console.error("Batch payment error:", JSON.stringify(error));
      res.status(500).json({ success: false, error: error.message || error });
    }
  });


  const getTransporter = () => {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS?.replace(/\s/g, "");
    const isGmail = host?.includes("gmail.com") || user?.endsWith("@gmail.com");

    if (isGmail) {
      return nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: user,
          pass: pass,
        },
      });
    }

    return nodemailer.createTransport({
      host: host,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_PORT === "465",
      auth: {
        user: user,
        pass: process.env.SMTP_PASS,
      },
    });
  };

  // API routes
  app.post("/api/auth/invite", async (req, res) => {
    /* ... email logic ... */
    res.json({ success: true, message: "Email mocked to succeed while refactoring" });
  });

  app.post("/api/auth/register-user", async (req: any, res: any) => {
    const { id, name, username, email, pin, roleId, companyIds, isCashier, rules, invitationToken } = req.body;
    
    if (!id || !name || !username || !email || !pin) {
      return res.status(400).json({ error: "Missing required fields: id, name, username, email, pin must be provided" });
    }

    const rawDbUrl = process.env.DATABASE_URL;
    const connectionString = (rawDbUrl && (rawDbUrl.startsWith("postgres://") || rawDbUrl.startsWith("postgresql://")))
      ? rawDbUrl
      : process.env.DATABASE_URL;
    const client = new Client({ connectionString });

    try {
      await client.connect();
      const emailLower = email.toLowerCase();
      const usernameLower = username.toLowerCase();

      let password = pin;
      if (password.length < 6) {
        password = password.padEnd(6, "0");
      }

      // Check if Supabase auth user exists
      const { rows: existingAuth } = await client.query('SELECT id FROM auth.users WHERE email = $1', [emailLower]);
      let authUid;

      if (existingAuth.length > 0) {
        authUid = existingAuth[0].id;
        console.log(`Auth user already exists for ${emailLower}, updating password.`);
        await client.query(`
          UPDATE auth.users 
          SET encrypted_password = crypt($1, gen_salt('bf'))
          WHERE id = $2
        `, [password, authUid]);
      } else {
        // Create new auth user
        const newUserId = crypto.randomUUID();
        const { rows: newAuth } = await client.query(`
          INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, 
            recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, 
            confirmation_token, email_change, email_change_token_new, recovery_token
          ) VALUES (
            '00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', 
            $2, crypt($3, gen_salt('bf')), now(), NULL, NULL, 
            '{"provider":"email","providers":["email"]}', $4, now(), now(), 
            '', '', '', ''
          ) RETURNING id;
        `, [newUserId, emailLower, password, JSON.stringify({ old_id: id, name: name })]);

        authUid = newAuth[0].id;

        // Insert identity to allow login
        const identityId = crypto.randomUUID();
        await client.query(`
          INSERT INTO auth.identities (
            id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, provider_id
          ) VALUES (
            $1::uuid, $2::uuid, format('{"sub":"%s","email":"%s"}', $1::text, $3::text)::jsonb, 'email', now(), now(), now(), $1::text
          )
        `, [identityId, authUid, emailLower]);
      }

      // Ensure docs_users has row
      await client.query(`
        INSERT INTO docs_users (
          id, name, username, email, pin, role_id, status, company_ids, company_id, invitation_token, email_confirmed, user_uuid, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now()
        ) ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          username = EXCLUDED.username,
          email = EXCLUDED.email,
          pin = EXCLUDED.pin,
          role_id = EXCLUDED.role_id,
          status = EXCLUDED.status,
          company_ids = EXCLUDED.company_ids,
          company_id = EXCLUDED.company_id,
          user_uuid = COALESCE(EXCLUDED.user_uuid, docs_users.user_uuid),
          updated_at = now();
      `, [
        id,
        name,
        usernameLower,
        emailLower,
        pin,
        roleId || "role-accountant",
        "ACTIVE",
        companyIds || [],
        companyIds?.[0] || null,
        invitationToken || null,
        true,
        authUid
      ]);

      console.log(`Backend: Registered user ${usernameLower} / ${emailLower} with auth UUID: ${authUid}`);
      res.json({ success: true, user_uuid: authUid });
    } catch (err: any) {
      console.error("Error during register-user:", err);
      res.status(500).json({ error: err.message || "Failed to register user" });
    } finally {
      await client.end();
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    res.json({ success: true, message: "Email mocked to succeed" });
  });

  // ERP Data Sync Routes
  app.post("/api/execute-sql", async (req, res) => {
    try {
      const { sql } = req.body;
      const rawDbUrl = process.env.DATABASE_URL;
      const connectionString = (rawDbUrl && (rawDbUrl.startsWith("postgres://") || rawDbUrl.startsWith("postgresql://")))
        ? rawDbUrl
        : process.env.DATABASE_URL;
      
      const { Client } = await import('pg');
      const client = new Client({ connectionString });
      await client.connect();
      const result = await client.query(sql);
      await client.end();
      res.json({ success: true, result });
    } catch (e) {
      res.json({ success: false, error: e.message });
    }
  });
  
  app.get("/api/sync", async (req, res) => {
    try {
      const state = await prisma.storeState.findUnique({
        where: { id: "legacy_state" }
      });
      res.json(state?.data || {});
    } catch (error: any) {
      res.json({}); 
    }
  });

  app.post("/api/sync", async (req, res) => {
    try {
      const { data } = req.body;
      await prisma.storeState.upsert({
        where: { id: "legacy_state" },
        update: { data },
        create: { id: "legacy_state", data }
      });
      res.json({ success: true });
    } catch (error: any) {
      res.json({ success: false, error: "Database not connected" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
