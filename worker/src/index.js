/**
 * King's Grill — Cloudflare R2 Image Worker
 * Handles upload/download/delete of bill images and transfer receipts
 * 
 * Free tier: 10GB storage, 10M reads/month, 1M writes/month
 * No egress fees (unlike S3/GCS)
 */

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export default {
  async fetch(request, env) {
    // CORS Headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': env.CORS_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Key, x-target-url, x-gemini-key, Authorization, X-Title, HTTP-Referer',
      'Access-Control-Max-Age': '86400',
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // --- UPLOAD: POST /upload ---
      if (request.method === 'POST' && path === '/upload') {
        const body = await request.json();
        const { data, filename, type, orderId } = body;

        if (!data) {
          return jsonResponse({ ok: false, message: 'Missing image data' }, 400, corsHeaders);
        }

        // Parse base64
        let imageBytes;
        let contentType = type || 'image/jpeg';

        if (data.includes(',')) {
          // data:image/jpeg;base64,/9j/4AAQ...
          const parts = data.split(',');
          contentType = parts[0].split(':')[1]?.split(';')[0] || contentType;
          imageBytes = base64ToArrayBuffer(parts[1]);
        } else {
          imageBytes = base64ToArrayBuffer(data);
        }

        if (imageBytes.byteLength > MAX_SIZE) {
          return jsonResponse({ ok: false, message: 'File too large (max 10MB)' }, 413, corsHeaders);
        }

        // Generate key: orders/{orderId}/{timestamp}_{filename}
        const ts = Date.now();
        const safeName = (filename || 'image').replace(/[^a-zA-Z0-9._-]/g, '_');
        const key = orderId
          ? `orders/${orderId}/${ts}_${safeName}`
          : `uploads/${ts}_${safeName}`;

        // Upload to R2
        await env.BUCKET.put(key, imageBytes, {
          httpMetadata: { contentType },
          customMetadata: {
            orderId: orderId || '',
            uploadedAt: new Date().toISOString(),
            originalName: filename || 'unknown',
          },
        });

        const imageUrl = `${url.origin}/image/${key}`;

        return jsonResponse({
          ok: true,
          key,
          url: imageUrl,
          size: imageBytes.byteLength,
          message: 'Upload successful'
        }, 200, corsHeaders);
      }

      // --- GET IMAGE: GET /image/{key} ---
      if (request.method === 'GET' && path.startsWith('/image/')) {
        const key = path.replace('/image/', '');
        const object = await env.BUCKET.get(key);

        if (!object) {
          return new Response('Image not found', { status: 404, headers: corsHeaders });
        }

        const headers = new Headers(corsHeaders);
        headers.set('Content-Type', object.httpMetadata?.contentType || 'image/jpeg');
        headers.set('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year cache
        headers.set('ETag', object.httpEtag);

        return new Response(object.body, { headers });
      }

      // --- DELETE: DELETE /image/{key} ---
      if (request.method === 'DELETE' && path.startsWith('/image/')) {
        const key = path.replace('/image/', '');
        await env.BUCKET.delete(key);
        return jsonResponse({ ok: true, message: 'Deleted' }, 200, corsHeaders);
      }

      // --- LIST: GET /list?prefix=orders/{orderId} ---
      if (request.method === 'GET' && path === '/list') {
        const prefix = url.searchParams.get('prefix') || '';
        const listed = await env.BUCKET.list({ prefix, limit: 100 });

        const files = listed.objects.map(obj => ({
          key: obj.key,
          size: obj.size,
          uploaded: obj.uploaded,
          url: `${url.origin}/image/${obj.key}`,
        }));

        return jsonResponse({ ok: true, files, truncated: listed.truncated }, 200, corsHeaders);
      }

      // --- CLEANUP: DELETE /cleanup?days=30 ---
      if (request.method === 'DELETE' && path === '/cleanup') {
        const days = parseInt(url.searchParams.get('days') || '90');
        const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
        const listed = await env.BUCKET.list({ limit: 500 });

        let deleted = 0;
        for (const obj of listed.objects) {
          if (new Date(obj.uploaded).getTime() < cutoff) {
            await env.BUCKET.delete(obj.key);
            deleted++;
          }
        }

        return jsonResponse({ ok: true, deleted, message: `Cleaned ${deleted} files older than ${days} days` }, 200, corsHeaders);
      }

      // --- STATS: GET /stats ---
      if (request.method === 'GET' && path === '/stats') {
        const listed = await env.BUCKET.list({ limit: 1000 });
        const totalSize = listed.objects.reduce((acc, obj) => acc + obj.size, 0);

        return jsonResponse({
          ok: true,
          totalFiles: listed.objects.length,
          totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
          truncated: listed.truncated,
        }, 200, corsHeaders);
      }

      // --- AI PROXY: POST /ai-proxy ---
      if (request.method === 'POST' && path === '/ai-proxy') {
        const targetUrl = request.headers.get('x-target-url');
        const geminiKey = request.headers.get('x-gemini-key');
        
        if (!targetUrl) {
          return jsonResponse({ ok: false, message: 'Missing target URL' }, 400, corsHeaders);
        }

        let finalUrl = targetUrl;
        if (geminiKey && targetUrl.includes('generativelanguage')) {
          finalUrl += `?key=${geminiKey}`;
        }

        // Clone the request body
        const bodyText = await request.text();
        
        // Clone headers but remove proxy specific ones
        const fetchHeaders = new Headers();
        fetchHeaders.set('Content-Type', 'application/json');
        
        const auth = request.headers.get('Authorization');
        if (auth) fetchHeaders.set('Authorization', auth);
        
        const referer = request.headers.get('HTTP-Referer');
        if (referer) fetchHeaders.set('HTTP-Referer', referer);
        
        const title = request.headers.get('X-Title');
        if (title) fetchHeaders.set('X-Title', title);

        try {
          const upstreamRes = await fetch(finalUrl, {
            method: 'POST',
            headers: fetchHeaders,
            body: bodyText
          });
          
          const upstreamText = await upstreamRes.text();
          
          const responseHeaders = new Headers(corsHeaders);
          responseHeaders.set('Content-Type', 'application/json');
          
          return new Response(upstreamText, {
            status: upstreamRes.status,
            headers: responseHeaders
          });
        } catch (e) {
          return jsonResponse({ ok: false, message: 'Proxy fetch failed: ' + e.message }, 500, corsHeaders);
        }
      }

      return jsonResponse({ ok: false, message: 'Not found' }, 404, corsHeaders);
    } catch (err) {
      return jsonResponse({ ok: false, message: err.message }, 500, corsHeaders);
    }
  },
};

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function jsonResponse(data, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}
