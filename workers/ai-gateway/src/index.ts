// Cloudflare AI Gateway Worker implementation (index.ts)

export interface Env {
  GEMINI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  GROQ_API_KEY?: string;
  CEREBRAS_API_KEY?: string;
  MISTRAL_API_KEY?: string;
  APP_SHARED_SECRET: string;
  GOOGLE_CLIENT_EMAIL?: string;
  GOOGLE_PRIVATE_KEY?: string;
  GOOGLE_SPREADSHEET_ID: string;
}

// In-Memory Rate Limiter (Local to isolate, upgradeable to KV)
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

// In-Memory Circuit Breaker for Providers (Local to isolate)
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
    const threshold = status === 429 ? 1 : 3; // Cooldown immediately on 429
    const duration = status === 429 ? 300000 : 30000; // 5 mins on 429, 30s on others

    if (this.failures[provider] >= threshold) {
      this.status[provider] = 'OPEN';
      this.cooldownUntil[provider] = Date.now() + duration;
      console.warn(`[Circuit Breaker] Provider [${provider}] is OPEN. Cooldown for ${duration}ms.`);
    }
  }

  reportSuccess(provider: string) {
    this.failures[provider] = 0;
    this.status[provider] = 'CLOSED';
  }
}

const cb = new CircuitBreaker();

// Helper to hash client IP (minimizes privacy risks / GDPR compliance)
async function hashIP(ip: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(ip);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-KG-Role",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // 0. GET / (Console Home Page)
    if ((url.pathname === "/" || url.pathname === "") && request.method === "GET") {
      return new Response(HTML_PAGE, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/html; charset=utf-8"
        }
      });
    }

    // 1. GET /api/ai/health
    if (url.pathname === "/api/ai/health" && request.method === "GET") {
      return new Response(JSON.stringify({ ok: true, status: "healthy", version: "1.0.0" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 2. GET /api/ai/models
    if (url.pathname === "/api/ai/models" && request.method === "GET") {
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

    // 3. POST /api/ai/analyze
    if (url.pathname === "/api/ai/analyze" && request.method === "POST") {
      try {
        // Authenticate request
        const authHeader = request.headers.get("Authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.split(" ")[1] !== env.APP_SHARED_SECRET) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized: Invalid App Shared Secret" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // Validate payload size (limit: 5MB to avoid memory overflow)
        const contentLength = parseInt(request.headers.get("content-length") || "0");
        if (contentLength > 5 * 1024 * 1024) {
          return new Response(JSON.stringify({ ok: false, error: "Payload too large" }), {
            status: 413,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const payload = await request.json() as any;
        const { model, provider, sysPrompt, userPrompt, image, jsonMode, taskType = "booking_extract" } = payload;

        if (!model || !provider || !sysPrompt || !userPrompt) {
          return new Response(JSON.stringify({ ok: false, error: "Missing required parameters" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // Reject invalid task types
        const validTaskTypes = ["booking_extract", "menu_match", "customer_reply", "correction_analysis"];
        if (!validTaskTypes.includes(taskType)) {
          return new Response(JSON.stringify({ ok: false, error: `Invalid task type: ${taskType}` }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // Rate Limiting Logic
        const clientIP = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
        const ipHash = await hashIP(clientIP);
        const userRole = request.headers.get("X-KG-Role") || "staff";

        let rateLimit = 60; // default for staff
        if (userRole === "manager") rateLimit = 200;
        else if (userRole === "admin") rateLimit = 500;

        if (limiter.isRateLimited(`${ipHash}:${userRole}`, rateLimit)) {
          return new Response(JSON.stringify({ ok: false, error: "Rate Limit Exceeded", errorCode: "RATE_LIMITED" }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // Circuit Breaker check
        const normalizedProvider = provider.toLowerCase();
        if (cb.isOpen(normalizedProvider)) {
          return new Response(JSON.stringify({ ok: false, error: `Circuit Breaker Open for provider: ${provider}`, errorCode: "AI_PROVIDER_DOWN" }), {
            status: 503,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // Target Provider Setup
        let targetUrl = "";
        let requestHeaders: Record<string, string> = { "Content-Type": "application/json" };
        let requestBody: any = {};
        const startTime = Date.now();

        if (normalizedProvider === "google") {
          const apiKey = env.GEMINI_API_KEY;
          if (!apiKey) throw new Error("GEMINI_API_KEY is not configured on Worker");
          targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          requestBody = {
            contents: [{
              parts: [
                { text: sysPrompt + "\n\nUser Input:\n" + userPrompt },
                ...(image ? [{ inline_data: { mime_type: "image/jpeg", data: image.split(",")[1] } }] : [])
              ]
            }],
            generationConfig: {
              temperature: 0.1,
              ...(jsonMode ? { responseMimeType: "application/json" } : {})
            }
          };
        } else if (normalizedProvider === "groq" || normalizedProvider === "cerebras" || normalizedProvider === "openrouter") {
          let apiKey = "";
          if (normalizedProvider === "groq") {
            apiKey = env.GROQ_API_KEY || "";
            targetUrl = "https://api.groq.com/openai/v1/chat/completions";
          } else if (normalizedProvider === "cerebras") {
            apiKey = env.CEREBRAS_API_KEY || "";
            targetUrl = "https://api.cerebras.ai/v1/chat/completions";
          } else {
            apiKey = env.OPENROUTER_API_KEY || "";
            targetUrl = "https://openrouter.ai/api/v1/chat/completions";
            requestHeaders["HTTP-Referer"] = "https://kings-grill-booking.pages.dev";
            requestHeaders["X-Title"] = "KING'S GRILL BOOKING APP";
          }

          if (!apiKey) throw new Error(`${provider.toUpperCase()}_API_KEY is not configured on Worker`);
          requestHeaders["Authorization"] = `Bearer ${apiKey}`;

          let msgContent: any = userPrompt;
          if (image) {
            msgContent = [
              { type: "text", text: userPrompt },
              { type: "image_url", image_url: { url: image } }
            ];
          }

          requestBody = {
            model: model,
            messages: [
              { role: "system", content: sysPrompt },
              { role: "user", content: msgContent }
            ],
            temperature: 0.1,
            ...(jsonMode ? { response_format: { type: "json_object" } } : {})
          };
        } else {
          return new Response(JSON.stringify({ ok: false, error: `Unsupported provider: ${provider}` }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // Fetch AI Completion with 20s timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);

        try {
          const aiResponse = await fetch(targetUrl, {
            method: "POST",
            headers: requestHeaders,
            body: JSON.stringify(requestBody),
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (!aiResponse.ok) {
            const status = aiResponse.status;
            cb.reportFailure(normalizedProvider, status);
            const errText = await aiResponse.text().catch(() => `HTTP ${status}`);
            return new Response(JSON.stringify({ ok: false, error: `AI Provider Error (${status}): ${errText.substring(0, 150)}` }), {
              status: status >= 500 ? 502 : status, // Map server errors to standard codes
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }

          const resJson = await aiResponse.json() as any;
          let aiContent = "";
          let promptTokens = 0;
          let completionTokens = 0;

          if (normalizedProvider === "google") {
            const parts = resJson.candidates?.[0]?.content?.parts || [];
            aiContent = parts.find((p: any) => p.text)?.text || "";
            promptTokens = resJson.usageMetadata?.promptTokenCount || 0;
            completionTokens = resJson.usageMetadata?.candidatesTokenCount || 0;
          } else {
            aiContent = resJson.choices?.[0]?.message?.content || "";
            promptTokens = resJson.usage?.prompt_tokens || 0;
            completionTokens = resJson.usage?.completion_tokens || 0;
          }

          cb.reportSuccess(normalizedProvider);
          const latencyMs = Date.now() - startTime;

          // Safe Usage Logging to console (will be synchronized to postgres DB via analytics)
          console.log(`[AI Usage] Model: ${model} | Provider: ${provider} | Tokens: ${promptTokens + completionTokens} | Latency: ${latencyMs}ms | IP Hash: ${ipHash}`);

          return new Response(JSON.stringify({
            ok: true,
            content: aiContent,
            usage: {
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: promptTokens + completionTokens
            },
            latencyMs
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });

        } catch (fetchErr: any) {
          clearTimeout(timeoutId);
          cb.reportFailure(normalizedProvider, 504);
          const isTimeout = fetchErr.name === "AbortError";
          return new Response(JSON.stringify({ ok: false, error: isTimeout ? "Gateway Timeout (20s)" : fetchErr.message }), {
            status: isTimeout ? 504 : 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

      } catch (err: any) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // 4. POST /api/sheets/upsert (Google Sheets API V4 Direct Fast Write)
    if (url.pathname === "/api/sheets/upsert" && request.method === "POST") {
      try {
        // Authenticate request
        const authHeader = request.headers.get("Authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.split(" ")[1] !== env.APP_SHARED_SECRET) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized: Invalid App Shared Secret" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const payload = await request.json() as any;
        const { range, bookingId, row } = payload;
        const spreadsheetId = payload.spreadsheetId || env.GOOGLE_SPREADSHEET_ID;

        if (!spreadsheetId || !range || !bookingId || !row) {
          return new Response(JSON.stringify({ ok: false, error: "Missing required parameters" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // Get Service Account credentials from environment variables
        const clientEmail = env.GOOGLE_CLIENT_EMAIL;
        const privateKey = env.GOOGLE_PRIVATE_KEY;

        if (!clientEmail || !privateKey) {
          return new Response(JSON.stringify({ ok: false, error: "Google Service Account credentials are not configured on Worker" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const accessToken = await getGoogleAccessToken(clientEmail, privateKey);

        // Fetch current values in range to find if bookingId already exists
        const fetchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
        const fetchResponse = await fetch(fetchUrl, {
          headers: {
            "Authorization": `Bearer ${accessToken}`
          }
        });

        let values: string[][] = [];
        if (fetchResponse.ok) {
          const fetchJson = await fetchResponse.json() as any;
          values = fetchJson.values || [];
        }

        // Find existing booking row by ID (assume ID is in the first column, index 0)
        let foundRowIndex = -1;
        for (let i = 0; i < values.length; i++) {
          if (values[i] && values[i][0] === bookingId) {
            foundRowIndex = i + 1; // 1-indexed for Sheets API
            break;
          }
        }

        const sheetName = range.split("!")[0] || "Orders";
        let sheetsUrl = "";
        let method = "POST";
        let body: any = {};

        if (foundRowIndex === -1) {
          // Append (New booking)
          sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName + "!A:J")}:append?valueInputOption=USER_ENTERED`;
          method = "POST";
          body = { values: [row] };
        } else {
          // Update (Existing booking)
          sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName + "!A" + foundRowIndex + ":J" + foundRowIndex)}?valueInputOption=USER_ENTERED`;
          method = "PUT";
          body = { values: [row] };
        }

        const writeResponse = await fetch(sheetsUrl, {
          method: method,
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        });

        if (!writeResponse.ok) {
          const errText = await writeResponse.text();
          return new Response(JSON.stringify({ ok: false, error: `Google Sheets API Write Error: ${errText}` }), {
            status: writeResponse.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const writeJson = await writeResponse.json() as any;
        return new Response(JSON.stringify({ ok: true, data: writeJson }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

      } catch (err: any) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    return new Response(JSON.stringify({ ok: false, error: "Endpoint not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
};

async function getGoogleAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = privateKey
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\s+/g, "");
  
  const binaryDerString = atob(pemContents);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: { name: "SHA-256" }
    },
    false,
    ["sign"]
  );

  const header = {
    alg: "RS256",
    typ: "JWT"
  };
  
  const now = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };

  const base64UrlEncode = (obj: any) => {
    const str = JSON.stringify(obj);
    const base64 = btoa(unescape(encodeURIComponent(str)));
    return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  };

  const tokenInput = `${base64UrlEncode(header)}.${base64UrlEncode(claimSet)}`;
  
  const encoder = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(tokenInput)
  );

  const signatureArray = new Uint8Array(signatureBuffer);
  let signatureString = "";
  for (let i = 0; i < signatureArray.length; i++) {
    signatureString += String.fromCharCode(signatureArray[i]);
  }
  const signatureBase64 = btoa(signatureString);
  const signatureBase64Url = signatureBase64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const assertion = `${tokenInput}.${signatureBase64Url}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`
  });

  if (!tokenResponse.ok) {
    const errText = await tokenResponse.text();
    throw new Error(`Google OAuth2 Token Request failed: ${errText}`);
  }

  const tokenData = await tokenResponse.json() as any;
  return tokenData.access_token;
}

const HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KING'S GRILL — AI Gateway Console</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #09090e;
      --card-bg: rgba(17, 17, 28, 0.65);
      --border: rgba(255, 255, 255, 0.08);
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --primary: #8b5cf6;
      --primary-glow: rgba(139, 92, 246, 0.25);
      --accent: #06b6d4;
      --accent-glow: rgba(6, 182, 212, 0.25);
      --success: #10b981;
      --success-glow: rgba(16, 185, 129, 0.25);
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: 'Outfit', sans-serif;
      background-color: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem 1rem;
      overflow-x: hidden;
      position: relative;
    }
    
    /* Background gradients */
    body::before {
      content: '';
      position: absolute;
      width: 400px;
      height: 400px;
      background: radial-gradient(circle, var(--primary-glow) 0%, transparent 70%);
      top: -10%;
      left: -10%;
      z-index: 0;
      pointer-events: none;
    }
    
    body::after {
      content: '';
      position: absolute;
      width: 400px;
      height: 400px;
      background: radial-gradient(circle, var(--accent-glow) 0%, transparent 70%);
      bottom: -10%;
      right: -10%;
      z-index: 0;
      pointer-events: none;
    }
    
    .container {
      max-width: 720px;
      width: 100%;
      z-index: 1;
      position: relative;
    }
    
    .header {
      text-align: center;
      margin-bottom: 2rem;
    }
    
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.2);
      color: var(--success);
      padding: 0.5rem 1rem;
      border-radius: 9999px;
      font-weight: 600;
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 1rem;
      animation: pulse-border 2s infinite;
    }
    
    .dot {
      width: 8px;
      height: 8px;
      background-color: var(--success);
      border-radius: 50%;
      box-shadow: 0 0 10px var(--success);
      animation: blink 1.5s infinite;
    }
    
    h1 {
      font-size: 2.5rem;
      font-weight: 800;
      line-height: 1.2;
      background: linear-gradient(135deg, #ffffff 0%, #a78bfa 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 0.5rem;
      letter-spacing: -0.02em;
    }
    
    .subtitle {
      color: var(--text-muted);
      font-size: 1.1rem;
      font-weight: 300;
    }
    
    .card {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 2.5rem;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
      margin-bottom: 1.5rem;
    }
    
    .section-title {
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #ffffff;
    }
    
    .grid {
      display: grid;
      grid-template-cols: 1fr;
      gap: 1rem;
      margin-bottom: 2rem;
    }
    
    @media (min-width: 600px) {
      .grid {
        grid-template-cols: repeat(2, 1fr);
      }
    }
    
    .status-item {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: border-color 0.3s, transform 0.3s;
    }
    
    .status-item:hover {
      border-color: rgba(139, 92, 246, 0.3);
      transform: translateY(-2px);
    }
    
    .status-name {
      font-weight: 500;
      font-size: 0.95rem;
    }
    
    .status-val {
      font-size: 0.85rem;
      color: var(--success);
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    
    .status-val.operational::before {
      content: '';
      display: inline-block;
      width: 6px;
      height: 6px;
      background-color: var(--success);
      border-radius: 50%;
      box-shadow: 0 0 6px var(--success);
    }
    
    .code-block {
      background: #050508;
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 1.25rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85rem;
      overflow-x: auto;
      line-height: 1.5;
      color: #cbd5e1;
      margin-top: 0.5rem;
      position: relative;
    }
    
    .code-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-bottom: 0.75rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      padding-bottom: 0.5rem;
    }
    
    .method {
      background: var(--primary);
      color: white;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      font-weight: 700;
      font-size: 0.7rem;
    }
    
    .footer {
      text-align: center;
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-top: 1rem;
    }
    
    .footer a {
      color: var(--primary);
      text-decoration: none;
      font-weight: 500;
      transition: color 0.3s;
    }
    
    .footer a:hover {
      color: var(--accent);
    }
    
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    
    @keyframes pulse-border {
      0%, 100% { border-color: rgba(16, 185, 129, 0.2); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.0); }
      50% { border-color: rgba(16, 185, 129, 0.4); box-shadow: 0 0 12px rgba(16, 185, 129, 0.1); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="badge">
        <span class="dot"></span>
        Gateway Active
      </div>
      <h1>KING'S GRILL</h1>
      <div class="subtitle">AI Edge Orchestrator & API Gateway</div>
    </div>
    
    <div class="card">
      <div class="section-title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary);"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path><path d="m9 12 2 2 4-4"></path></svg>
        System Diagnostics & Providers
      </div>
      
      <div class="grid">
        <div class="status-item">
          <span class="status-name">Gateway Core API</span>
          <span class="status-val operational">Online</span>
        </div>
        <div class="status-item">
          <span class="status-name">Gemini Engine</span>
          <span class="status-val operational">Operational</span>
        </div>
        <div class="status-item">
          <span class="status-name">Groq Fast Engine</span>
          <span class="status-val operational">Operational</span>
        </div>
        <div class="status-item">
          <span class="status-name">OpenRouter Routing</span>
          <span class="status-val operational">Operational</span>
        </div>
      </div>
      
      <div class="section-title" style="margin-top: 1.5rem;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent);"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
        Gateway usage
      </div>
      
      <p style="font-size: 0.925rem; color: var(--text-muted); margin-bottom: 0.75rem; line-height: 1.5;">
        This orchestrator proxies requests securely to underlying AI models while managing token budgets, rate limits, and provider circuit breakers. To perform semantic extraction, hit the endpoint below:
      </p>
      
      <div class="code-block">
        <div class="code-header">
          <span>ENDPOINT REQUEST SPEC</span>
          <span class="method">POST</span>
        </div>
        <span style="color: #60a5fa;">POST</span> https://kg-ai-gateway.dmt-kgwork.workers.dev/api/ai/analyze<br>
        <span style="color: #38bdf8;">Headers:</span><br>
        &nbsp;&nbsp;Authorization: Bearer [APP_SHARED_SECRET]<br>
        &nbsp;&nbsp;Content-Type: application/json<br>
        &nbsp;&nbsp;X-KG-Role: admin | manager | staff
      </div>
    </div>
    
    <div class="footer">
      Designed for <a href="https://github.com/DMT7121/kg-booking" target="_blank">King's Grill Booking System v7.1</a> &copy; 2026. All rights reserved.
    </div>
  </div>
</body>
</html>`;
