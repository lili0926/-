// duetto 认证数据持久化到 Supabase（解决 Render 部署清空 data/ 导致 PIN 丢失）
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lqcuklhldvkwbkpftjzu.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxY3VrbGhsZHZrd2JrcGZ0anp1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTg1NzIwNCwiZXhwIjoyMDk3NDMzMjA0fQ.-5VYk1Gz3vdhQPQF-zqCtTEYWnS92q_c_knChnAGWis';
const TABLE = 'duetto_auth';

export function hasSupabase(){ return !!(SUPABASE_URL && SUPABASE_SERVICE_KEY); }

export async function readAuth(){
  if(!hasSupabase()) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.1&select=*`, {
      headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY }
    });
    if(!res.ok) return null;
    const rows = await res.json();
    if(!rows || rows.length === 0) return null;
    return { salt: rows[0].salt, hash: rows[0].hash, secret: rows[0].secret, created: rows[0].created };
  } catch(e){
    console.error('[auth-supabase] readAuth error:', e.message);
    return null;
  }
}

export async function writeAuth(a){
  if(!hasSupabase()) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.1`, {
      method: 'PUT',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ id: 1, salt: a.salt, hash: a.hash, secret: a.secret, created: a.created })
    });
  } catch(e){
    console.error('[auth-supabase] writeAuth error:', e.message);
  }
}
