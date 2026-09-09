import { supabase, TABLE_COLUMNS } from '../lib/supabase';

function mapLineItem(l: any) {
  if (!l) return l;
  return {
    ...l,
    productId: l.product_id || l.productId,
    unitPrice: l.unit_price || l.unitPrice,
    lineValue: l.line_value || l.lineValue,
    discountMode: l.discount_mode || l.discountMode,
    discountRate: l.discount_rate || l.discountRate,
    discountValue: l.discount_value || l.discountValue,
    serialNumbers: l.serial_numbers || l.serialNumbers,
    costPriceAtSale: l.cost_price_at_sale !== undefined ? (l.cost_price_at_sale === null ? null : Number(l.cost_price_at_sale)) : (l.costPriceAtSale !== undefined ? (l.costPriceAtSale === null ? null : Number(l.costPriceAtSale)) : null),
    accountId: l.account_id || l.accountId,
    contactId: l.contact_id || l.contactId,
    journalId: l.journal_id || l.journalId
  };
}

// 🌟 আলটিমেট হেল্পার: ডাটাবেসের সমস্ত স্নেক_কেসকে ফ্রন্টএন্ডের জন্য ক্যামেলকেস অবজেক্টে রূপান্তর করে
export function mapDatabaseRowToFrontend(row: any) {
  if (!row) return row;
  const { company_id, ...rest } = row;
  
  const mappedNumber = rest.invoice_number || rest.bill_number || rest.payment_number ||
                       rest.credit_note_number || rest.cn_number || rest.loan_number;

  const cleanRest = Object.fromEntries(Object.entries(rest).filter(([_, v]) => v !== null && v !== undefined && v !== ""));
  return {
    ...(rest.data || {}),
    ...cleanRest,
    id: row.id,
    companyId: company_id || row.companyId,
    customerId: rest.customer_id || rest.customerId || null,
    vendorId: rest.vendor_id || rest.vendorId || null,
    costPrice: rest.cost_price !== undefined ? Number(rest.cost_price) : (rest.costPrice ? Number(rest.costPrice) : 0),
    price: rest.price !== undefined ? Number(rest.price) : (rest.price ? Number(rest.price) : 0),
    total: rest.total !== undefined ? Number(rest.total) : 0,
    subtotal: rest.subtotal !== undefined ? Number(rest.subtotal) : 0,
    number: mappedNumber || rest.number || null,
    reference: rest.journal_number || rest.reference_number || rest.reference || null,
    journalType: rest.journal_type || rest.journalType || null,
    journalId: rest.journal_id || rest.journalId || null,
    accountId: rest.account_id || rest.accountId || null,
    contactId: rest.contact_id || rest.contactId || null,
    createdById: rest.created_by_id || rest.createdById || rest.data?.createdById || null,
    preparedBy: rest.prepared_by || rest.preparedBy || rest.data?.preparedBy || null,
    roleId: rest.role_id || rest.roleId || null,
    companyIds: rest.company_ids || rest.companyIds || [],
    userUuid: rest.user_uuid || rest.userUuid || null,
    emailConfirmed: rest.email_confirmed !== undefined ? rest.email_confirmed : rest.emailConfirmed,
    invitationToken: rest.invitation_token || rest.invitationToken || null,
    createdAt: rest.created_at || rest.createdAt || null,
    updatedAt: rest.updated_at || rest.updatedAt || null,
    isSystem: rest.is_system !== undefined ? rest.is_system : rest.isSystem,
    subType: rest.sub_type !== undefined ? rest.sub_type : rest.subType,
    // Invoice/Bill specific mapping
    invoiceNumber: rest.invoice_number || rest.invoiceNumber || null,
    invoiceDate: rest.invoice_date || rest.invoiceDate || null,
    dueDate: rest.due_date || rest.dueDate || null,
    customerNote: rest.customer_note || rest.customerNote || rest.data?.customerNote || null,
    deliveryPerson: rest.delivery_person || rest.deliveryPerson || rest.data?.deliveryPerson || null,
    salesperson: rest.salesperson || rest.data?.salesperson || null,
    billNumber: rest.bill_number || rest.billNumber || null,
    billDate: rest.bill_date || rest.billDate || null,
    note: rest.note || rest.data?.note || null,
    taxTotal: rest.tax_total !== undefined ? Number(rest.tax_total) : (rest.taxTotal !== undefined ? Number(rest.taxTotal) : 0),
    discountTotal: rest.discount_total !== undefined ? Number(rest.discount_total) : (rest.discountTotal !== undefined ? Number(rest.discountTotal) : 0),
    totalProfit: rest.total_profit !== undefined ? Number(rest.total_profit) : (rest.totalProfit !== undefined ? Number(rest.totalProfit) : 0),
    // Loan specific mapping
    principalAmount: rest.principal_amount !== undefined ? Number(rest.principal_amount) : (rest.principalAmount ? Number(rest.principalAmount) : 0),
    interestRate: rest.interest_rate !== undefined ? Number(rest.interest_rate) : (rest.interestRate ? Number(rest.interestRate) : 0),
    termMonths: rest.term_months !== undefined ? Number(rest.term_months) : (rest.termMonths ? Number(rest.termMonths) : 1),
    interestType: rest.interest_type || rest.interestType || 'REDUCING',
    startDate: rest.start_date || rest.startDate || null,
    paidPeriods: rest.paid_periods || rest.paidPeriods || [],
    amortizationSchedule: rest.amortization_schedule || rest.amortizationSchedule || [],
    journalEntryId: rest.journal_entry_id || rest.journalEntryId || null,
  };
}



async function fetchChunkedJournalLines(ids) {
  const chunkSize = 50;
  let allLines = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data } = await supabase.from('docs_journal_lines').select('*').in('journal_id', chunk).or('debit.neq.0,credit.neq.0').order('id', { ascending: true });
    if (data) allLines.push(...data);
  }
  return allLines;
}

async function fetchChunkedLines(table: string, fkField: string, ids: string[]) {
  const chunkSize = 50;
  let allLines = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data } = await (supabase.from(table as any) as any)
      .select('*')
      .in(fkField, chunk)
      .order('display_index', { ascending: true, nullsFirst: false });
    if (data) allLines.push(...data);
  }
  return allLines;
}

export const dbService = {
  async getDocs(table: string, companyIds?: string[]) {
    let query = table === 'docs_users' ? supabase.from(table).select('id, name, username, email, role_id, status, company_id, company_ids, pin, user_uuid, email_confirmed, updated_at') : supabase.from(table).select('*');
    if (companyIds && companyIds.length > 0) {
      query = query.in('company_id', companyIds);
    }
    const { data, error } = await query;
    if (table === 'docs_companies' && data) {
      const comp1 = data.find((c: any) => c.id === 'comp-1');
      if (comp1 && comp1.name === 'Default Company') {
        comp1.name = 'SUBORNO ELECTRIC';
        comp1.code = 'SUL';
      }
    }
    if (error) throw error;
    
    let linesMap: Record<string, any[]> = {};
    if (data && data.length > 0) {
      const ids = data.map((r: any) => r.id);
      if (table === 'docs_invoices') {
        const lines = await fetchChunkedLines('docs_invoice_lines', 'invoice_id', ids);
        (lines || []).forEach((l: any) => {
          const invId = l.invoice_id || l.invoiceId;
          if (!linesMap[invId]) linesMap[invId] = [];
          linesMap[invId].push(mapLineItem(l));
        });
      } else if (table === 'docs_bills') {
        const lines = await fetchChunkedLines('docs_bill_lines', 'bill_id', ids);
        (lines || []).forEach((l: any) => {
          const bId = l.bill_id || l.billId;
          if (!linesMap[bId]) linesMap[bId] = [];
          linesMap[bId].push(mapLineItem(l));
        });
      } else if (table === 'docs_credit_notes') {
        const lines = await fetchChunkedLines('docs_credit_note_lines', 'credit_note_id', ids);
        (lines || []).forEach((l: any) => {
          const cId = l.credit_note_id || l.creditNoteId;
          if (!linesMap[cId]) linesMap[cId] = [];
          linesMap[cId].push(mapLineItem(l));
        });
      } else if (table === 'docs_journals') {
        const lines = await fetchChunkedJournalLines(ids);
        (lines || []).forEach((l: any) => {
          const jId = l.journal_id || l.journalId;
          if (!linesMap[jId]) linesMap[jId] = [];
          linesMap[jId].push(mapLineItem(l));
        });
      }
    }

    return (data || []).map(row => {
      const mappedRow = mapDatabaseRowToFrontend(row);
      if (table === 'docs_invoices' || table === 'docs_bills' || table === 'docs_credit_notes') {
        if (linesMap[row.id] && linesMap[row.id].length > 0) {
          const dbLines = linesMap[row.id].sort((a: any, b: any) => (a.display_index ?? a.displayIndex ?? 0) - (b.display_index ?? b.displayIndex ?? 0)); const dataItems = mappedRow.items || []; mappedRow.items = dbLines.map((dbLine: any) => { const matchingDataLine = dataItems.find((di: any) => di.id === dbLine.id); return matchingDataLine ? { ...matchingDataLine, ...dbLine } : dbLine; });
        } else if (!mappedRow.items || mappedRow.items.length === 0) {
          mappedRow.items = [];
        }
      } else if (table === 'docs_journals') {
        mappedRow.lines = (linesMap[row.id] || []).filter((l: any) => Number(l.debit) !== 0 || Number(l.credit) !== 0);
        if (mappedRow.data && Array.isArray(mappedRow.data.lines)) {
          mappedRow.data.lines = mappedRow.data.lines.filter((l: any) => Number(l.debit) !== 0 || Number(l.credit) !== 0);
        }
      }
      return mappedRow;
    });
  },
  
  async getPaginatedDocs(table: string, options: {
    companyIds?: string[],
    limit?: number,
    offset?: number,
    filters?: any,
    sortField?: string,
    sortOrder?: 'asc' | 'desc',
    search?: string,
    countType?: 'exact' | 'estimated' | 'planned'
  }) {
    try {
      return await this._getPaginatedDocs(table, options);
    } catch(e: any) {
      console.error("GET_PAGINATED_DOCS ERROR for table", table, e?.stack || e);
      throw e;
    }
  },
  async _getPaginatedDocs(table: string, options: { 
    companyIds?: string[], 
    limit?: number, 
    offset?: number, 
    filters?: any,
    sortField?: string,
    sortOrder?: 'asc' | 'desc',
    search?: string,
    countType?: 'exact' | 'estimated' | 'planned'
  }) {
    const countOption = options.countType || (table === 'docs_products' ? 'exact' : 'estimated');
    let query = table === 'docs_users' ? supabase.from(table).select('id, name, username, email, role_id, status, company_id, company_ids, pin, user_uuid, email_confirmed, updated_at', { count: countOption }) : supabase.from(table).select('*', { count: countOption });
    
    if (options.companyIds && options.companyIds.length > 0) {
      if (table === 'docs_products' || table === 'docs_contacts' || table === 'docs_users') {
        const idList = options.companyIds.map(id => `"${id}"`).join(',');
        const textArrayFormat = options.companyIds.join(',');
        // For array overlap, PostgREST uses ov. For JSONB contains, cs.
        // We will do a generic OR that catches company_id or company_ids as jsonb or text array.
        const orQuery = options.companyIds.map(id => 
          `company_id.eq."${id}",company_ids.cs.{${id}}`
        ).join(',');
        query = query.or(orQuery);
      } else {
        query = query.in('company_id', options.companyIds);
      }
    }

    if (options.search) {
      const s = options.search.trim();
      const sEscaped = s;
      if (sEscaped) {
        let terms = sEscaped.split(/\s+/).filter(Boolean);
        if (terms.length > 5 || sEscaped.length > 50) terms = [sEscaped];
        if (terms.length > 0) {
          terms.forEach((term, idx) => {
            const safeTerm = term.replace(/"/g, '""');
            const tMatch = `"%${safeTerm}%"`;
            if (table === 'docs_journals') {
              let jOr = `journal_number.ilike.${tMatch},reference_number.ilike.${tMatch},reference.ilike.${tMatch},description.ilike.${tMatch}`;
              if (idx === 0 && terms.length === 1) jOr = `id.eq."${sEscaped.replace(/"/g, '""')}",id.ilike."%${sEscaped.replace(/"/g, '""')}%",` + jOr;
              query = query.or(jOr);
            } else {
              const allowed = TABLE_COLUMNS[table] || [];
              const orClauses: string[] = [];
              if (allowed.includes('id') && idx === 0 && terms.length === 1) orClauses.push(`id.eq."${sEscaped.replace(/"/g, '""')}"`);
              if (allowed.includes('name')) {
                orClauses.push(`name.ilike.${tMatch}`);
                orClauses.push(`data->>name.ilike.${tMatch}`);
              }
              if (allowed.includes('sku')) {
                orClauses.push(`sku.ilike.${tMatch}`);
                orClauses.push(`data->>sku.ilike.${tMatch}`);
              }
              if (allowed.includes('invoice_number')) orClauses.push(`invoice_number.ilike.${tMatch}`);
              if (allowed.includes('bill_number')) orClauses.push(`bill_number.ilike.${tMatch}`);
              if (allowed.includes('payment_number')) orClauses.push(`payment_number.ilike.${tMatch}`);
              if (allowed.includes('reference')) orClauses.push(`reference.ilike.${tMatch}`);
              if (allowed.includes('description')) orClauses.push(`description.ilike.${tMatch}`);
              if (orClauses.length > 0) {
                query = query.or(orClauses.join(','));
              }
            }
          });
        }
      }
    }

    if (options.filters) {
       Object.entries(options.filters).forEach(([key, value]) => {
         if (value !== undefined && value !== null && value !== '') {
           if (key === 'startDate') {
             query = query.gte('date', value);
             return;
           }
           if (key === 'endDate') {
             query = query.lte('date', value);
             return;
           }
           const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
           if (Array.isArray(value)) {
             if (value.some(v => typeof v === 'string' && v.includes('%'))) {
                const orString = value.map(v => `${snakeKey}.ilike.${v}`).join(',');
                query = query.or(orString);
             } else {
                query = query.in(snakeKey, value);
             }
           } else if (typeof value === 'string' && value.includes('%')) {
             query = query.ilike(snakeKey, value);
           } else {
             query = query.eq(snakeKey, value);
           }
         }
       });
    }

    const allowedColumns = TABLE_COLUMNS[table] || [];
    let numberSortField = null;
    if (allowedColumns.includes('invoice_number')) numberSortField = 'invoice_number';
    else if (allowedColumns.includes('bill_number')) numberSortField = 'bill_number';
    else if (allowedColumns.includes('payment_number')) numberSortField = 'payment_number';
    else if (allowedColumns.includes('journal_number')) numberSortField = 'journal_number';
    else if (allowedColumns.includes('credit_note_number')) numberSortField = 'credit_note_number';
    else if (allowedColumns.includes('loan_number')) numberSortField = 'loan_number';

    const hasCreatedAt = allowedColumns.includes('created_at');
    const hasUpdatedAt = allowedColumns.includes('updated_at');

    let primarySortField = options.sortField;
    if (primarySortField) {
      const snakeSortField = primarySortField.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      if (!allowedColumns.includes(snakeSortField)) {
        primarySortField = undefined;
      }
    }

    if (primarySortField) {
      const snakeSortField = primarySortField.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      query = query.order(snakeSortField, { ascending: options.sortOrder === 'asc' });
      const secondarySort = numberSortField ? numberSortField : (hasCreatedAt ? 'created_at' : (hasUpdatedAt ? 'updated_at' : 'id'));
      if (snakeSortField !== secondarySort) {
        query = query.order(secondarySort, { ascending: false });
      }
    } else {
      const fallbackSort = numberSortField ? numberSortField : (hasCreatedAt ? 'created_at' : (hasUpdatedAt ? 'updated_at' : 'id'));
      query = query.order(fallbackSort, { ascending: false });
    }

    if (options.limit) {
      const from = options.offset || 0;
      const to = from + options.limit - 1;
      query = query.range(from, to);
    }

    const { data, error, count } = await query;
    if (error) throw error;
    
    let linesMap: Record<string, any[]> = {};
    if (data && data.length > 0) {
      const ids = data.map((r: any) => r.id);
      if (table === 'docs_invoices') {
        const lines = await fetchChunkedLines('docs_invoice_lines', 'invoice_id', ids);
        (lines || []).forEach((l: any) => {
          const invId = l.invoice_id || l.invoiceId;
          if (!linesMap[invId]) linesMap[invId] = [];
          linesMap[invId].push(mapLineItem(l));
        });
      } else if (table === 'docs_bills') {
        const lines = await fetchChunkedLines('docs_bill_lines', 'bill_id', ids);
        (lines || []).forEach((l: any) => {
          const bId = l.bill_id || l.billId;
          if (!linesMap[bId]) linesMap[bId] = [];
          linesMap[bId].push(mapLineItem(l));
        });
      } else if (table === 'docs_credit_notes') {
        const lines = await fetchChunkedLines('docs_credit_note_lines', 'credit_note_id', ids);
        (lines || []).forEach((l: any) => {
          const cId = l.credit_note_id || l.creditNoteId;
          if (!linesMap[cId]) linesMap[cId] = [];
          linesMap[cId].push(mapLineItem(l));
        });
      } else if (table === 'docs_journals') {
        const lines = await fetchChunkedJournalLines(ids);
        (lines || []).forEach((l: any) => {
          const jId = l.journal_id || l.journalId;
          if (!linesMap[jId]) linesMap[jId] = [];
          linesMap[jId].push(mapLineItem(l));
        });
      }
    }

    const mappedData = (data || []).map(row => {
      const mappedRow = mapDatabaseRowToFrontend(row);
      if (table === 'docs_invoices' || table === 'docs_bills' || table === 'docs_credit_notes') {
        if (linesMap[row.id] && linesMap[row.id].length > 0) {
          const dbLines = linesMap[row.id].sort((a: any, b: any) => (a.display_index ?? a.displayIndex ?? 0) - (b.display_index ?? b.displayIndex ?? 0)); const dataItems = mappedRow.items || []; mappedRow.items = dbLines.map((dbLine: any) => { const matchingDataLine = dataItems.find((di: any) => di.id === dbLine.id); return matchingDataLine ? { ...matchingDataLine, ...dbLine } : dbLine; });
        } else if (!mappedRow.items || mappedRow.items.length === 0) {
          mappedRow.items = [];
        }
      } else if (table === 'docs_journals') {
        mappedRow.lines = (linesMap[row.id] || []).filter((l: any) => Number(l.debit) !== 0 || Number(l.credit) !== 0);
        if (mappedRow.data && Array.isArray(mappedRow.data.lines)) {
          mappedRow.data.lines = mappedRow.data.lines.filter((l: any) => Number(l.debit) !== 0 || Number(l.credit) !== 0);
        }
      }
      return mappedRow;
    });

    return { data: mappedData, count: count || 0 };
  },

  async getAccountBalances(companyIds: string[]): Promise<Record<string, number>> {
    try {
      // High-Performance RPC: Avoids clientside fetching and leverages PostgreSQL grouping index.
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase.rpc('get_all_account_balances', {
        p_company_ids: companyIds,
        p_as_of_date: today
      });

      if (error) throw error;
      
      const balances: Record<string, number> = {};
      if (data) {
        (data as any[]).forEach((row: any) => {
          balances[row.account_id] = Number(row.balance) || 0;
        });
      }
      
      return balances;
    } catch (error) {
      console.error('getAccountBalances error:', error);
      return {};
    }
  },

  async getPartnerBalances(companyIds: string[]): Promise<Record<string, number>> {
    try {
      const balances: Record<string, number> = {};
      
      const { data: customerData, error: custError } = await supabase.rpc('get_partner_summary', {
        p_company_ids: companyIds,
        p_contact_type: 'CUSTOMER'
      });
      if (!custError && customerData) {
        customerData.forEach((row: any) => { 
          balances[row.contact_id] = Number(row.balance) || 0;
        });
      }

      const { data: vendorData, error: vendError } = await supabase.rpc('get_partner_summary', {
        p_company_ids: companyIds,
        p_contact_type: 'VENDOR'
      });
      if (!vendError && vendorData) {
        vendorData.forEach((row: any) => { 
          balances[row.contact_id] = Number(row.balance) || 0;
        });
      }
      
      return balances;
    } catch (error) {
      console.error('getPartnerBalances error:', error);
      return {};
    }
  },
  
  async upsertDoc(table: string, id: string, docData: any) {
    const companyId = docData.companyId || (docData.companyIds && docData.companyIds[0]);
    
    // Sanitize any frontend-only fields
    const cleanDoc = { ...docData };
    const tempKeys = [
      'isSyncing', 'isEditing', 'tempId', 'isTemp', '_localId', 
      'localId', 'syncState', 'syncAction', 'isOfflineOnly'
    ];
    tempKeys.forEach(k => delete cleanDoc[k]);

    // 🌟 100% CLEAN RELATIONAL PAYLOAD (No 'data' jsonb wrapper field!)
    const payload: any = {
      id,
      company_id: companyId,
      updated_at: new Date().toISOString()
    };

    if (table === 'docs_invoices') {
      payload.invoice_date = cleanDoc.date || cleanDoc.invoiceDate;
      payload.customer_id = cleanDoc.customerId || cleanDoc.contactId;
      payload.status = cleanDoc.status || 'DRAFT';
      payload.total = Number(cleanDoc.total || 0);
      payload.subtotal = Number(cleanDoc.subtotal || 0);
      payload.invoice_number = cleanDoc.number || cleanDoc.invoiceNumber;
      payload.data = cleanDoc;
    } else if (table === 'docs_bills') {
      payload.bill_date = cleanDoc.date || cleanDoc.billDate;
      payload.vendor_id = cleanDoc.vendorId || cleanDoc.supplierId;
      payload.status = cleanDoc.status || 'DRAFT';
      payload.total = Number(cleanDoc.total || 0);
      payload.bill_number = cleanDoc.number || cleanDoc.billNumber;
      payload.data = cleanDoc;
    } else if (table === 'docs_journals') {
      payload.date = cleanDoc.date;
      payload.journal_type = cleanDoc.journalType || 'JOURNAL';
      payload.status = cleanDoc.status || 'DRAFT';
      payload.journal_number = cleanDoc.reference || cleanDoc.number;
      payload.data = cleanDoc;
    } else if (table === 'docs_products') {
      payload.name = cleanDoc.name;
      payload.sku = cleanDoc.sku || `SKU-${id.substring(0, 8)}`;
      payload.price = Number(cleanDoc.price || 0);
      
      if (cleanDoc.trackInventory !== undefined) payload.track_inventory = cleanDoc.trackInventory !== false;
      if (cleanDoc.canBeSold !== undefined) payload.can_be_sold = cleanDoc.canBeSold !== false;
      if (cleanDoc.canBePurchased !== undefined) payload.can_be_purchased = cleanDoc.canBePurchased !== false;
      if (cleanDoc.isInPos !== undefined) payload.is_in_pos = cleanDoc.isInPos;
      if (cleanDoc.taxCode !== undefined) payload.tax_code = cleanDoc.taxCode;
      
      // Remove stock levels to avoid JSON bloat
      delete cleanDoc.stockLevels;
      delete cleanDoc.initialStockLevels;

      payload.data = cleanDoc;
    } else if (table === 'docs_contacts') {
      payload.name = cleanDoc.name;
      payload.type = cleanDoc.type || 'CUSTOMER';
      payload.data = cleanDoc;
    } else if (table === 'docs_accounts') {
      payload.name = cleanDoc.name;
      payload.code = cleanDoc.code;
      payload.type = cleanDoc.type;
    } else if (table === 'docs_payments') {
      payload.date = cleanDoc.date;
      payload.payment_number = cleanDoc.number || cleanDoc.paymentNumber;
      payload.amount = Number(cleanDoc.amount || cleanDoc.total || 0);
      payload.type = cleanDoc.type || 'RECEIPT';
      payload.status = cleanDoc.status || 'DRAFT';
      payload.data = cleanDoc;
    } else if (table === 'docs_credit_notes') {
      payload.date = cleanDoc.date;
      payload.credit_note_number = cleanDoc.number || cleanDoc.creditNoteNumber;
      payload.customer_id = cleanDoc.customerId;
      payload.status = cleanDoc.status || 'DRAFT';
      payload.total = Number(cleanDoc.total || 0);
      payload.data = cleanDoc;
    } else if (table === 'docs_loans') {
      payload.loan_number = cleanDoc.number || cleanDoc.loanNumber || `LN-${id.substring(0, 8)}`;
      payload.status = cleanDoc.status || 'ACTIVE';
      payload.principal_amount = Number(cleanDoc.principalAmount || cleanDoc.amount || 0);
      payload.interest_rate = Number(cleanDoc.interestRate || 0);
      payload.interest_type = cleanDoc.interestType || 'REDUCING';
      payload.term_months = Number(cleanDoc.termMonths || 12);
      payload.start_date = cleanDoc.startDate || cleanDoc.date;
      payload.date = cleanDoc.date;
      payload.contact_id = cleanDoc.contactId || cleanDoc.customerId;
      payload.name = cleanDoc.name;
      payload.amount = Number(cleanDoc.amount || cleanDoc.principalAmount || 0);
      payload.notes = cleanDoc.notes;
      payload.paid_periods = cleanDoc.paid_periods || cleanDoc.paidPeriods || [];
      payload.amortization_schedule = cleanDoc.amortization_schedule || cleanDoc.amortizationSchedule || [];
      payload.data = cleanDoc;
    } else if (table === 'docs_attendance') {
      payload.attendance_date = cleanDoc.attendanceDate || cleanDoc.date;
      payload.employee_id = cleanDoc.employeeId;
      payload.status = cleanDoc.status || 'PRESENT';
      payload.is_important_day = !!cleanDoc.isImportantDay;
      payload.late_minutes = Number(cleanDoc.lateMinutes || 0);
      payload.overtime_hours = Number(cleanDoc.overtimeHours || 0);
    } else if (table === 'docs_brands') {
      payload.code = cleanDoc.code;
      payload.name = cleanDoc.name;
      payload.description = cleanDoc.description;
      payload.data = cleanDoc;
    } else if (table === 'docs_categories') {
      payload.code = cleanDoc.code;
      payload.name = cleanDoc.name;
      payload.description = cleanDoc.description;
      payload.data = cleanDoc;
    } else if (table === 'docs_warehouses') {
      payload.code = cleanDoc.code;
      payload.name = cleanDoc.name;
      payload.is_default = !!cleanDoc.isDefault;
    } else if (table === 'docs_roles') {
      payload.name = cleanDoc.name;
      payload.color = cleanDoc.color;
      payload.is_system = !!cleanDoc.isSystem;
      payload.description = cleanDoc.description;
    } else if (table === 'docs_users') {
      payload.name = cleanDoc.name;
      payload.email = cleanDoc.email;
      payload.status = cleanDoc.status || 'ACTIVE';
      payload.username = cleanDoc.username;
      payload.pin = cleanDoc.pin;
      payload.role_id = cleanDoc.roleId;
    } else if (table === 'docs_inventory_adjustments') {
      payload.status = cleanDoc.status || 'DRAFT';
      payload.data = cleanDoc;
    } else if ([
      'docs_leaves',
      'docs_payslips',
      'docs_tasks',
      'docs_commission_targets',
      'docs_holidays',
      'docs_advance_salaries'
    ].includes(table)) {
      payload.data = cleanDoc;
    }

    const { error } = await supabase.from(table).upsert(payload, { onConflict: 'id' });
    if (error) throw error;
  },

  async deleteDocs(table: string, ids: string[]) {
    const validIds = ids.filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));
    if (validIds.length === 0) return;
    const { error } = await supabase.from(table).delete().in('id', validIds);
    if (error) throw error;
  }
};