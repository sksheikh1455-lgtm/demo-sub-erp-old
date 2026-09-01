import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGci...'; // I will just use REST but I don't have the key directly available in my process.env since it's a tsx script. 
// Can I read the key from .env?
