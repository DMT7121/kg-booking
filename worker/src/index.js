/**
 * King's Grill — Cloudflare R2 Image Worker
 * Handles upload/download/delete of bill images and transfer receipts
 * 
 * Free tier: 10GB storage, 10M reads/month, 1M writes/month
 * No egress fees (unlike S3/GCS)
 */

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export default {
  async fetch(request, env, ctx) {
    // CORS Headers
    const origin = request.headers.get('Origin');
    let allowedOrigin = '*';
    if (env.CORS_ORIGINS) {
      const origins = env.CORS_ORIGINS.split(',').map(o => o.trim());
      if (origin && origins.includes(origin)) {
        allowedOrigin = origin;
      } else {
        allowedOrigin = origins[0];
      }
    } else if (env.CORS_ORIGIN) {
      allowedOrigin = env.CORS_ORIGIN;
    } else if (origin) {
      const defaultAllowed = [
        'https://kings-grill-booking.pages.dev',
        'http://localhost:5173',
        'http://localhost:3000'
      ];
      if (defaultAllowed.includes(origin) || origin.endsWith('.kingsgrill.vn') || origin.endsWith('.pages.dev')) {
        allowedOrigin = origin;
      }
    }

    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigin,
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
      // --- CORS PROXY: GET /proxy?url=... ---
      if (request.method === 'GET' && path === '/proxy') {
        const targetUrl = url.searchParams.get('url');
        if (!targetUrl) {
          return new Response('Missing url parameter', { status: 400, headers: corsHeaders });
        }
        try {
          const r = await fetch(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': new URL(targetUrl).origin
            }
          });
          const headers = new Headers(corsHeaders);
          headers.set('Content-Type', r.headers.get('Content-Type') || 'application/octet-stream');
          headers.set('Cache-Control', 'public, max-age=86400');
          return new Response(r.body, { headers, status: r.status });
        } catch (fetchErr) {
          return new Response(`Proxy fetch failed: ${fetchErr.message}`, { status: 502, headers: corsHeaders });
        }
      }

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

      // --- UNIFIED API GATEWAY: POST /api ---
      if (path === '/api') {
        if (request.method !== 'POST' && request.method !== 'GET') {
          return jsonResponse({ ok: false, error: `Method ${request.method} Not Allowed` }, 405, corsHeaders);
        }

        const rawBodyText = await request.text();
        let payload;
        try {
          payload = JSON.parse(rawBodyText || '{}');
        } catch (jsonErr) {
          return jsonResponse({ ok: false, error: 'Malformed JSON payload' }, 400, corsHeaders);
        }

        const action = payload.action || url.searchParams.get('action');
        const gasUrl = env.GAS_URL || env.VITE_GAS_URL || 'https://script.google.com/macros/s/AKfycbxzjio4sat5fWoUncPgp8SfjoGqfGxW5vFoDgkHvBI3OKVWIaszsAaUt0LE2fCHtkCFsA/exec';

        // Xử lý các nghiệp vụ ghi (write) bất đồng bộ
        const asyncActions = ['saveOrder', 'deleteOrder', 'saveConfig', 'saveMenuAlias', 'deleteMenuAlias', 'logAiCorrection'];
        const isAsync = asyncActions.includes(action);

        if (isAsync) {
          // Trả về OK ngay lập tức cho client
          const mockId = payload.data?.id || payload.id || (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2));
          const responsePayload = {
            ok: true,
            message: `Action ${action} accepted on Edge Gateway. Syncing in background...`,
            id: mockId,
            billUrl: payload.data?.billUrl || ''
          };

          // Chạy đồng bộ ngầm bằng ctx.waitUntil()
          if (ctx && ctx.waitUntil) {
            ctx.waitUntil(
              fetch(gasUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
              })
              .then(async (gasRes) => {
                if (gasRes.ok) {
                  const data = await gasRes.json();
                  console.log(`[Edge Gateway] Background sync success for ${action}:`, data);
                  if (env.KV_STORE) {
                    if (action === 'saveOrder' || action === 'deleteOrder') {
                      await env.KV_STORE.delete('bookings_history');
                    } else if (action === 'saveConfig') {
                      await env.KV_STORE.delete('system_config');
                    }
                  }
                } else {
                  console.error(`[Edge Gateway] Background sync failed for ${action}: HTTP ${gasRes.status}`);
                }
              })
              .catch(err => {
                console.error(`[Edge Gateway] Background sync network error for ${action}:`, err.message);
              })
            );
          } else {
            // Fallback nếu không có ctx (chạy dev hoặc local)
            console.warn('[Edge Gateway] ctx.waitUntil không khả dụng. Đang đồng bộ đồng thời...');
            fetch(gasUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify(payload)
            }).catch(e => console.error(e));
          }

          return jsonResponse(responsePayload, 200, corsHeaders);
        } else {
          if (action === 'getSharedApiKeysWithoutPassword') {
            // Verify Client Authorization Secret
            const authHeader = request.headers.get('Authorization');
            const expectedSecret = env.APP_SHARED_SECRET || 'kg_booking_secret_token_2026';
            if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== expectedSecret) {
              return jsonResponse({ ok: false, error: 'Unauthorized: Invalid App Shared Secret' }, 401, corsHeaders);
            }

            const workerKeys = [];
            if (env.GEMINI_API_KEY) workerKeys.push({ provider: 'google', key: env.GEMINI_API_KEY });
            if (env.GROQ_API_KEY) workerKeys.push({ provider: 'groq', key: env.GROQ_API_KEY });
            if (env.CEREBRAS_API_KEY) workerKeys.push({ provider: 'cerebras', key: env.CEREBRAS_API_KEY });
            if (env.SAMBANOVA_API_KEY) workerKeys.push({ provider: 'sambanova', key: env.SAMBANOVA_API_KEY });
            if (env.OPENROUTER_API_KEY) workerKeys.push({ provider: 'openrouter', key: env.OPENROUTER_API_KEY });
            
            if (workerKeys.length === 0) {
              // Fallback gọi sang GAS không cần mật khẩu (đã được định nghĩa trên Sheets)
              const gasRes = await fetch(gasUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'getSharedApiKeysWithoutPassword' })
              });
              if (gasRes.ok) {
                const data = await gasRes.json();
                return jsonResponse(data, 200, corsHeaders);
              }
            }
            return jsonResponse({ ok: true, keys: workerKeys }, 200, corsHeaders);
          }

          // Các nghiệp vụ đọc (read) hoặc AI -> Đồng bộ trực tiếp hoặc qua cache KV
          if (env.KV_STORE) {
            if (action === 'getHistory') {
              const cached = await env.KV_STORE.get('bookings_history');
              if (cached) {
                return jsonResponse(JSON.parse(cached), 200, corsHeaders);
              }
              const gasRes = await fetch(gasUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
              });
              if (gasRes.ok) {
                const data = await gasRes.json();
                if (data.ok) {
                  await env.KV_STORE.put('bookings_history', JSON.stringify(data), { expirationTtl: 300 }); // cache 5 mins
                }
                return jsonResponse(data, 200, corsHeaders);
              }
            } else if (action === 'getConfig') {
              const cached = await env.KV_STORE.get('system_config');
              if (cached) {
                return jsonResponse(JSON.parse(cached), 200, corsHeaders);
              }
              const gasRes = await fetch(gasUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
              });
              if (gasRes.ok) {
                const data = await gasRes.json();
                if (data.ok) {
                  await env.KV_STORE.put('system_config', JSON.stringify(data), { expirationTtl: 1800 }); // cache 30 mins
                }
                return jsonResponse(data, 200, corsHeaders);
              }
            }
          }

          // Fallback mặc định: Forward trực tiếp sang GAS và trả về kết quả
          const gasRes = await fetch(gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
          });
          if (gasRes.ok) {
            const data = await gasRes.json();
            return jsonResponse(data, 200, corsHeaders);
          } else {
            return jsonResponse({ ok: false, error: `GAS returned HTTP ${gasRes.status}` }, 500, corsHeaders);
          }
        }
      }

      // --- AI GATEWAY: POST /api/ai/analyze ---
      if (path === '/api/ai/analyze') {
        if (request.method !== 'POST') {
          return jsonResponse({ ok: false, error: `Method ${request.method} Not Allowed` }, 405, corsHeaders);
        }
        
        const rawBodyText = await request.text();
        
        const signature = request.headers.get('X-KG-Signature');
        const timestamp = request.headers.get('X-KG-Timestamp');
        const nonce = request.headers.get('X-KG-Nonce');
        const keyId = request.headers.get('X-KG-Key-Id');
        
        if (signature) {
          const timestampMs = parseInt(timestamp || '', 10);
          const now = Date.now();
          if (isNaN(timestampMs) || Math.abs(now - timestampMs) > 120000) {
            return jsonResponse({ ok: false, error: { code: 'EXPIRED_REQUEST', message: 'Request timestamp has expired' } }, 401, corsHeaders);
          }
          
          if (!globalThis.seenNonces) {
            globalThis.seenNonces = new Set();
          }
          if (globalThis.seenNonces.has(nonce)) {
            return jsonResponse({ ok: false, error: { code: 'REPLAY_ATTACK', message: 'Replay attack detected' } }, 401, corsHeaders);
          }
          globalThis.seenNonces.add(nonce);
          setTimeout(() => {
            if (globalThis.seenNonces) {
              globalThis.seenNonces.delete(nonce);
            }
          }, 120000);
          
          try {
            const encoder = new TextEncoder();
            const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(rawBodyText));
            const bodyHash = Array.from(new Uint8Array(hashBuffer))
              .map(b => b.toString(16).padStart(2, '0'))
              .join('');
            
            const canonicalString = `POST\n/api/ai/analyze\n${timestamp}\n${nonce}\n${bodyHash}`;
            
            const secretData = encoder.encode(env.EPHEMERAL_KEY_SECRET || 'fallback_secret');
            const hmacKey = await crypto.subtle.importKey(
              'raw',
              secretData,
              { name: 'HMAC', hash: 'SHA-256' },
              false,
              ['sign']
            );
            const keyDerivationBuffer = await crypto.subtle.sign(
              'HMAC',
              hmacKey,
              encoder.encode(keyId)
            );
            const derivedKeySig = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(keyDerivationBuffer))));
            
            const verifyHmacKey = await crypto.subtle.importKey(
              'raw',
              encoder.encode(derivedKeySig),
              { name: 'HMAC', hash: 'SHA-256' },
              false,
              ['sign']
            );
            const verifyBuffer = await crypto.subtle.sign(
              'HMAC',
              verifyHmacKey,
              encoder.encode(canonicalString)
            );
            
            const expectedSig = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(verifyBuffer))))
              .replace(/\+/g, '-')
              .replace(/\//g, '_')
              .replace(/=+$/, '');
              
            if (signature !== expectedSig) {
              return jsonResponse({ ok: false, error: { code: 'INVALID_SIGNATURE', message: 'Request signature is invalid' } }, 401, corsHeaders);
            }
          } catch (e) {
            return jsonResponse({ ok: false, error: { code: 'SIGNATURE_VERIFICATION_ERROR', message: e.message } }, 401, corsHeaders);
          }
        } else {
          const authHeader = request.headers.get('Authorization');
          if (env.APP_SHARED_SECRET) {
            if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== env.APP_SHARED_SECRET) {
              return jsonResponse({ ok: false, error: 'Unauthorized: Invalid App Secret Token' }, 401, corsHeaders);
            }
          }
        }
        
        let payload;
        try {
          payload = JSON.parse(rawBodyText);
        } catch (jsonErr) {
          return jsonResponse({ ok: false, error: 'Malformed JSON payload' }, 400, corsHeaders);
        }
        const {
          model,
          provider,
          sysPrompt,
          userPrompt,
          image,
          jsonMode,
          responseSchema,
          maxOutputTokens,
          temperature
        } = payload;

        if (!sysPrompt || !userPrompt) {
          return jsonResponse({ ok: false, error: 'Missing required prompts' }, 400, corsHeaders);
        }

        // 3. Choose API Key and Route URL
        let apiKey = '';
        let targetUrl = '';
        const fetchHeaders = new Headers();
        fetchHeaders.set('Content-Type', 'application/json');
        let body = {};

        if (provider === 'google') {
          apiKey = env.GEMINI_API_KEY;
          if (!apiKey) {
            return jsonResponse({ ok: false, error: 'GEMINI_API_KEY is not configured on the gateway' }, 500, corsHeaders);
          }
          targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          body = {
            contents: [{
              parts: [
                { text: sysPrompt + '\n\nUser Input:\n' + userPrompt },
                ...(image ? [{ inline_data: { mime_type: 'image/jpeg', data: image.split(',')[1] } }] : [])
              ]
            }],
            generationConfig: {
              temperature: temperature ?? 0.1,
              ...(maxOutputTokens ? { maxOutputTokens } : {}),
              ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
              ...(responseSchema && jsonMode ? { responseSchema } : {})
            },
            ...(model.includes('2.5') ? { generationConfig: { temperature: temperature ?? 0.1, thinkingConfig: { thinkingBudget: 0 } } } : {})
          };
        } else {
          // OpenAI compatible providers
          if (provider === 'groq') {
            apiKey = env.GROQ_API_KEY;
            targetUrl = 'https://api.groq.com/openai/v1/chat/completions';
          } else if (provider === 'cerebras') {
            apiKey = env.CEREBRAS_API_KEY;
            targetUrl = 'https://api.cerebras.ai/v1/chat/completions';
          } else if (provider === 'sambanova') {
            apiKey = env.SAMBANOVA_API_KEY;
            targetUrl = 'https://api.sambanova.ai/v1/chat/completions';
          } else if (provider === 'github') {
            apiKey = env.GITHUB_API_KEY;
            targetUrl = 'https://models.github.ai/inference/chat/completions';
          } else if (provider === 'mistral') {
            apiKey = env.MISTRAL_API_KEY;
            targetUrl = 'https://api.mistral.ai/v1/chat/completions';
          } else if (provider === 'openrouter') {
            apiKey = env.OPENROUTER_API_KEY;
            targetUrl = 'https://openrouter.ai/api/v1/chat/completions';
            fetchHeaders.set('HTTP-Referer', 'https://kings-grill-booking.pages.dev');
            fetchHeaders.set('X-Title', 'KING\'S GRILL BOOKING APP');
          } else if (provider === 'pollinations') {
            apiKey = 'free';
            targetUrl = 'https://text.pollinations.ai/openai/v1/chat/completions';
          }

          if (!apiKey && provider !== 'pollinations') {
            return jsonResponse({ ok: false, error: `API Key for provider '${provider}' is not configured on the gateway` }, 500, corsHeaders);
          }

          if (apiKey && apiKey !== 'free') {
            fetchHeaders.set('Authorization', `Bearer ${apiKey}`);
          }

          let msgContent = userPrompt;
          if (image) {
            msgContent = [
              { type: 'text', text: userPrompt },
              { type: 'image_url', image_url: { url: image } }
            ];
          }

          const noResponseFormat = ['pollinations', 'huggingface'];
          const effectiveSys = (jsonMode && noResponseFormat.includes(provider))
            ? sysPrompt + '\n\nCRITICAL: Respond ONLY with raw JSON. No markdown, no ```json blocks. Start with { end with }.'
            : sysPrompt;

          body = {
            model: model,
            messages: [
              { role: 'system', content: effectiveSys },
              { role: 'user', content: msgContent }
            ],
            temperature: temperature ?? 0.1,
            ...(maxOutputTokens ? { max_tokens: maxOutputTokens } : {}),
            ...(jsonMode && !noResponseFormat.includes(provider)
              ? (responseSchema
                  ? { response_format: { type: 'json_schema', json_schema: { name: 'booking_extraction', strict: true, schema: responseSchema } } }
                  : { response_format: { type: 'json_object' } }
                )
              : {}
            )
          };
        }

        // 4. Send request
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

          const upstreamRes = await fetch(targetUrl, {
            method: 'POST',
            headers: fetchHeaders,
            body: JSON.stringify(body),
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (!upstreamRes.ok) {
            const errText = await upstreamRes.text().catch(() => `HTTP ${upstreamRes.status}`);
            return jsonResponse({ ok: false, error: `AI Provider Error: ${errText.substring(0, 150)}` }, upstreamRes.status, corsHeaders);
          }

          const resJson = await upstreamRes.json();
          let content = '';

          if (provider === 'google') {
            const parts = resJson.candidates?.[0]?.content?.parts || [];
            for (let p = parts.length - 1; p >= 0; p--) {
              if (parts[p].text && !parts[p].thought) {
                content = parts[p].text;
                break;
              }
            }
            if (!content) content = parts.find(p => p.text)?.text || '';
          } else {
            content = resJson.choices?.[0]?.message?.content || '';
          }

          return jsonResponse({ ok: true, content }, 200, corsHeaders);
        } catch (e) {
          const errMsg = e.name === 'AbortError' ? 'Gateway Timeout (20s)' : e.message;
          return jsonResponse({ ok: false, error: 'AI Gateway Error: ' + errMsg }, 500, corsHeaders);
        }
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

      return jsonResponse({ ok: false, error: 'Not found' }, 404, corsHeaders);
    } catch (err) {
      return jsonResponse({ ok: false, error: err.message }, 500, corsHeaders);
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
