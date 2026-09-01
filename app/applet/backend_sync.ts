// Backend Sync File: Upsert-with-Merge Strategy
// Implements lookup by normalized name (lowercase, trimmed) to avoid inserting duplicates.
// Uses pg client, but you can adapt it to any ORM or Supabase client.

import { Client } from 'pg';

interface SyncContactParams {
  externalId: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  companyId?: string | null;
  // include other necessary fields
}

export async function syncContact(client: Client, contact: SyncContactParams) {
  const normalizedName = contact.name.trim().toLowerCase();

  // 1. Check if a contact with this exact normalized name already exists 
  //    (optionally scoped by company_id)
  const lookupQuery = `
    SELECT id, external_id, phone, email
    FROM docs_contacts
    WHERE LOWER(TRIM(name)) = $1
      AND (company_id = $2 OR (company_id IS NULL AND $2 IS NULL))
    ORDER BY
      -- Prioritize records that are NOT from legacy import
      CASE WHEN id NOT LIKE 'CT-IMP-%' THEN 1 ELSE 2 END,
      -- Prioritize records that have a phone number
      CASE WHEN phone IS NOT NULL AND phone != '' THEN 1 ELSE 2 END
    LIMIT 1;
  `;
  
  const { rows } = await client.query(lookupQuery, [normalizedName, contact.companyId || null]);
  const existingContact = rows[0];

  if (existingContact) {
    // 2. Merge-on-Import: Update the existing record instead of creating a new one
    // Link the external ID if needed, or update phone/email if they were missing
    const updateQuery = `
      UPDATE docs_contacts
      SET 
        external_id = COALESCE(external_id, $1),
        phone = COALESCE(NULLIF(TRIM(phone), ''), $2),
        email = COALESCE(NULLIF(TRIM(email), ''), $3),
        updated_at = NOW()
      WHERE id = $4
      RETURNING *;
    `;
    const { rows: updatedRows } = await client.query(updateQuery, [
      contact.externalId,
      contact.phone || null,
      contact.email || null,
      existingContact.id
    ]);

    console.log(`[Sync] Merged contact into existing ID: ${existingContact.id}`);
    return updatedRows[0];
  } else {
    // 3. Insert new record if no match found
    const insertQuery = `
      INSERT INTO docs_contacts (
        id, external_id, name, email, phone, address, company_id, created_at, updated_at
      ) VALUES (
        -- Generate a new UUID for the live system or use the external one
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW()
      )
      RETURNING *;
    `;
    const { rows: insertedRows } = await client.query(insertQuery, [
      contact.externalId,
      contact.name,
      contact.email || null,
      contact.phone || null,
      contact.address || null,
      contact.companyId || null
    ]);

    console.log(`[Sync] Inserted new contact: ${insertedRows[0].id}`);
    return insertedRows[0];
  }
}
