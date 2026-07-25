export async function onRequest(context: any) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    let payload: any = {};
    if (request.method === 'POST') {
      const text = await request.text();
      payload = text ? JSON.parse(text) : {};
    } else if (request.method === 'GET') {
      const url = new URL(request.url);
      payload = Object.fromEntries(url.searchParams.entries());
    }

    const gasUrl = env?.GAS_URL || 'https://script.google.com/macros/s/AKfycbxzjio4sat5fWoUncPgp8SfjoGqfGxW5vFoDgkHvBI3OKVWIaszsAaUt0LE2fCHtkCFsA/exec';

    const gasRes = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });

    if (!gasRes.ok) {
      return new Response(JSON.stringify({ ok: false, message: `GAS HTTP Error ${gasRes.status}` }), {
        status: gasRes.status,
        headers: corsHeaders
      });
    }

    const data = await gasRes.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: corsHeaders
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, message: err.message || 'Server Proxy Error' }), {
      status: 500,
      headers: corsHeaders
    });
  }
}
