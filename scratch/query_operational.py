import urllib.request
import json

url_base = 'https://ktfiglhhsqinvqvqynhg.supabase.co/rest/v1'
api_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0ZmlnbGhoc3FpbnZxdnF5bmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5Nzc0MzYsImV4cCI6MjA5MTU1MzQzNn0.wl_8GlIYPFox2UYXSwYZKaf9pm0uz9eHZrcwUAKJqDA'

headers = {
    'apikey': api_key,
    'Authorization': f'Bearer {api_key}',
    'Content-Type': 'application/json'
}

def query_table(table, params):
    url = f"{url_base}/{table}?{params}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Error querying {table}: {e}")
        return None

print("--- consolidated_dashboard_operational for TOM0033 on 2026-07-11 ---")
recs = query_table('consolidated_dashboard_operational', 'pozo=eq.TOM0033&report_date=eq.2026-07-11')
for r in recs or []:
    row_data = r.get('row_data', {})
    print(f"ID: {r.get('id')} | Time: {r.get('report_time')} | PIP: {row_data.get('PIP [psi]') or row_data.get('PIP (psi)') or row_data.get('PIP')} | TM: {row_data.get('Tm [°F]') or row_data.get('TM (°F)') or row_data.get('TM')} | RowData: {row_data}")
