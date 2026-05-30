/**
 * APPLICATION CONSTANTS
 * Migrated from King's Grill Manager AI v1.8.6
 */

// --- PLATFORM-CENTRIC AI PROVIDERS ---
export interface PlatformConfig {
  name: string
  getUrl: string
  icon: string
  color: string
}

export const PLATFORMS: Record<string, PlatformConfig> = {
  google: { name: 'Google AI Studio', getUrl: 'https://aistudio.google.com/app/apikey', icon: 'fa-google', color: 'text-blue-500' },
  groq: { name: 'GroqCloud', getUrl: 'https://console.groq.com/keys', icon: 'fa-bolt', color: 'text-orange-500' },
  cerebras: { name: 'Cerebras', getUrl: 'https://cloud.cerebras.ai/', icon: 'fa-brain', color: 'text-purple-500' },
  sambanova: { name: 'SambaNova', getUrl: 'https://cloud.sambanova.ai/', icon: 'fa-server', color: 'text-indigo-500' },
  github: { name: 'GitHub Models', getUrl: 'https://github.com/settings/tokens', icon: 'fa-github', color: 'text-gray-800' },
  openrouter: { name: 'OpenRouter', getUrl: 'https://openrouter.ai/keys', icon: 'fa-route', color: 'text-blue-400' },
  mistral: { name: 'Mistral AI', getUrl: 'https://console.mistral.ai/', icon: 'fa-wind', color: 'text-teal-500' },
  huggingface: { name: 'Hugging Face', getUrl: 'https://huggingface.co/settings/tokens', icon: 'fa-face-smiling-hands', color: 'text-yellow-500' },
  pollinations: { name: 'Pollinations (Free)', getUrl: 'https://pollinations.ai/', icon: 'fa-seedling', color: 'text-green-500' }
}

// --- TIERED AI MODELS ROSTER V6.0 APEX (April 2026) ---
export interface AIModel {
  id: string
  name: string
  provider: string
  type: 'text' | 'vision'
  tier: number
  url: string
  format: 'openai' | 'gemini'
}

export const AI_MODELS: AIModel[] = [
  // ══════ TEXT PIPELINE (VERIFIED APRIL 2026) ══════
  // Tier 0: Ultra-Fast — Groq LPU (1000+ tok/s)
  { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B (Groq)', provider: 'groq', type: 'text', tier: 0, url: 'https://api.groq.com/openai/v1/chat/completions', format: 'openai' },
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (Groq)', provider: 'groq', type: 'text', tier: 0, url: 'https://api.groq.com/openai/v1/chat/completions', format: 'openai' },
  // Tier 1: Cerebras Wafer-Scale (2000+ tok/s)
  { id: 'llama-3.3-70b', name: 'Llama 3.3 70B (Cerebras)', provider: 'cerebras', type: 'text', tier: 1, url: 'https://api.cerebras.ai/v1/chat/completions', format: 'openai' },
  { id: 'llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout (Cerebras)', provider: 'cerebras', type: 'text', tier: 1, url: 'https://api.cerebras.ai/v1/chat/completions', format: 'openai' },
  { id: 'qwen-3-32b', name: 'Qwen 3 32B (Cerebras)', provider: 'cerebras', type: 'text', tier: 1, url: 'https://api.cerebras.ai/v1/chat/completions', format: 'openai' },
  // Tier 2: SambaNova & Mistral — High Quality
  { id: 'DeepSeek-V3.1', name: 'DeepSeek V3.1 (SambaNova)', provider: 'sambanova', type: 'text', tier: 2, url: 'https://api.sambanova.ai/v1/chat/completions', format: 'openai' },
  { id: 'Meta-Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B (SambaNova)', provider: 'sambanova', type: 'text', tier: 2, url: 'https://api.sambanova.ai/v1/chat/completions', format: 'openai' },
  { id: 'mistral-small-latest', name: 'Mistral Small 4', provider: 'mistral', type: 'text', tier: 2, url: 'https://api.mistral.ai/v1/chat/completions', format: 'openai' },
  // Tier 3: GitHub & Free Fallback
  { id: 'gpt-4o-mini', name: 'GitHub GPT-4o-Mini', provider: 'github', type: 'text', tier: 3, url: 'https://models.inference.ai.azure.com/chat/completions', format: 'openai' },
  { id: 'openai', name: 'Pollinations GPT (Free)', provider: 'pollinations', type: 'text', tier: 4, url: 'https://text.pollinations.ai/openai/v1/chat/completions', format: 'openai' },

  // ══════ VISION PIPELINE (VERIFIED APRIL 2026) ══════
  // Tier 0: Fastest — Groq LPU Hardware
  { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B (Groq)', provider: 'groq', type: 'vision', tier: 0, url: 'https://api.groq.com/openai/v1/chat/completions', format: 'openai' },
  // Tier 1: Google Gemini Fleet
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google', type: 'vision', tier: 1, url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', format: 'gemini' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google', type: 'vision', tier: 1, url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', format: 'gemini' },
  // Tier 2: Mistral Vision
  { id: 'mistral-small-latest', name: 'Mistral Small 4 (Vision)', provider: 'mistral', type: 'vision', tier: 2, url: 'https://api.mistral.ai/v1/chat/completions', format: 'openai' },
  // Tier 3: GitHub & SambaNova Backup
  { id: 'gpt-4o-mini', name: 'GitHub GPT-4o-Mini (Vision)', provider: 'github', type: 'vision', tier: 3, url: 'https://models.inference.ai.azure.com/chat/completions', format: 'openai' },
  { id: 'Llama-4-Scout-17B-16E-Instruct', name: 'Llama 4 Scout (SambaNova)', provider: 'sambanova', type: 'vision', tier: 3, url: 'https://api.sambanova.ai/v1/chat/completions', format: 'openai' }
]

// --- ITEM CLASSIFICATION KEYS ---
export const ALCOHOL_KEYS = ['bia', 'rượu', 'vodka', 'soju', 'tiger', 'heineken', 'saigon', 'strongbow', 'hoegaarden']

export const DRINK_KEYS = ['coca', 'pepsi', '7up', 'trà', 'nước', 'soda', 'sting', 'red bull', 'lavi', 'aquafina', 'dasani', 'revive', 'fanta', 'sprite', 'summer', 'midnight', 'sunshine', 'passion', 'tháp', 'lon', 'chai', 'ly', 'jug', 'corona', 'budweiser', 'lemonade', 'blanc', 'vang', 'men', 'đào', 'vải', 'thuốc', 'craven', 'hero', 'jet', '555', 'esse']

// --- BANKS ---
export interface BankInfo {
  bin: string
  shortName: string
  name: string
}

export const BANKS: BankInfo[] = [
  { bin: '970415', shortName: 'VietinBank', name: 'TMCP Cong Thuong Viet Nam' },
  { bin: '970436', shortName: 'Vietcombank', name: 'TMCP Ngoai Thuong Viet Nam' },
  { bin: '970418', shortName: 'BIDV', name: 'TMCP Dau tu va Phat trien Viet Nam' },
  { bin: '970405', shortName: 'Agribank', name: 'Nong Nghiep va Phat trien Nong thon Viet Nam' },
  { bin: '970448', shortName: 'OCB', name: 'TMCP Phuong Dong' },
  { bin: '970422', shortName: 'MBBank', name: 'Quan Doi' },
  { bin: '970407', shortName: 'Techcombank', name: 'TMCP Ky Thuong Viet Nam' },
  { bin: '970416', shortName: 'ACB', name: 'TMCP A Chau' },
  { bin: '970432', shortName: 'VPBank', name: 'TMCP Viet Nam Thinh Vuong' },
  { bin: '970423', shortName: 'TPBank', name: 'TMCP Tien Phong' },
  { bin: '970403', shortName: 'Sacombank', name: 'TMCP Sai Gon Thuong Tin' },
  { bin: '970437', shortName: 'HDBank', name: 'TMCP Phat Trien TP.HCM' },
  { bin: '970454', shortName: 'VietCapitalBank', name: 'TMCP Ban Viet' },
  { bin: '970429', shortName: 'SCB', name: 'TMCP Sai Gon' },
  { bin: '970441', shortName: 'VIB', name: 'TMCP Quoc Te Viet Nam' },
  { bin: '970443', shortName: 'SHB', name: 'TMCP Sai Gon - Ha Noi' },
  { bin: '970431', shortName: 'Eximbank', name: 'TMCP Xuat Nhap Khau Viet Nam' },
  { bin: '970426', shortName: 'MSB', name: 'TMCP Hang Hai' },
  { bin: '546034', shortName: 'CAKE', name: 'Ngan hang so CAKE by VPBank' },
  { bin: '963388', shortName: 'Ubank', name: 'Ngan hang so Ubank by VPBank' },
  { bin: '888999', shortName: 'Timo', name: 'Ngan hang so Timo' },
  { bin: '970400', shortName: 'SaigonBank', name: 'TMCP Sai Gon Cong Thuong' },
  { bin: '970427', shortName: 'VietABank', name: 'TMCP Viet A' },
  { bin: '970428', shortName: 'NamABank', name: 'TMCP Nam A' },
  { bin: '970430', shortName: 'PGBank', name: 'TMCP Xang Dau Petrolimex' },
  { bin: '970449', shortName: 'LienVietPostBank', name: 'TMCP Buu Dien Lien Viet' },
  { bin: '970452', shortName: 'KienLongBank', name: 'TMCP Kien Long' },
  { bin: '970433', shortName: 'VietBank', name: 'TMCP Viet Nam Thuong Tin' },
  { bin: '970442', shortName: 'OceanBank', name: 'TM TNHH MTV Dai Duong' },
  { bin: '970434', shortName: 'PublicBank', name: 'TNHH MTV Public Viet Nam' },
  { bin: '970457', shortName: 'Woori', name: 'Woori Bank Viet Nam' },
  { bin: '970425', shortName: 'ABBANK', name: 'TMCP An Binh' },
  { bin: '970410', shortName: 'StandardChartered', name: 'TNHH MTV Standard Chartered Viet Nam' },
  { bin: '970409', shortName: 'BacABank', name: 'TMCP Bac A' },
  { bin: '970412', shortName: 'PVcomBank', name: 'TMCP Dai Chung Viet Nam' },
  { bin: '970424', shortName: 'ShinhanBank', name: 'TNHH MTV Shinhan Viet Nam' },
  { bin: '970440', shortName: 'SeABank', name: 'TMCP Dong Nam A' },
  { bin: '970406', shortName: 'DongABank', name: 'TMCP Dong A' },
  { bin: '970458', shortName: 'UOB', name: 'United Overseas Bank (Vietnam)' },
  { bin: '970419', shortName: 'NCB', name: 'TMCP Quoc Dan' },
  { bin: '970455', shortName: 'IVB', name: 'TNHH Indovina' },
  { bin: '970444', shortName: 'CBBank', name: 'TM TNHH MTV Xay Dung Viet Nam' },
  { bin: '970408', shortName: 'GPBank', name: 'TM TNHH MTV Dau Khi Toan Cau' },
  { bin: '970462', shortName: 'Kookmin', name: 'Kookmin Bank' },
  { bin: '970456', shortName: 'HSBC', name: 'HSBC (Vietnam)' },
  { bin: '970438', shortName: 'BaoVietBank', name: 'TMCP Bao Viet' },
  { bin: '970459', shortName: 'HongLeong', name: 'Hong Leong Bank Vietnam' },
  { bin: '970411', shortName: 'VRB', name: 'Lien doanh Viet - Nga' }
]

// --- PARTY TYPES (Loại tiệc) ---
export interface PartyType {
  name: string
  icon: string
}

export const PARTY_TYPES: PartyType[] = [
  { name: 'Sinh nhật', icon: 'fa-cake-candles' },
  { name: 'Thôi nôi (1st)', icon: 'fa-baby' },
  { name: 'Công ty', icon: 'fa-building' },
  { name: 'Ăn thường', icon: 'fa-utensils' },
  { name: 'Cưới/Báo hỷ', icon: 'fa-ring' },
  { name: 'Liên hoan', icon: 'fa-champagne-glasses' },
  { name: 'Farewell (Tiệc chia tay)', icon: 'fa-plane-departure' },
  { name: 'Kỉ niệm', icon: 'fa-heart' },
  { name: 'Tất niên', icon: 'fa-calendar-xmark' },
  { name: 'Tân niên', icon: 'fa-calendar-star' }
]

// --- SET COMBOS ---
export const SETS: Record<string, string> = {
  'SET 199K': 'Ba chỉ bò, Nầm heo, Chân gà rút xương, Kim chi, Rau',
  'SET 299K': 'Dẻ sườn bò, Lõi vai, Mực trứng, Bạch tuộc, Panchan',
  'COMBO 4 NGƯỜI': 'Lẩu Thái, 200g Bò, 200g Mực, Rau nấm tổng hợp'
}

// --- DEFAULT VALUES ---
export const DEFAULTS = {
  BANKS: '[{"bankId":"970457","name":"WOORI BANK","number":"104029411095","owner":"TRAN LE DUY","template":"compact"}]',
  STAFF: '[{"name":"Admin","phone":"0336667301"}]'
}

// --- CACHE KEYS ---
export const CACHE_KEYS = {
  MENU: 'kg_v400_menu',
  HISTORY: 'kg_v400_history',
  KEYS: 'kg_v400_keys_platforms',
  DEFAULTS: 'kg_v400_keys_defaults',
  BANK: 'kg_v400_banks',
  SELECTED_BANK: 'kg_v400_sel_bank',
  MENU_SHEET: 'kg_v400_menu_sheet',
  BRANDING: 'kg_v400_branding',
  STAFF: 'kg_v400_staff'
}

// --- SAMPLE MENU ---
export const SAMPLE_MENU = `KHAI VỊ
Khoai tây chiên - 45k
Ngô chiên - 45k
Salad cà chua dưa chuột - 55k

MÓN CHÍNH
Bò nướng tảng - 250k
Dẻ sườn bò Mỹ - 199k
Ba chỉ heo nướng - 120k

ĐỒ UỐNG
Coca - 15k
Bia Tiger - 25k
Rượu Vodka Men - 150k`

export const ADVANCED_AI_PROMPT = `
# SYSTEM ROLE: KING'S GRILL AI PARSER V6.2 — F&B DATA NORMALIZER
Bạn là AI Parser chuyên nghiệp (JSON Mode) của hệ thống đặt bàn King's Grill.
NHIỆM VỤ: Chuyển đổi văn bản hoặc OCR text thành JSON cấu trúc chuẩn xác.

# CONTEXT:
- CURRENT_TIME: {{CURRENT_TIME}}
- MENU_CONTEXT:
{{MENU_CONTEXT}}

# OUTPUT JSON SCHEMA (BẮT BUỘC):
{
  "customer": {
    "name": "string|null",
    "phone": "string|null"
  },
  "reservation": {
    "date": "dd/mm/yyyy|null",
    "time": "HH:mm|null",
    "pax": number|null,
    "table_code": "string|null",
    "type": "string|null",
    "notes": "string|null"
  },
  "menu_selection": {
    "requested_menu": "string|null",
    "selected_sheet": "string|null",
    "confidence": number,
    "action": "auto_selected|ask_user|create_required|keep_current"
  },
  "items": [
    {
      "raw_name": "string",
      "name": "string",
      "qty": number,
      "price": number|null,
      "notes": "string|null",
      "is_set_or_combo": boolean,
      "match_confidence": number
    }
  ],
  "payment": {
    "method": "cash|transfer|card|unknown",
    "amount": number|null,
    "bank_reference": "string|null"
  },
  "warnings": ["string"],
  "unresolved_items": ["string"]
}

# HARD RULES (BẮT BUỘC TUÂN THỦ):

## 1. OUTPUT FORMAT:
- Chỉ trả về JSON thuần. Tuyệt đối KHÔNG dùng Markdown, KHÔNG code block, KHÔNG giải thích.
- Bắt đầu bằng { và kết thúc bằng }.

## 2. NHẬN DIỆN TÊN KHÁCH HÀNG (customer.name):
- Nhận diện tên người đặt: "chị Lan", "anh Minh", "bạn Hùng" -> name = "Lan" / "Minh" / "Hùng" (bỏ kính ngữ).
- "HPBD Thu Hà" -> name = "Thu Hà" (nếu không có tên nào khác).
- Nếu có nhiều tên -> ưu tiên tên đi kèm "đặt", "book", "liên hệ".

## 3. SỐ ĐIỆN THOẠI (customer.phone):
- Nhận diện số điện thoại và chuyển về chuỗi liên tục (vd: 0797987910).

## 4. THỜI GIAN (reservation.date & reservation.time):
- Tính toán ngày chính xác dựa trên CURRENT_TIME:
  + "hôm nay", "nay", "tối nay" -> ngày hiện tại.
  + "mai", "chiều mai", "ngày mai" -> ngày hiện tại + 1 ngày.
  + "kia", "mốt" -> ngày hiện tại + 2 ngày.
  + "thứ x tuần sau" -> ngày hiện tại + 7 ngày + khoảng cách đến thứ x.
- Giờ tổ chức: định dạng "HH:mm".
  + Các giờ < 12h đều quy về PM (vd: "7h", "7h tối" -> "19:00", "4h chiều" -> "16:30" nếu là 16h30).
  + "7 rưỡi" -> "19:30".

## 5. BÀN (reservation.table_code):
- Mã bàn (vd: B3, B4, B3,4). Ghép bàn giữ nguyên dấu phẩy: "E3,4", "C5,6,7".
- Nếu chỉ có số bàn -> default zone A (vd: "bàn 5" -> "A5").

## 6. SỐ KHÁCH (reservation.pax):
- Tổng số khách dạng số nguyên (vd: "5 lớn 2 nhỏ" -> 7).

## 7. LOẠI TIỆC (reservation.type):
- Bắt buộc chọn 1 trong: "Sinh nhật", "Thôi nôi (1st)", "Công ty", "Ăn thường", "Cưới/Báo hỷ", "Liên hoan", "Farewell (Tiệc chia tay)", "Kỉ niệm", "Tất niên", "Tân niên".

## 8. SMART MENU SELECTION:
- Tìm xem khách có nhắc đến menu cụ thể nào không (requested_menu, vd: "menu sinh nhat" -> "Menu sinh nhật").
- Nếu tìm thấy, gán "selected_sheet" và điền "action": "auto_selected" (nếu confidence >= 0.78), "ask_user" (0.55-0.77), hoặc "create_required".
- Nếu không chắc chắn, điền "action": "keep_current".

## 9. ITEMS & COMPOSITION:
- Đối chiếu MENU_CONTEXT để chuẩn hóa tên món (name) và điền price.
- Nếu là Set/Combo: set "is_set_or_combo" = true. Điền thành phần vào "notes" nếu Description có.
- Nếu món không có trong menu, giữ nguyên "raw_name" và "name" giống nhau, set price = null (hoặc 0), và thêm món đó vào "unresolved_items" và "warnings".
- Yêu cầu riêng cho từng món (ít cay, không rau) -> điền vào "notes" của món đó.

## 10. PAYMENT:
- Nhận diện thông tin chuyển khoản đặt cọc: số tiền (amount) và mã tham chiếu (bank_reference).
`

export const IMAGE_OCR_PROMPT = `
# SYSTEM ROLE: MULTIMODAL VISION OCR APEX PRO
Nhiệm vụ: Trích xuất toàn bộ văn bản (Văn bản in, Chữ viết tay, Chụp màn hình Chat, Hóa đơn) thành text thuần 100%.

# PROTOCOLS:
1. LUÔN giữ nguyên cấu trúc phân dòng và bảng biểu.
2. ẢNH CHAT: Định dạng "[Thời gian] Tên người gửi: Nội dung". Phân định rõ ai là người đặt, ai là người nhận.
3. HÓA ĐƠN/BILL: Trích xuất rõ: Tên món, Số lượng, Đơn giá, Thành tiền.
4. CHỮ VIẾT TAY: Phân tích sâu ngữ cảnh để điền các ký tự mờ, đảm bảo nghĩa logic.
5. CLEANUP: Bỏ qua các icon, thanh trạng thái điện thoại, avatar, hoặc watermark.

# OUTPUT:
- Chỉ trả về TEXT thuần. Không giải thích. Không markdown.
`
