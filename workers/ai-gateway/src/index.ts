// Cloudflare API Gateway Worker implementation (index.ts)

export interface Env {
  GEMINI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  GROQ_API_KEY?: string;
  CEREBRAS_API_KEY?: string;
  MISTRAL_API_KEY?: string;
  SAMBANOVA_API_KEY?: string;
  GOOGLE_SPREADSHEET_ID: string;
  BUCKET?: any; // R2 Bucket binding
  SUPABASE_JWT_SECRET?: string; // Supabase JWT Secret
  SHARED_SECRET?: string; // Shared access token secret
  GAS_URL?: string;
  SHEETS_QUEUE?: any; // Cloudflare Queue binding
}

// In-Memory Rate Limiter
class InMemoryRateLimiter {
  private records: Map<string, { hits: number; windowStart: number }> = new Map();

  isRateLimited(key: string, limit: number, windowSizeMs: number = 3600000): boolean {
    const now = Date.now();
    const record = this.records.get(key);

    if (!record) {
      this.records.set(key, { hits: 1, windowStart: now });
      return false;
    }

    if (now - record.windowStart > windowSizeMs) {
      record.hits = 1;
      record.windowStart = now;
      return false;
    }

    if (record.hits >= limit) {
      return true;
    }

    record.hits++;
    return false;
  }
}

const limiter = new InMemoryRateLimiter();

// In-Memory Circuit Breaker for Providers
class CircuitBreaker {
  private status: Record<string, 'CLOSED' | 'OPEN' | 'HALF_OPEN'> = {};
  private failures: Record<string, number> = {};
  private cooldownUntil: Record<string, number> = {};

  isOpen(provider: string): boolean {
    const now = Date.now();
    if (this.status[provider] === 'OPEN') {
      if (now >= (this.cooldownUntil[provider] || 0)) {
        this.status[provider] = 'HALF_OPEN';
        return false;
      }
      return true;
    }
    return false;
  }

  reportFailure(provider: string, status?: number) {
    this.failures[provider] = (this.failures[provider] || 0) + 1;
    const threshold = status === 429 ? 1 : 3;
    const duration = status === 429 ? 300000 : 30000;

    if (this.failures[provider] >= threshold) {
      this.status[provider] = 'OPEN';
      this.cooldownUntil[provider] = Date.now() + duration;
    }
  }

  reportSuccess(provider: string) {
    this.failures[provider] = 0;
    this.status[provider] = 'CLOSED';
  }
}

const cb = new CircuitBreaker();

// Helper to hash client IP
async function hashIP(ip: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(ip);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// Token Signing (HMAC-SHA256 for short-lived presigned upload token)
async function generateSignedToken(action: string, key: string, expiresAt: number, secret: string): Promise<string> {
  const message = `${action}:${key}:${expiresAt}`;
  const encoder = new TextEncoder();
  const keyBuf = encoder.encode(secret);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuf,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return btoa(message).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') + '.' + signature;
}

async function verifySignedToken(token: string, secret: string): Promise<{ action: string; key: string } | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [b64Message, signature] = parts;

  let message = '';
  try {
    message = atob(b64Message.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return null;
  }

  const [action, key, expiresAtStr] = message.split(':');
  const expiresAt = parseInt(expiresAtStr, 10);
  if (isNaN(expiresAt) || Date.now() > expiresAt) {
    return null;
  }

  const encoder = new TextEncoder();
  const keyBuf = encoder.encode(secret);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuf,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const sigStr = signature.replace(/-/g, '+').replace(/_/g, '/');
  const sigBytes = Uint8Array.from(atob(sigStr), c => c.charCodeAt(0));

  const isValid = await crypto.subtle.verify('HMAC', cryptoKey, sigBytes, encoder.encode(message));
  if (isValid) {
    return { action, key };
  }
  return null;
}

// Supabase JWT Verification
async function verifySupabaseJWT(token: string, secret: string): Promise<any | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  try {
    const encoder = new TextEncoder();
    const rawSecret = encoder.encode(secret);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      rawSecret,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const sigStr = signatureB64.replace(/-/g, '+').replace(/_/g, '/');
    const sigBytes = Uint8Array.from(atob(sigStr), c => c.charCodeAt(0));

    const isValid = await crypto.subtle.verify(
      'HMAC',
      cryptoKey,
      sigBytes,
      encoder.encode(`${headerB64}.${payloadB64}`)
    );

    if (!isValid) return null;

    const payloadStr = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadStr);

    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return null;
    }

    return payload;
  } catch (e) {
    return null;
  }
}

// User Context Resolver
async function getUserFromRequest(request: Request, env: Env): Promise<{ role: 'admin' | 'manager' | 'staff'; id: string } | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.split(" ")[1];

  // Support shared secret fallback if Supabase is not configured or as a bypass
  const sharedSecret = env.SHARED_SECRET || 'kg_booking_secret_token_2026';
  if (token === sharedSecret) {
    return { role: 'admin', id: 'shared-secret-user' };
  }

  // If Supabase secret is defined, verify strictly
  if (env.SUPABASE_JWT_SECRET) {
    const payload = await verifySupabaseJWT(token, env.SUPABASE_JWT_SECRET);
    if (!payload) return null;
    // Strictly verify role from app_metadata as required
    const role = payload.app_metadata?.role;
    if (role === 'admin' || role === 'manager' || role === 'staff') {
      return { role, id: payload.sub || '' };
    }
    return null;
  }

  return null;
}

// Facebook Messenger Automatic Booking Saver
async function saveFacebookBookingToDB(senderPsid: string, text: string, env: Env) {
  try {
    const phoneMatch = text.match(/0\d{9,10}/);
    const phone = phoneMatch ? phoneMatch[0] : '';
    
    const paxMatch = text.match(/(\d+)\s*(người|khách|pax)/i);
    const pax = paxMatch ? parseInt(paxMatch[1]) : 2;

    const timeMatch = text.match(/(\d{1,2})[h:](\d{2})?/i);
    const hour = timeMatch ? timeMatch[1].padStart(2, '0') : '19';
    const min = timeMatch && timeMatch[2] ? timeMatch[2].padStart(2, '0') : '00';
    const eventTime = `${hour}:${min}`;

    const d = new Date();
    const isoDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const eventDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

    const nameMatch = text.match(/(anh|chị|khách)\s+([a-zA-ZÀ-ỹ\s]+)/i);
    const customerName = nameMatch ? `${nameMatch[1]} ${nameMatch[2].trim()}` : `Khách FB (${senderPsid.slice(-4)})`;

    const supabaseUrl = "https://azfkzheypuvfcitckovf.supabase.co";

    const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6Zmt6aGV5cHV2ZmNpdGNrb3ZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNzc1MjEsImV4cCI6MjEwMDY1MzUyMX0.ltnY7GTzKGE7QiWTv8ZuDlfT_NWIR2sGfGudoVDw4NQ";

    // 1. Post to Supabase PostgreSQL bookings table (Exact Schema Column Names)
    const resPost = await fetch(`${supabaseUrl}/rest/v1/bookings`, {
      method: "POST",
      headers: {
        "apikey": anonKey,
        "Authorization": `Bearer ${anonKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        customer_name: customerName,
        customer_phone: phone || "0900000000",
        booking_date: isoDate,
        start_time: eventTime,
        guest_count: pax,
        table_id: "Khu A",
        source: "facebook_messenger",
        status: "pending",
        note: `FB Messenger (${senderPsid}): "${text}"`,
        raw_message: text
      })
    });
    console.log(`[FB Auto Booking] Supabase Bookings Insert Status: ${resPost.status}`);

    // 2. Post to Supabase audit_logs for real-time chat log streaming
    await fetch(`${supabaseUrl}/rest/v1/audit_logs`, {
      method: "POST",
      headers: {
        "apikey": anonKey,
        "Authorization": `Bearer ${anonKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        actor_role: "facebook_user",
        action: "facebook_message_received",
        target_type: "messenger",
        target_id: senderPsid,
        before_json: { customer_name: customerName, psid: senderPsid },
        after_json: { text: text, time: new Date().toISOString() }
      })
    });


    // 2. Post to Google Sheets GAS endpoint
    const gasUrl = env.GAS_URL || "https://script.google.com/macros/s/AKfycbxzjio4sat5fWoUncPgp8SfjoGqfGxW5vFoDgkHvBI3OKVWIaszsAaUt0LE2fCHtkCFsA/exec";
    await fetch(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "saveOrder",
        orderData: {
          id: `fb-${senderPsid}-${Date.now()}`,
          timestamp: new Date().toISOString(),
          parsedCustomer: {
            name: customerName,
            phone: phone || "0900000000",
            date: eventDate,
            time: eventTime,
            pax: pax.toString(),
            tables: "Khu A",
            type: "Facebook Fanpage",
            note: text
          },
          totalAmount: 0,
          depositAmount: 0,
          isDeposited: false,
          menuItems: [],
          staff: { name: "AI Chatbot Facebook", phone: "" }
        }
      })
    });
    console.log(`[FB Auto Booking] Successfully created order for ${customerName}`);
  } catch (err) {
    console.error("[FB Auto Booking Error]", err);
  }
}

export default {

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get('Origin') || '*';
    const corsHeaders = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-KG-Role",
      "Access-Control-Max-Age": "86400"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // --- PUBLIC ENDPOINTS ---
      
      // Health Check
      if (path === "/api/ai/health" && request.method === "GET") {
        return new Response(JSON.stringify({ ok: true, status: "healthy", version: "2.5.0-APEX" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Facebook Messenger Webhook Verification (GET)
      if ((path === "/api/webhook/facebook" || path === "/webhook/facebook") && request.method === "GET") {
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge") || "";

        const EXPECTED_TOKEN = env.FB_VERIFY_TOKEN || "kg_booking_facebook_secret_token";

        console.log(`[FB Webhook GET] mode=${mode}, token=${token}, challenge=${challenge}`);

        // If Meta sends challenge, return raw challenge string with text/plain status 200
        if (challenge) {
          return new Response(challenge, {
            status: 200,
            headers: {
              "Content-Type": "text/plain",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        if (token === EXPECTED_TOKEN || token === "kg_booking_facebook_secret_token") {
          return new Response("OK", { status: 200, headers: { "Content-Type": "text/plain" } });
        }
        return new Response("Forbidden: Invalid verify token", { status: 403 });
      }


      // Facebook Messenger Webhook Message Ingestion (POST)
      if ((path === "/api/webhook/facebook" || path === "/webhook/facebook") && request.method === "POST") {
        try {
          const body = await request.json() as any;
          if (body.object === 'page') {
            const pageAccessToken = env.FB_PAGE_ACCESS_TOKEN || "EAAYwJz8TUaABSOZB52MUg7ZBeIrk7ckvQSKwKhI8SWXS8R9AcOAoiV4ZCnUWVLtLtZAxC0hXve5SlGyZAvLS68jCdmAr2GatmuYSOsWFsG9k0my7KKOlyLN6MMB8Gt6yrGlzBx43bGPGSgK4MlO40GQ6UrKyN5xsZCPViGgZC1Y2mV3OzRL8BFV5YrBDQIec7ShIfNswECw";
            
            for (const entry of body.entry || []) {
              const webhookEvent = entry.messaging?.[0];
              if (webhookEvent && webhookEvent.message && !webhookEvent.message.is_echo) {
                const senderPsid = webhookEvent.sender?.id;
                const messageText = webhookEvent.message?.text || '';
                console.log(`[FB Webhook] Event received from PSID ${senderPsid}: "${messageText}"`);

                if (senderPsid && messageText && pageAccessToken) {
                  // Fire-and-forget AI reply to Messenger & Auto-save Booking to DB
                  ctx.waitUntil((async () => {
                    let aiReply = "Dạ chào anh/chị! Nhà hàng KING'S GRILL xin nghe ạ. Anh/chị cần đặt bàn mấy người và vào khung giờ nào để em hỗ trợ giữ vị trí đẹp ạ?";
                    const lowerText = messageText.toLowerCase();

                    if (lowerText.includes('menu') || lowerText.includes('thực đơn') || lowerText.includes('giá')) {
                      aiReply = "Dạ KING'S GRILL kính gửi anh/chị thực đơn Set Combo lẩu nướng ưu đãi:\n🔥 Set Lẩu Nướng 499k (cho 3-4 người)\n🔥 Set Đại Tiệc 699k (cho 5-6 người)\n👉 Anh/chị xem chi tiết và tham gia quay thưởng voucher cọc bàn tại đây ạ: https://kg-booking.pages.dev";
                    } else if (lowerText.includes('đặt bàn') || lowerText.includes('bàn') || lowerText.includes('đặt') || lowerText.includes('người')) {
                      aiReply = "Dạ KING'S GRILL đã ghi nhận thông tin đặt bàn của anh/chị! Em đã tạo phiếu giữ chỗ trên hệ thống và xếp vị trí bàn đẹp ở Khu A. Anh/chị xem thông tin phiếu và cọc bàn nhận voucher quà tặng tại đây ạ: https://kg-booking.pages.dev";
                    }

                    // Always auto-save Facebook booking lead to Supabase PostgreSQL & Google Sheets!
                    await saveFacebookBookingToDB(senderPsid, messageText, env);


                    try {
                      await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          recipient: { id: senderPsid },
                          message: { text: aiReply }
                        })
                      });
                      console.log(`[FB Reply Success] Sent AI reply to PSID ${senderPsid}`);
                    } catch (replyErr) {
                      console.error(`[FB Reply Error]`, replyErr);
                    }
                  })());
                }

              }
            }
            return new Response("EVENT_RECEIVED", { status: 200 });
          }
        } catch (e) {
          console.error("[FB Webhook] Error processing payload:", e);
        }
        return new Response("Not Found", { status: 404 });
      }



      // Public Image Read
      if (request.method === 'GET' && path.startsWith('/image/')) {
        if (!env.BUCKET) {
          return new Response('R2 Bucket binding missing', { status: 500, headers: corsHeaders });
        }
        const key = path.replace('/image/', '');
        const object = await env.BUCKET.get(key);

        if (!object) {
          return new Response('Image not found', { status: 404, headers: corsHeaders });
        }

        const responseHeaders = new Headers(corsHeaders);
        responseHeaders.set('Content-Type', object.httpMetadata?.contentType || 'image/jpeg');
        responseHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
        responseHeaders.set('ETag', object.httpEtag);
        return new Response(object.body, { headers: responseHeaders });
      }

      // Secure Image Binary Upload (Strict 5MB check, authenticated via URL token)
      if (path === "/api/images/upload" && request.method === "PUT") {
        const uploadToken = url.searchParams.get('token');
        if (!uploadToken) {
          return new Response(JSON.stringify({ ok: false, error: "Missing upload token" }), { status: 401, headers: corsHeaders });
        }

        const jwtSecret = env.SUPABASE_JWT_SECRET || 'fallback-secret-for-presign';
        const tokenDetails = await verifySignedToken(uploadToken, jwtSecret);
        if (!tokenDetails || tokenDetails.action !== 'upload') {
          return new Response(JSON.stringify({ ok: false, error: "Invalid or expired upload token" }), { status: 403, headers: corsHeaders });
        }

        // 1. Strict 5MB size limit validation via headers
        const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
        if (contentLength > 5 * 1024 * 1024) {
          return new Response(JSON.stringify({ ok: false, error: "Payload too large. Max size is 5MB" }), {
            status: 413,
            headers: corsHeaders
          });
        }

        if (!env.BUCKET) {
          return new Response(JSON.stringify({ ok: false, error: "R2 Bucket not bound" }), { status: 500, headers: corsHeaders });
        }

        const bodyBytes = await request.arrayBuffer();
        
        // 2. Strict 5MB payload size validation
        if (bodyBytes.byteLength > 5 * 1024 * 1024) {
          return new Response(JSON.stringify({ ok: false, error: "Payload too large. Max size is 5MB" }), {
            status: 413,
            headers: corsHeaders
          });
        }

        const contentType = request.headers.get('Content-Type') || 'image/jpeg';
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(contentType)) {
          return new Response(JSON.stringify({ ok: false, error: "Unsupported Content-Type" }), {
            status: 400,
            headers: corsHeaders
          });
        }

        await env.BUCKET.put(tokenDetails.key, bodyBytes, {
          httpMetadata: { contentType },
          customMetadata: { uploadedAt: new Date().toISOString() }
        });

        return new Response(JSON.stringify({ ok: true, key: tokenDetails.key }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // --- PROTECTED ENDPOINTS (Requires Auth/Role) ---
      
      const user = await getUserFromRequest(request, env);
      if (!user) {
        return new Response(JSON.stringify({ ok: false, error: "Unauthorized: Invalid or missing Session JWT token" }), {
          status: 401,
          headers: corsHeaders
        });
      }

      // AI Models Listing
      if (path === "/api/ai/models" && request.method === "GET") {
        const availableModels = [
          { id: "llama-3.3-70b-versatile", provider: "groq" },
          { id: "gemini-2.0-flash", provider: "google" },
          { id: "gemini-2.0-flash-thinking", provider: "google" },
          { id: "deepseek-r1", provider: "openrouter" }
        ];
        return new Response(JSON.stringify({ ok: true, models: availableModels }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // AI Analyze
      if (path === "/api/ai/analyze" && request.method === "POST") {
        const payload = await request.json() as any;
        const { model, provider, sysPrompt, userPrompt, image, jsonMode } = payload;

        if (!model || !provider || !sysPrompt || !userPrompt) {
          return new Response(JSON.stringify({ ok: false, error: "Missing parameters" }), { status: 400, headers: corsHeaders });
        }

        // Rate Limiter
        const clientIP = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
        const ipHash = await hashIP(clientIP);
        const rateRole = user.role;
        let limit = 60;
        if (rateRole === 'manager') limit = 200;
        else if (rateRole === 'admin') limit = 500;

        if (limiter.isRateLimited(`${ipHash}:${rateRole}`, limit)) {
          return new Response(JSON.stringify({ ok: false, error: "Rate Limit Exceeded", errorCode: "RATE_LIMITED" }), { status: 429, headers: corsHeaders });
        }

        if (cb.isOpen(provider.toLowerCase())) {
          return new Response(JSON.stringify({ ok: false, error: `Circuit Breaker Open for: ${provider}` }), { status: 503, headers: corsHeaders });
        }

        // Process AI request
        try {
          const apiRes = await executeAIRequest(payload, env);
          cb.reportSuccess(provider.toLowerCase());
          return new Response(JSON.stringify({ ok: true, content: apiRes }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        } catch (e: any) {
          cb.reportFailure(provider.toLowerCase());
          return new Response(JSON.stringify({ ok: false, error: e.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }

      // Presign Upload URL (Strict size limit and mime-type check)
      if (path === "/api/images/presign" && request.method === "POST") {
        const body = await request.json() as any;
        const { filename, type, orderId } = body;

        // 1. Strict Mime-type Verification
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(type)) {
          return new Response(JSON.stringify({ ok: false, error: "Unsupported image type. Allowed: jpeg, png, webp" }), {
            status: 400,
            headers: corsHeaders
          });
        }

        // 2. Strict File Extension Check
        const ext = (filename || '').split('.').pop()?.toLowerCase();
        if (!ext || !['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
          return new Response(JSON.stringify({ ok: false, error: "Invalid file extension" }), {
            status: 400,
            headers: corsHeaders
          });
        }

        const ts = Date.now();
        const safeName = (filename || 'image.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
        const key = orderId
          ? `orders/${orderId}/${ts}_${safeName}`
          : `uploads/${ts}_${safeName}`;

        // Signed token generated with HMAC-SHA256
        const jwtSecret = env.SUPABASE_JWT_SECRET || 'fallback-secret-for-presign';
        const uploadToken = await generateSignedToken('upload', key, Date.now() + 60000, jwtSecret);
        const uploadUrl = `${url.origin}/api/images/upload?token=${uploadToken}`;

        return new Response(JSON.stringify({ ok: true, url: uploadUrl, method: 'PUT', key }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Delete Image (Manager or Admin)
      if (request.method === 'DELETE' && path.startsWith('/image/')) {
        if (user.role !== 'admin' && user.role !== 'manager') {
          return new Response(JSON.stringify({ ok: false, error: "Permission Denied: Manager/Admin role required" }), { status: 403, headers: corsHeaders });
        }
        if (!env.BUCKET) {
          return new Response(JSON.stringify({ ok: false, error: "R2 Bucket not bound" }), { status: 500, headers: corsHeaders });
        }
        const key = path.replace('/image/', '');
        await env.BUCKET.delete(key);
        return new Response(JSON.stringify({ ok: true, message: 'Deleted' }), { status: 200, headers: corsHeaders });
      }

      // List Images (Admin)
      if (path === "/list" && request.method === "GET") {
        if (user.role !== 'admin') {
          return new Response(JSON.stringify({ ok: false, error: "Permission Denied: Admin role required" }), { status: 403, headers: corsHeaders });
        }
        if (!env.BUCKET) {
          return new Response(JSON.stringify({ ok: false, error: "R2 Bucket not bound" }), { status: 500, headers: corsHeaders });
        }
        const prefix = url.searchParams.get('prefix') || '';
        const listed = await env.BUCKET.list({ prefix, limit: 100 });
        const files = listed.objects.map((obj: any) => ({
          key: obj.key,
          size: obj.size,
          uploaded: obj.uploaded,
          url: `${url.origin}/image/${obj.key}`
        }));
        return new Response(JSON.stringify({ ok: true, files, truncated: listed.truncated }), { status: 200, headers: corsHeaders });
      }

      // Cleanup Images (Admin)
      if (path === "/cleanup" && request.method === "DELETE") {
        if (user.role !== 'admin') {
          return new Response(JSON.stringify({ ok: false, error: "Permission Denied: Admin role required" }), { status: 403, headers: corsHeaders });
        }
        if (!env.BUCKET) {
          return new Response(JSON.stringify({ ok: false, error: "R2 Bucket not bound" }), { status: 500, headers: corsHeaders });
        }
        const days = parseInt(url.searchParams.get('days') || '90', 10);
        const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
        const listed = await env.BUCKET.list({ limit: 500 });
        
        let deleted = 0;
        for (const obj of listed.objects) {
          if (new Date(obj.uploaded).getTime() < cutoff) {
            await env.BUCKET.delete(obj.key);
            deleted++;
          }
        }
        return new Response(JSON.stringify({ ok: true, deleted, message: `Cleaned ${deleted} files` }), { status: 200, headers: corsHeaders });
      }

      // Stats (Admin)
      if (path === "/stats" && request.method === "GET") {
        if (user.role !== 'admin') {
          return new Response(JSON.stringify({ ok: false, error: "Permission Denied: Admin role required" }), { status: 403, headers: corsHeaders });
        }
        if (!env.BUCKET) {
          return new Response(JSON.stringify({ ok: false, error: "R2 Bucket not bound" }), { status: 500, headers: corsHeaders });
        }
        const listed = await env.BUCKET.list({ limit: 1000 });
        const totalSize = listed.objects.reduce((acc: number, obj: any) => acc + obj.size, 0);
        return new Response(JSON.stringify({
          ok: true,
          totalFiles: listed.objects.length,
          totalSizeMB: (totalSize / 1024 / 1024).toFixed(2)
        }), { status: 200, headers: corsHeaders });
      }

      // Sheets Sync Forwarding via Cloudflare Queue (Guarantees retry/DLQ)
      if (path === "/api" && request.method === "POST") {
        const payload = await request.json() as any;

        if (!env.SHEETS_QUEUE) {
          return new Response(JSON.stringify({ ok: false, error: "Cloudflare Queue binding SHEETS_QUEUE not configured" }), {
            status: 500,
            headers: corsHeaders
          });
        }

        // Push sync action to the queue
        await env.SHEETS_QUEUE.send(payload);

        return new Response(JSON.stringify({ ok: true, status: "pending", message: "Sheets sync task successfully queued" }), {
          status: 202,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ ok: false, error: "Not found" }), { status: 404, headers: corsHeaders });
    } catch (e: any) {
      return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: corsHeaders });
    }
  },

  // Cloudflare Queue Consumer
  async queue(batch: any, env: Env, ctx: ExecutionContext): Promise<void> {
    const gasUrl = env.GAS_URL || 'https://script.google.com/macros/s/AKfycbxzjio4sat5fWoUncPgp8SfjoGqfGxW5vFoDgkHvBI3OKVWIaszsAaUt0LE2fCHtkCFsA/exec';
    
    for (const message of batch.messages) {
      const payload = message.body;
      try {
        const res = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          throw new Error(`GAS Endpoint returned HTTP ${res.status}`);
        }
      } catch (err: any) {
        console.error(`[Queue Consumer] Fail to sync to Google Sheets:`, err.message);
        // Throwing error triggers Cloudflare Queue retry mechanism & DLQ mapping
        throw err;
      }
    }
  }
};

async function executeAIRequest(payload: any, env: Env): Promise<string> {
  const { model, provider, sysPrompt, userPrompt, image, jsonMode, responseSchema, maxOutputTokens, temperature } = payload;

  let apiKey = '';
  let targetUrl = '';
  const fetchHeaders = new Headers();
  fetchHeaders.set('Content-Type', 'application/json');
  let body: any = {};

  if (provider === 'google') {
    apiKey = env.GEMINI_API_KEY || '';
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured on Worker');
    
    targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const parts: any[] = [{ text: sysPrompt + '\n\nUser Input:\n' + userPrompt }];
    if (image) {
      const partsImage = image.split(',');
      parts.push({
        inline_data: {
          mime_type: partsImage[0].split(':')[1]?.split(';')[0] || 'image/jpeg',
          data: partsImage[1] || partsImage[0]
        }
      });
    }

    body = {
      contents: [{ parts }],
      generationConfig: {
        temperature: temperature ?? 0.1,
        ...(maxOutputTokens ? { maxOutputTokens } : {}),
        ...(jsonMode ? { responseMimeType: 'application/json' } : {})
      }
    };
    if (jsonMode && responseSchema) {
      body.generationConfig.responseSchema = responseSchema;
    }
  } else {
    if (provider === 'groq') {
      apiKey = env.GROQ_API_KEY || '';
      targetUrl = 'https://api.groq.com/openai/v1/chat/completions';
    } else if (provider === 'cerebras') {
      apiKey = env.CEREBRAS_API_KEY || '';
      targetUrl = 'https://api.cerebras.ai/v1/chat/completions';
    } else if (provider === 'mistral') {
      apiKey = env.MISTRAL_API_KEY || '';
      targetUrl = 'https://api.mistral.ai/v1/chat/completions';
    } else if (provider === 'openrouter') {
      apiKey = env.OPENROUTER_API_KEY || '';
      targetUrl = 'https://openrouter.ai/api/v1/chat/completions';
      fetchHeaders.set('HTTP-Referer', 'https://kings-grill-booking.pages.dev');
      fetchHeaders.set('X-Title', 'KING\'S GRILL BOOKING APP');
    } else if (provider === 'pollinations') {
      targetUrl = 'https://text.pollinations.ai/openai/v1/chat/completions';
    }

    if (!apiKey && provider !== 'pollinations') throw new Error(`API Key for provider '${provider}' is not configured on Worker`);
    if (apiKey) {
      fetchHeaders.set('Authorization', `Bearer ${apiKey}`);
    }

    let msgContent: any = userPrompt;
    if (image) {
      msgContent = [
        { type: 'text', text: userPrompt },
        { type: 'image_url', image_url: { url: image } }
      ];
    }

    body = {
      model: model,
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: msgContent }
      ],
      temperature: temperature ?? 0.1,
      ...(maxOutputTokens ? { max_tokens: maxOutputTokens } : {})
    };

    if (jsonMode) {
      const noSchemaProviders = ['pollinations', 'huggingface'];
      if (responseSchema && !noSchemaProviders.includes(provider.toLowerCase())) {
        body.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'booking_extraction',
            strict: true,
            schema: responseSchema
          }
        };
      } else {
        body.response_format = { type: 'json_object' };
      }
    }
  }

  const upstreamRes = await fetch(targetUrl, {
    method: 'POST',
    headers: fetchHeaders,
    body: JSON.stringify(body)
  });

  if (!upstreamRes.ok) {
    const errText = await upstreamRes.text();
    throw new Error(`Upstream Error: ${errText}`);
  }

  const resJson = await upstreamRes.json() as any;
  let content = '';

  if (provider === 'google') {
    const parts = resJson.candidates?.[0]?.content?.parts || [];
    for (let p = parts.length - 1; p >= 0; p--) {
      if (parts[p].text && !parts[p].thought) {
        content = parts[p].text;
        break;
      }
    }
    if (!content) content = parts.find((p: any) => p.text)?.text || '';
  } else {
    content = resJson.choices?.[0]?.message?.content || '';
  }

  return content;
}
