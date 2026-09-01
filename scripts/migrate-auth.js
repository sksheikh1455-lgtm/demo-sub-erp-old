import pkg from 'pg';
const { Client } = pkg;
import crypto from 'crypto';

const connectionString = process.env.SUPABASE_DB_URL;

async function migrateAuth() {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    console.log('Enabling pgcrypto...');
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');

    // Add user_uuid column if not exists
    await client.query(`
      ALTER TABLE docs_users ADD COLUMN IF NOT EXISTS user_uuid UUID;
      ALTER TABLE company_users ADD COLUMN IF NOT EXISTS user_uuid UUID;
    `);

    const { rows: users } = await client.query('SELECT id, data FROM docs_users');
    console.log(`Found ${users.length} users in docs_users`);

    for (const u of users) {
      const { id, data } = u;
      const email = data.email;
      let password = data.pin || '';
      if (password.length < 6) password = password.padEnd(6, '0');
      
      const identityId = crypto.randomUUID();

      console.log(`Migrating user ${id} / ${email}...`);

      // Check if auth user exists
      const { rows: existingAuth } = await client.query('SELECT id FROM auth.users WHERE email = $1', [email]);
      let authUid;

      if (existingAuth.length > 0) {
        authUid = existingAuth[0].id;
        console.log(`- Auth user already exists with uid: ${authUid}`);
        
        // Ensure password matches just in case
        await client.query(`
          UPDATE auth.users 
          SET encrypted_password = crypt($1, gen_salt('bf'))
          WHERE id = $2
        `, [password, authUid]);
      } else {
        const { rows: newAuth } = await client.query(`
          INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, 
            recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, 
            confirmation_token, email_change, email_change_token_new, recovery_token
          ) VALUES (
            '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 
            $1, crypt($2, gen_salt('bf')), now(), NULL, NULL, 
            '{"provider":"email","providers":["email"]}', $3, now(), now(), 
            '', '', '', ''
          ) RETURNING id;
        `, [email, password, JSON.stringify({ old_id: id, name: data.name })]);

        authUid = newAuth[0].id;
        
        // Insert identity to allow login
        await client.query(`
          INSERT INTO auth.identities (
            id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, provider_id
          ) VALUES (
            $1::uuid, $2::uuid, format('{"sub":"%s","email":"%s"}', $1::text, $3::text)::jsonb, 'email', now(), now(), now(), $1::text
          )
        `, [identityId, authUid, email]);
        
        console.log(`- Created auth user with uid: ${authUid}`);
      }

      await client.query('UPDATE docs_users SET user_uuid = $1 WHERE id = $2', [authUid, id]);
      
      // Also update data->>user_uuid
      data.user_uuid = authUid;
      await client.query('UPDATE docs_users SET data = $1 WHERE id = $2', [data, id]);
    }
    
    console.log('Migration complete!');
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

migrateAuth();
