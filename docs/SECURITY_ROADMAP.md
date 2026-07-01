# Lộ trình Bảo mật Local-first BYOK & AI Gateway (SECURITY_ROADMAP.md)

Tài liệu này hỗ trợ hai transport: **local BYOK direct-call** là đường ưu tiên và **AI Gateway Proxy** trên Cloudflare Workers là fallback/tùy chọn quản trị tập trung. Tài liệu đồng thời quy định bảo vệ key, chính sách client-side, RBAC và quản lý phiên.

---

## 1. Mục tiêu Bảo mật (Security Objectives)
- **Hỗ trợ BYOK local-first có kiểm soát**: Người dùng được phép chủ động lưu API key trên thiết bị để gọi thẳng AI provider. Tuyệt đối không lưu API key dưới dạng plaintext trong `localStorage`, Pinia snapshot, logs hoặc crash report; key phải nằm trong encrypted IndexedDB vault và chỉ được giải mã trong memory khi vault đang unlock.
- **Cloud key là tùy chọn**: Không tự động gửi local key lên GAS/Worker. Cloud sync phải là thao tác opt-in riêng và không được trả raw cloud key về browser.
- **Phòng chống lạm dụng (Rate Limiting)**: Thiết lập giới hạn tần suất gọi API trên mỗi IP / User Session nhằm ngăn chặn tấn công DDoS hoặc lạm dụng làm cạn kiệt Quota API.
- **Ghi nhật ký bảo mật (Audit Logging)**: Lưu trữ và giám sát các yêu cầu gọi AI (AI Request Logs) bao gồm: IP nguồn, model sử dụng, token tiêu hao và thời gian xử lý mà không làm rò rỉ dữ liệu nhạy cảm của khách hàng.
- **Bảo vệ cấu hình hệ thống**: Ngăn chặn người dùng không có thẩm quyền truy cập và sửa đổi cài đặt hệ thống.

---

## 2. Kiến trúc AI Gateway tùy chọn với Cloudflare Workers
Khi người dùng chọn `gateway_first`/`gateway_only`, hoặc direct-call bị chặn bởi CORS/network, yêu cầu AI được định tuyến qua Cloudflare Worker. Ở `local_first`, browser gọi thẳng provider bằng key trong local vault và không đi qua Worker/GAS.

```mermaid
sequenceDiagram
    participant User as Trình duyệt (Client)
    participant Worker as AI Gateway (Cloudflare Worker)
    participant Provider as AI Provider (Gemini / OpenRouter)

    User->>Worker: POST /api/ai/analyze (Bearer SessionToken)
    Note over Worker: 1. Xác thực SessionToken<br/>2. Kiểm tra Rate Limit<br/>3. Nạp API Key ẩn từ Secret Env
    Worker->>Provider: POST /v1/chat/completions (Authorization: API_KEY)
    Provider-->>Worker: Trả về kết quả JSON
    Note over Worker: Ghi log Latency & Token Usage
    Worker-->>User: Trả về kết quả (đã làm sạch dữ liệu nhạy cảm)
```

### Ưu điểm của Cloudflare Workers:
- **Thời gian phản hồi siêu nhanh (Ultra-low Latency)**: Chạy trên mạng lưới toàn cầu của Cloudflare (Edge Network), triệt tiêu độ trễ khởi động lạnh (cold start) so với Google Apps Script.
- **Bảo mật Secret**: API Keys được lưu trữ an toàn trong biến môi trường mã hóa của Cloudflare (`wrangler secret`).
- **Chi phí tối ưu**: Hỗ trợ 1 triệu requests miễn phí mỗi ngày.

---

## 3. Triển khai Cloudflare Worker Proxy (Mã nguồn minh họa)

Dưới đây là mã nguồn đề xuất cho Cloudflare Worker (`index.ts` hoặc `worker.js`) đảm nhiệm vai trò AI Gateway:

```typescript
export interface Env {
  GEMINI_API_KEY: string;
  OPENROUTER_API_KEY: string;
  APP_SHARED_SECRET: string; // Khóa chia sẻ để xác thực Client
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // 1. Cấu hình CORS Headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*", // Thay bằng domain chính thức khi production
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    try {
      const url = new URL(request.url);
      
      // 2. Xác thực Client Token
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.split(" ")[1] !== env.APP_SHARED_SECRET) {
        return new Response(JSON.stringify({ ok: false, error: "Unauthorized: Invalid App Secret Token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 3. Phân tích Payload nhận từ Frontend
      const payload = await request.json() as any;
      const { model, provider, sysPrompt, userPrompt, image, jsonMode } = payload;

      if (!sysPrompt || !userPrompt) {
        return new Response(JSON.stringify({ ok: false, error: "Missing required prompts" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 4. Chọn API Key tương ứng dựa trên Provider
      let apiKey = "";
      let targetUrl = "";
      let headers: Record<string, string> = { "Content-Type": "application/json" };
      let body: any = {};

      if (provider === "google") {
        apiKey = env.GEMINI_API_KEY;
        targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        body = {
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
      } else if (provider === "openrouter") {
        apiKey = env.OPENROUTER_API_KEY;
        targetUrl = "https://openrouter.ai/api/v1/chat/completions";
        headers["Authorization"] = `Bearer ${apiKey}`;
        headers["HTTP-Referer"] = "https://kings-grill-booking.pages.dev";
        headers["X-Title"] = "KING'S GRILL BOOKING APP";
        
        let msgContent: any = userPrompt;
        if (image) {
          msgContent = [
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: image } }
          ];
        }

        body = {
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

      // 5. Gửi request đến AI Provider với Timeout (20 giây)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const aiResponse = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        return new Response(JSON.stringify({ ok: false, error: `AI Provider Error: ${errText.substring(0, 150)}` }), {
          status: aiResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const resJson = await aiResponse.json() as any;
      let aiContent = "";

      if (provider === "google") {
        const parts = resJson.candidates?.[0]?.content?.parts || [];
        aiContent = parts.find((p: any) => p.text)?.text || "";
      } else {
        aiContent = resJson.choices?.[0]?.message?.content || "";
      }

      return new Response(JSON.stringify({ ok: true, content: aiContent }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (err: any) {
      return new Response(JSON.stringify({ ok: false, error: err.name === "AbortError" ? "Gateway Timeout (20s)" : err.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};
```

---

## 4. Quản lý Secret Keys & Masking trên UI

Hệ thống hỗ trợ nhập API key trực tiếp trên trang cấu hình như một tính năng BYOK chính thức. Để giảm nguy cơ key bị lộ:

### 4.1. Quy tắc Masking API Key trên UI:
- Khi hiển thị danh sách API Key trong `Settings.vue` hoặc `TestDashboard.vue`, toàn bộ chuỗi ký tự phải được che giấu, chỉ để lại 4 ký tự đầu và 4 ký tự cuối.
- Ví dụ: `AIzaSy...4F7a` hoặc `sk-or-v1-...w1eD`.
- Helper che giấu khóa:
  ```typescript
  export function maskApiKey(key: string): string {
    if (!key) return '';
    if (key.length <= 8) return '••••••••';
    return `${key.substring(0, 4)}••••••••${key.substring(key.length - 4)}`;
  }
  ```

### 4.2. Local Key Vault:

- Không dùng Base64, XOR hoặc obfuscation làm mã hóa.
- Không lưu raw key trong `localStorage`.
- Dùng IndexedDB + Web Crypto AES-GCM, IV ngẫu nhiên cho từng record.
- Hỗ trợ device-local non-extractable key và PIN/passphrase locked mode.
- Raw key chỉ được lấy từ vault ngay trước request direct và không được đưa vào reactive state.
- Tự lock vault khi logout/inactivity; migration plaintext phải verify trước khi xóa dữ liệu cũ.
- Xem thiết kế và acceptance criteria tại `docs/LOCAL_FIRST_AI_ARCHITECTURE.md`.

---

## 5. Phân quyền Người dùng & Kiểm soát Truy cập (RBAC)

Hệ thống phân biệt hai cấp độ người dùng để giới hạn quyền truy cập vào các chức năng nhạy cảm:

| Quyền hạn | Nhân viên (Operator/Staff) | Quản trị viên (Admin) |
| :--- | :---: | :---: |
| Phân tích Đặt bàn bằng AI | ✅ | ✅ |
| Xem lịch sử đặt bàn | ✅ | ✅ |
| Xem danh mục Thực đơn / Menu | ✅ | ✅ |
| Cập nhật Dữ liệu Menu | ❌ | ✅ |
| Quản lý API Keys hệ thống | ❌ | ✅ |
| Thay đổi Model AI sử dụng | ❌ | ✅ |
| Xóa dữ liệu lịch sử / logs | ❌ | ✅ |

### Triển khai Bảo vệ Route trong Vue Router:
1. Gán thuộc tính `meta.requiresAdmin` trên các route nhạy cảm (ví dụ `/settings`).
2. Triển khai Router Navigation Guard:
   ```typescript
   router.beforeEach((to, from, next) => {
     const authStore = useAuthStore(); // Chứa thông tin user role
     if (to.matched.some(record => record.meta.requiresAdmin)) {
       if (!authStore.isAdmin) {
         next({ name: 'Dashboard', query: { error: 'permission-denied' } });
         return;
       }
     }
     next();
   });
   ```

---

## 6. Quản lý Phiên làm việc & Session Timeout
Để tránh việc bỏ quên màn hình thiết bị đang đăng nhập tại nhà hàng:
- **Thời gian hết hạn phiên mặc định**: 30 phút không hoạt động (Inactivity Timeout).
- **Cơ chế phát hiện hoạt động**: Lắng nghe các sự kiện `mousemove`, `keypress`, `mousedown`, `touchstart` trên tài liệu. Mỗi khi sự kiện kích hoạt, bộ đếm thời gian sẽ được reset.
- **Khi hết hạn**:
  1. Xóa sạch thông tin đăng nhập trong Store.
  2. Xóa các token tạm thời trong bộ nhớ cache.
  3. Định tuyến người dùng về trang đăng nhập (`/login`) và hiển thị thông báo: *"Phiên làm việc đã hết hạn do lâu không hoạt động. Vui lòng đăng nhập lại."*

---

## 7. Kế hoạch Triển khai (Roadmap)

### Pha 1: Local Key Vault & Masking UI (Ngay lập tức)
- Triển khai encrypted local key vault và migration khỏi plaintext `localStorage`.
- Triển khai UI masking cho tất cả input chứa API key.
- Cấu hình transport policy `local_first` làm mặc định; không cần GAS/gateway để local key hoạt động.
- Tắt auto-sync local key lên cloud và tắt auto-download raw cloud keys.

### Pha 2: Triển khai Cloudflare Workers (Tuần 1)
- Tạo project Worker trên Cloudflare Dash, đặt tên `kg-booking-ai-gateway`.
- Cấu hình các secret keys (`wrangler secret put GEMINI_API_KEY`).
- Deploy code proxy và kiểm thử luồng gọi AI từ Postman/Client.

### Pha 3: Hoàn thiện Multi-Transport (Tuần 2)
- Hoàn thiện `local_only`, `local_first`, `gateway_first`, `gateway_only`.
- Gateway là fallback cho CORS/network hoặc chế độ quản trị tập trung, không thay thế bắt buộc local BYOK.
- Loại GAS khỏi toàn bộ AI critical path.
- Triển khai phân quyền Route `/settings` và cơ chế Session Timeout 30 phút.
- Kiểm thử tích hợp toàn diện (E2E) trên môi trường Staging.
