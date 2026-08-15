const CONFIG = {
    SUPABASE_URL: 'https://ktfiglhhsqinvqvqynhg.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0ZmlnbGhoc3FpbnZxdnF5bmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5Nzc0MzYsImV4cCI6MjA5MTU1MzQzNn0.wl_8GlIYPFox2UYXSwYZKaf9pm0uz9eHZrcwUAKJqDA'
};

async function diagnose() {
    const journeyId = '3930c20d-d72c-4cc2-b5f1-997730e7ac91';
    try {
        const url = CONFIG.SUPABASE_URL;
        const key = CONFIG.SUPABASE_ANON_KEY;
        const headers = { 'apikey': key, 'Authorization': `Bearer ${key}` };

        // Get all columns of the journey
        const res = await fetch(`${url}/rest/v1/field_journeys?select=*&id=eq.${journeyId}`, { headers });
        const data = await res.json();
        console.log('--- JOURNEY DATA ---');
        console.log(JSON.stringify(data, null, 2));

    } catch (e) {
        console.error(e);
    }
}
diagnose();
