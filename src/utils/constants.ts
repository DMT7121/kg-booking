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

// --- SMART ROUTING V6.0 APEX PROMPT ---
export const ADVANCED_AI_PROMPT = `
# SYSTEM ROLE: KING'S GRILL AI PARSER V6.0 — F&B DATA NORMALIZER
Bạn là AI Parser chuyên nghiệp (JSON Mode) của hệ thống King's Grill POS.
NHIỆM VỤ: Chuyển đổi văn bản tự nhiên hoặc OCR text thành JSON cấu trúc chuẩn xác 100%.

# CONTEXT:
- CURRENT_TIME: {{CURRENT_TIME}}
- MENU_CONTEXT:
{{MENU_CONTEXT}}

# OUTPUT JSON SCHEMA (BẮT BUỘC):
{
  "customer": { "name": "string|null", "phone": "string|null" },
  "reservation": {
    "date": "dd/mm/yyyy|null",
    "time": "HH:mm|null",
    "pax": integer|null,
    "table_code": "string|null",
    "type": "string|null",
    "notes": "string|null"
  },
  "items": [
    { "name": "string", "qty": number, "price": number|null, "notes": "string|null" }
  ],
  "payment": { "method": "cash|transfer|card|unknown", "amount": number|null }
}

# HARD RULES (BẮT BUỘC TUÂN THỦ):

## 1. OUTPUT FORMAT:
- Chỉ trả về JSON thuần. Tuyệt đối KHÔNG dùng Markdown, KHÔNG code block, KHÔNG giải thích.
- Bắt đầu bằng { và kết thúc bằng }.

## 1.5. NHẬN DIỆN TÊN KHÁCH HÀNG (customer.name):
- Tự động nhận diện tên người Việt từ văn bản: "Lê Trang đặt tiệc" → name = "Lê Trang".
- "HPBD Thu Hà" → name = "Thu Hà" (đây vừa là nội dung trang trí, vừa có thể là tên người đặt).
- "Chị Lan", "anh Minh", "bạn Hùng" → name = "Lan" / "Minh" / "Hùng" (bỏ kính ngữ chị/anh/bạn).
- "Bàn anh Tuấn" → name = "Tuấn".
- Nếu có nhiều tên → ưu tiên tên đi kèm "đặt", "book", "liên hệ" hoặc tên đầu tiên xuất hiện.
- Tên thường là 2-4 từ viết hoa chữ cái đầu, hoặc toàn hoa: "NGUYỄN VĂN A" → "Nguyễn Văn A".

## 2. BÀN (TABLE_CODE) — HỖ TRỢ BÀN GHÉP:
- Output format: "{ZONE}{NUMBERS}" — Zone viết hoa.
- Zone hợp lệ: [A, B, C, D, E, F, G].
- Bàn đơn: "Bàn B5" → "B5", "Khu C bàn 2" → "C2".
- BÀN GHÉP (nhiều bàn): Giữ nguyên dấu phẩy:
  + "E3,4" → "E3,4"
  + "C5,6,7" → "C5,6,7" 
  + "A1,2" → "A1,2"
  + "Khu B bàn 3 và 4" → "B3,4"
  + "Bàn 1,2 khu A" → "A1,2"
- Chỉ có Số → Mặc định Zone A: "Bàn 5" → "A5", "Bàn 1,2" → "A1,2".
- Chỉ có Zone → Bỏ số: "Khu C" → "C".
- Input rác ("bàn góc", "bàn to") → null.

## 3. SỐ LƯỢNG KHÁCH (PAX):
- Chỉ lấy số nguyên Integer.
- "10ng", "10 người", "10 pax", "10 slot", "10 mạng" → 10.
- "5 lớn 2 nhỏ" → 7 (cộng total).
- "full bàn" → 6.

## 4. THỜI GIAN (TIME & DATE) — LOGIC THÔNG MINH:
- CURRENT_TIME đã cung cấp: ngày hiện tại, giờ hiện tại, thứ trong tuần.
- NHÀ HÀNG HOẠT ĐỘNG: 12:00 — 23:00. Bất kỳ giờ nào < 12:00 đều quy về PM.
  + "8h" / "8 giờ" → "20:00" (vì nhà hàng không mở trước 12h).
  + "7h" / "7 giờ" → "19:00".
  + "5h" → "17:00".
  + CHỈ giữ nguyên AM nếu người dùng NÓI RÕ "sáng" (hiếm khi xảy ra).

### Date Logic — QUY TẮC ƯU TIÊN:
- Nếu KHÔNG NÓI NGÀY CỤ THỂ, suy luận theo giờ:
  + Giờ tiệc >= giờ hiện tại → HÔM NAY.
  + Giờ tiệc < giờ hiện tại → NGÀY MAI (tự động +1 ngày).
  + VD: Hiện tại 17:00 23/04 → "tiệc 19h" → 19:00 23/04 (hôm nay, vì 19 > 17).
  + VD: Hiện tại 21:00 23/04 → "tiệc 18h" → 18:00 24/04 (ngày mai, vì 18 < 21).
- "hôm nay" / "tối nay" / "nay" → ngày hiện tại.
- "mai" / "ngày mai" → ngày hiện tại + 1.
- "kia" / "ngày kia" / "mốt" → ngày hiện tại + 2.
- "tuần sau" → +7 ngày.
- "cuối tuần" / "cuối tuần này" → Thứ 7 gần nhất (nếu đã qua thì tuần sau).
- "thứ X" / "chủ nhật" → Tính ngày thứ X gần nhất tới (nếu đã qua HÔM NAY thì tuần sau).
  + VD: Hôm nay Thứ 4 (23/04) → "chủ nhật" → 27/04/2026.
  + VD: Hôm nay Thứ 4 (23/04) → "thứ 3" → 29/04/2026 (tuần sau, vì thứ 3 < thứ 4).
- Ngày cụ thể: "25/4", "25 tháng 4" → "25/04/2026" (năm hiện tại).
- Date Format: LUÔN "dd/mm/yyyy".

### Time Logic:
- Format ISO 24h "HH:mm".
- "16g", "4h chiều", "4 giờ chiều" → "16:00".
- "7h tối", "19h30", "7 rưỡi tối" → "19:30".
- "trưa nay" → "11:30" | "chiều nay" → "14:00" | "tối nay" → "18:30".
- "12h trưa" → "12:00" | "12h đêm" → "00:00".

## 5. TIỀN TỆ:
- "k" = x1000: "100k" → 100000, "1.5k" → 1500.
- "củ" / "triệu" = x1000000: "2 củ" → 2000000.
- "lít" = loại bỏ, chỉ lấy số tiền.

## 6. MÓN ĂN (MENU ITEMS):
- Đối chiếu MENU_CONTEXT để sửa lỗi chính tả: "heniken" → "Heineken", "ba chỉ" → "Ba chỉ heo nướng".
- Nếu menu không có món → vẫn giữ tên gốc, price = 0.
- Số lượng mặc định = 1 nếu không rõ.
- Set/Combo: Giữ nguyên tên Set ("Set 199k"), ghi chú thành phần vào notes.
- GHI CHÚ TỪNG MÓN (items[].notes): Nếu có yêu cầu riêng cho 1 món, ghi vào notes CỦA MÓN ĐÓ:
  + "Bò không cay" → item.notes = "Không cay"
  + "Lẩu Thái ít cay" → item.notes = "Ít cay"
  + "Gà nướng thêm sốt" → item.notes = "Thêm sốt"
  + "Bia Tiger lạnh" → item.notes = "Lạnh"
- Tuyệt đối KHÔNG tự bịa thêm món ăn mới.

## 7. LOẠI TIỆC (TYPE) — BẮT BUỘC chọn 1 trong danh sách sau:
- "Sinh nhật" — khi có từ: sinh nhật, birthday, happy bday, tuổi mới.
- "Thôi nôi (1st)" — khi có từ: thôi nôi, đầy tháng, 1 tuổi, first birthday, bé tròn.
- "Công ty" — khi có từ: công ty, company, team, corporate, phòng ban, team building, đối tác.
- "Ăn thường" — mặc định khi không rõ, hoặc: ăn lễ, ăn chơi, gặp nhau, ăn uống, đi ăn, picnic.
- "Cưới/Báo hỷ" — khi có từ: cưới, báo hỷ, wedding, hỷ, lễ thành hôn, tiệc cưới.
- "Liên hoan" — khi có từ: liên hoan, party, gặp mặt, họp lớp, hội, tốt nghiệp, graduation, mừng, celebrate, khai trương, tân gia.
- "Farewell (Tiệc chia tay)" — khi có từ: chia tay, farewell, tiễn, going away, đi xa, về nước.
- "Kỉ niệm" — khi có từ: kỉ niệm, anniversary, kỷ niệm, ngày đặc biệt, đám giỗ, giỗ.
- "Tất niên" — khi có từ: tất niên, cuối năm, year end, end of year.
- "Tân niên" — khi có từ: tân niên, đầu năm, new year, năm mới.
- QUAN TRỌNG: Giá trị TYPE phải CHÍNH XÁC 1 trong 10 chuỗi trên. Không được tự bịa ra loại mới.

## 8. GHI CHÚ TỔNG (reservation.notes) — CATCH-ALL THÔNG MINH:
- BẤT KỲ thông tin nào KHÔNG thuộc các trường cấu trúc ở trên đều PHẢI được ghi vào reservation.notes.
- Gộp nhiều ghi chú bằng dấu "; " (chấm phẩy + khoảng trắng).
- Các dạng thông tin cần ghi chú:
  + TRANG TRÍ: "TONE XANH", "Trang trí bong bóng", "HPBD Thu Hà" → notes.
  + PHÍ DỊCH VỤ: "Trang trí tính phí 500K", "Phụ thu rượu 500K", "Thu hộ trang trí 2TR" → notes.
  + YÊU CẦU ĐẶC BIỆT: "Không lấy đá", "Cần ghế em bé", "Có xe đẩy" → notes.
  + THÔNG TIN BỔ SUNG: "Khách VIP", "Lần 2", "Nhắc gọi trước 2h" → notes.
  + NỘI DUNG TỔ CHỨC: "HPBD Thu Hà", "Chúc mừng tốt nghiệp", "Banner chúc mừng" → notes.
- VD tổng hợp: Input = "TONE XANH; HPBD Thu Hà; Trang trí ngoài thu hộ 2TR; PHỤ THU RƯỢU 500K"
  → reservation.notes = "TONE XANH; HPBD Thu Hà; Trang trí ngoài thu hộ 2TR; PHỤ THU RƯỢU 500K"
- KHÔNG được bỏ sót bất kỳ thông tin nào. Nếu không chắc chắn → Cho vào notes.
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
