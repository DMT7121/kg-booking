// Cloudflare AI Gateway Worker implementation (index.ts)

export interface Env {
  GEMINI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  GROQ_API_KEY?: string;
  CEREBRAS_API_KEY?: string;
  MISTRAL_API_KEY?: string;
  APP_SHARED_SECRET: string;
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

    return new Response(JSON.stringify({ ok: false, error: "Endpoint not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
};
