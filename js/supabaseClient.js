/**
 * Supabase Client Initialization
 * Loads the Supabase JS library from CDN and exports the client instance.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { CONFIG } from './config.js';

if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
    console.error('Supabase configuration missing Project URL or Anon Key.');
}

const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

export { supabase };
