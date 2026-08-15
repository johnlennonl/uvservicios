const CONFIG = {
    SUPABASE_URL: 'https://ktfiglhhsqinvqvqynhg.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0ZmlnbGhoc3FpbnZxdnF5bmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5Nzc0MzYsImV4cCI6MjA5MTU1MzQzNn0.wl_8GlIYPFox2UYXSwYZKaf9pm0uz9eHZrcwUAKJqDA'
};

async function test() {
    try {
        const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/field_well_catalog?select=*`, {
            headers: {
                'apikey': CONFIG.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
            }
        });
        const data = await res.json();
        console.log('Total catalog rows:', data.length);
        if (data.length > 0) {
            console.log('First 5 catalog rows:', data.slice(0, 5));
            console.log('Distinct scopes:', [...new Set(data.map(w => w.operational_scope))]);
        }
    } catch (e) {
        console.error(e);
    }
}
test();
