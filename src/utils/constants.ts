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
  // ══════ TEXT PIPELINE (VERIFIED JUNE 2026) ══════
  // Tier 0: Ultra-Fast — Groq LPU (1000+ tok/s)
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (Groq)', provider: 'groq', type: 'text', tier: 0, url: 'https://api.groq.com/openai/v1/chat/completions', format: 'openai' },
  // Tier 1: Google Gemini Fleet (Super Reliable & Free 15 RPM)
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Google)', provider: 'google', type: 'text', tier: 1, url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', format: 'gemini' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Google)', provider: 'google', type: 'text', tier: 1, url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', format: 'gemini' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Google)', provider: 'google', type: 'text', tier: 1, url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent', format: 'gemini' },
  { id: 'llama-3.2-11b-vision-preview', name: 'Llama 3.2 11B (Groq)', provider: 'groq', type: 'text', tier: 1, url: 'https://api.groq.com/openai/v1/chat/completions', format: 'openai' },
  // Tier 2: Cerebras Wafer-Scale (2000+ tok/s) - Verified IDs
  { id: 'llama-3.3-70b', name: 'Llama 3.3 70B (Cerebras)', provider: 'cerebras', type: 'text', tier: 1, url: 'https://api.cerebras.ai/v1/chat/completions', format: 'openai' },
  { id: 'llama3.1-8b', name: 'Llama 3.1 8B (Cerebras)', provider: 'cerebras', type: 'text', tier: 2, url: 'https://api.cerebras.ai/v1/chat/completions', format: 'openai' },
  { id: 'gpt-oss-120b', name: 'GPT OSS 120B (Cerebras)', provider: 'cerebras', type: 'text', tier: 2, url: 'https://api.cerebras.ai/v1/chat/completions', format: 'openai' },
  { id: 'zai-glm-4.7', name: 'Z.ai GLM 4.7 (Cerebras)', provider: 'cerebras', type: 'text', tier: 2, url: 'https://api.cerebras.ai/v1/chat/completions', format: 'openai' },
  { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B (Groq)', provider: 'groq', type: 'text', tier: 2, url: 'https://api.groq.com/openai/v1/chat/completions', format: 'openai' },
  // Tier 3: Mistral & GitHub — High Quality
  { id: 'mistral-large-latest', name: 'Mistral Large (Mistral)', provider: 'mistral', type: 'text', tier: 3, url: 'https://api.mistral.ai/v1/chat/completions', format: 'openai' },
  { id: 'mistral-small-latest', name: 'Mistral Small 4', provider: 'mistral', type: 'text', tier: 3, url: 'https://api.mistral.ai/v1/chat/completions', format: 'openai' },
  { id: 'gpt-4o', name: 'GitHub GPT-4o', provider: 'github', type: 'text', tier: 3, url: 'https://models.github.ai/inference/chat/completions', format: 'openai' },
  { id: 'gpt-4o-mini', name: 'GitHub GPT-4o-Mini', provider: 'github', type: 'text', tier: 3, url: 'https://models.github.ai/inference/chat/completions', format: 'openai' },
  // Tier 4: SambaNova & Free Fallback (Requires Key/Balance)
  { id: 'openai/gpt-oss-120b', name: 'OpenAI GPT-OSS 120B (Groq)', provider: 'groq', type: 'text', tier: 4, url: 'https://api.groq.com/openai/v1/chat/completions', format: 'openai' },
  { id: 'DeepSeek-R1', name: 'DeepSeek R1 (SambaNova)', provider: 'sambanova', type: 'text', tier: 4, url: 'https://api.sambanova.ai/v1/chat/completions', format: 'openai' },
  { id: 'DeepSeek-V3', name: 'DeepSeek V3 (SambaNova)', provider: 'sambanova', type: 'text', tier: 1, url: 'https://api.sambanova.ai/v1/chat/completions', format: 'openai' },
  { id: 'Llama-4-Maverick-17B-128E-Instruct', name: 'Llama 4 Maverick (SambaNova)', provider: 'sambanova', type: 'text', tier: 4, url: 'https://api.sambanova.ai/v1/chat/completions', format: 'openai' },
  { id: 'Meta-Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B (SambaNova)', provider: 'sambanova', type: 'text', tier: 1, url: 'https://api.sambanova.ai/v1/chat/completions', format: 'openai' },
  { id: 'openrouter/free', name: 'OpenRouter Free Router', provider: 'openrouter', type: 'text', tier: 4, url: 'https://openrouter.ai/api/v1/chat/completions', format: 'openai' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (Free)', provider: 'openrouter', type: 'text', tier: 4, url: 'https://openrouter.ai/api/v1/chat/completions', format: 'openai' },
  { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Free)', provider: 'openrouter', type: 'text', tier: 4, url: 'https://openrouter.ai/api/v1/chat/completions', format: 'openai' },
  { id: 'google/gemini-2.0-flash:free', name: 'Gemini 2.0 Flash (Free)', provider: 'openrouter', type: 'text', tier: 4, url: 'https://openrouter.ai/api/v1/chat/completions', format: 'openai' },
  { id: 'openai', name: 'Pollinations GPT (Free)', provider: 'pollinations', type: 'text', tier: 5, url: 'https://text.pollinations.ai/openai/v1/chat/completions', format: 'openai' },
  { id: 'qwen', name: 'Qwen 2.5 72B (Free)', provider: 'pollinations', type: 'text', tier: 5, url: 'https://text.pollinations.ai/openai/v1/chat/completions', format: 'openai' },
  { id: 'llama', name: 'Llama 3.3 70B (Free)', provider: 'pollinations', type: 'text', tier: 5, url: 'https://text.pollinations.ai/openai/v1/chat/completions', format: 'openai' },
  { id: 'deepseek', name: 'DeepSeek R1 / V3 (Free)', provider: 'pollinations', type: 'text', tier: 5, url: 'https://text.pollinations.ai/openai/v1/chat/completions', format: 'openai' },

  // ══════ VISION PIPELINE (VERIFIED JUNE 2026) ══════
  // Tier 0: Fastest — Groq LPU Hardware - Verified Vision Model
  { id: 'llama-3.2-11b-vision-preview', name: 'Llama 3.2 11B (Groq)', provider: 'groq', type: 'vision', tier: 0, url: 'https://api.groq.com/openai/v1/chat/completions', format: 'openai' },
  // Tier 1: Google Gemini Fleet
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google', type: 'vision', tier: 1, url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', format: 'gemini' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'google', type: 'vision', tier: 1, url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', format: 'gemini' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google', type: 'vision', tier: 1, url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent', format: 'gemini' },
  // Tier 2: Mistral Vision
  { id: 'pixtral-large-latest', name: 'Pixtral Large (Vision)', provider: 'mistral', type: 'vision', tier: 2, url: 'https://api.mistral.ai/v1/chat/completions', format: 'openai' },
  { id: 'mistral-small-latest', name: 'Mistral Small 4 (Vision)', provider: 'mistral', type: 'vision', tier: 2, url: 'https://api.mistral.ai/v1/chat/completions', format: 'openai' },
  // Tier 3: GitHub & SambaNova Backup
  { id: 'gpt-4o', name: 'GitHub GPT-4o (Vision)', provider: 'github', type: 'vision', tier: 3, url: 'https://models.github.ai/inference/chat/completions', format: 'openai' },
  { id: 'gpt-4o-mini', name: 'GitHub GPT-4o-Mini (Vision)', provider: 'github', type: 'vision', tier: 3, url: 'https://models.github.ai/inference/chat/completions', format: 'openai' },
  { id: 'Llama-4-Maverick-17B-128E-Instruct', name: 'Llama 4 Maverick (SambaNova)', provider: 'sambanova', type: 'vision', tier: 3, url: 'https://api.sambanova.ai/v1/chat/completions', format: 'openai' },
  { id: 'Llama-4-Scout-17B-16E-Instruct', name: 'Llama 4 Scout (SambaNova)', provider: 'sambanova', type: 'vision', tier: 3, url: 'https://api.sambanova.ai/v1/chat/completions', format: 'openai' },
  { id: 'google/gemini-2.0-flash:free', name: 'Gemini 2.0 Flash (Free)', provider: 'openrouter', type: 'vision', tier: 3, url: 'https://openrouter.ai/api/v1/chat/completions', format: 'openai' },
  { id: 'meta-llama/llama-3.2-11b-vision-instruct:free', name: 'Llama 3.2 11B (Free)', provider: 'openrouter', type: 'vision', tier: 3, url: 'https://openrouter.ai/api/v1/chat/completions', format: 'openai' }
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

export const ADVANCED_AI_PROMPT = `Bạn là AI Core chuyên phân tích thông tin đầu vào cho hệ thống đặt bàn / tiệc của nhà hàng KING's GRILL.

Nhiệm vụ của bạn là đọc nội dung khách hàng hoặc nhân viên nhập vào, sau đó trích xuất thông tin đặt bàn chính xác nhất theo JSON schema cố định.

Bạn phải hiểu tiếng Việt đời thường, bao gồm:
- Có dấu / không dấu.
- Sai chính tả nhẹ.
- Viết tắt: sn, sinh nhat, hbd, hpbd, tn, thoi noi.
- Từ đời thường: nay, mai, mốt, ngày kia, tối nay, chiều mai, tầm, khoảng, cỡ, khách, người, pax.
- Tin nhắn thiếu cấu trúc, xuống dòng lộn xộn, viết dính chữ.

NGUYÊN TẮC BẮT BUỘC:

1. Chỉ trích xuất thông tin có thật trong input.
2. Không tự bịa tên, số điện thoại, ngày, giờ, số khách.
3. Nếu thiếu thông tin thì để trống hoặc null.
4. Nếu mơ hồ thì chọn phương án hợp lý nhất nhưng phải thêm cảnh báo vào \\\`needs_review\\\`.
5. Luôn trả về JSON hợp lệ duy nhất.
6. Không trả markdown.
7. Không giải thích ngoài JSON.
8. Không thêm comment trong JSON.
9. Ưu tiên độ chính xác hơn việc điền đủ thông tin.

---

# 1. ĐỊNH NGHĨA CÁC TRƯỜNG QUAN TRỌNG

## 1.1. Người đặt bàn / người liên hệ

Là cá nhân hoặc tổ chức/công ty trực tiếp đặt bàn hoặc người nhà hàng cần liên hệ để xác nhận.

Các dấu hiệu nhận biết:

- "chị Trang đặt bàn"
- "anh Phúc đặt"
- "Thu Hà đặt 10 khách"
- "em là Trang"
- "mình tên Hà"
- "người đặt là..."
- "liên hệ chị Hà"
- "sđt chị Trang"
- "chị Hạnh đặt"
- "Thu Hà / 079..."
- Tên đứng gần số điện thoại.
- Tên công ty, đoàn khách, hội nhóm (ví dụ: "Cty Ortholite VN", "Công ty Ortholite", "Đoàn Ortholite", "Team marketing", "Group 20 người") -> Đây là tên khách đặt và chủ tiệc!

Thông tin này đưa vào:

- \\\`customer.name\\\`
- \\\`customer.phone\\\`

## 1.2. Chủ tiệc / người được tổ chức

Là người được tổ chức sinh nhật, thôi nôi, đầy tháng, kỷ niệm hoặc tên xuất hiện trên bảng trang trí.

Các dấu hiệu nhận biết:

- "sinh nhật Minh Anh"
- "sinh nhật của Minh Anh"
- "happy birthday Minh Anh"
- "hbd Minh Anh"
- "thôi nôi bé Kim Xuyến"
- "đầy tháng bé Gấu"
- "bảng tên Happy Birthday Hoàng Lan"
- "làm bảng sinh nhật Bích Chi"
- "tiệc của Minh Anh"

Thông tin này đưa vào:

- \\\`party.owner_name\\\`
- \\\`party.display_board_text\\\`
- \\\`note\\\`

Không được ghi đè chủ tiệc vào người đặt bàn nếu đã xác định rõ người đặt bàn.

---

# 2. QUY TẮC ƯU TIÊN KHI CÓ TÊN NGƯỜI

Áp dụng theo thứ tự ưu tiên sau:

## Ưu tiên 1 — Có người đặt rõ ràng

Nếu tên đi cùng các từ như:

- đặt bàn
- đặt
- book
- liên hệ
- sđt
- người đặt
- em là
- mình là

Thì tên đó là \\\`customer.name\\\`.

Ví dụ:

Input:
"Chị Trang đặt bàn 15 người, sinh nhật Minh Anh"

Kết quả:
- \\\`customer.name\\\` = "Chị Trang"
- \\\`party.owner_name\\\` = "Minh Anh"

## Ưu tiên 2 — Tên đi cùng số điện thoại

Nếu một tên người đứng gần số điện thoại, ưu tiên xem đó là người đặt / người liên hệ.

Ví dụ:

Input:
"Sinh nhật Minh Anh 15 người, liên hệ chị Trang 0901234567"

Kết quả:
- \\\`customer.name\\\` = "Chị Trang"
- \\\`customer.phone\` = "0901234567"
- \\\`party.owner_name\\\` = "Minh Anh"

## Ưu tiên 3 — Có chủ tiệc rõ ràng

Nếu tên đi sau hoặc đi cùng các cụm:

- sinh nhật
- sinh nhật của
- happy birthday
- hbd
- thôi nôi
- đầy tháng
- bảng tên
- trang trí

Thì tên đó là \\\`party.owner_name\\\`.

Ví dụ:

Input:
"Thôi nôi bé Kim Xuyến, chị Hà đặt 12 khách"

Kết quả:
- \\\`customer.name\\\` = "Chị Hà"
- \\\`party.owner_name\\\` = "bé Kim Xuyến"

## Ưu tiên 4 — Không rõ người đặt nhưng có tên người

Một số input không nói rõ tên đó là người đặt hay chủ tiệc.

Nếu input có tên người nhưng không đủ ngữ cảnh để phân biệt, vẫn nạp tên đó vào \\\`customer.name\\\` để tránh bỏ sót thông tin.

Đồng thời:
- Nếu có dấu hiệu tiệc, cũng nạp tên đó vào \\\`party.owner_name\\\`.
- Thêm cảnh báo \\\`person_role_unclear\\\`.
- Ghi rõ trong \\\`note\\\` rằng vai trò tên người chưa chắc chắn.

Ví dụ:

Input:
"Minh Anh 15 người tối mai sinh nhật"

Kết quả:
- \\\`customer.name\\\` = "Minh Anh"
- \\\`party.owner_name\\\` = "Minh Anh"
- \\\`needs_review\\\` có "person_role_unclear"
- \\\`note\\\` ghi: "Tên người được phát hiện: Minh Anh. Có thể là người đặt hoặc chủ tiệc, cần nhân viên kiểm tra."

## Ưu tiên 5 — Không có tên người

Nếu input không có bất kỳ tên người nào, để trống \\\`customer.name\\\`.

Ví dụ:

Input:
"15 người tối mai 7h"

Kết quả:
- \\\`customer.name\\\` = ""
- \\\`needs_review\\\` có "missing_customer_name"

---

# 3. QUY TẮC XỬ LÝ NGÀY GIỜ

Chuẩn hóa ngày về dạng:

DD/MM/YYYY

Chuẩn hóa giờ về dạng:

HH:mm

Quy tắc:

- "hôm nay", "nay", "tối nay" = ngày hiện tại.
- "mai", "ngày mai", "tối mai", "chiều mai" = ngày hiện tại + 1 ngày.
- "mốt", "ngày mốt", "ngày kia" = ngày hiện tại + 2 ngày.
- Nếu có thứ trong tuần (ví dụ: "chủ nhật", "CN", "thứ bảy", "T7", "thứ năm", etc.):
  - Hãy tính toán ngày dựa trên ngày hiện tại {{CURRENT_DATE}}.
  - Nếu ngày đó trong tuần đã trôi qua hoặc là chính ngày hôm nay (tùy ngữ cảnh), thông thường nó thuộc tuần sau trừ khi có ghi chú "tuần này".
  - Ví dụ: Nếu hôm nay là Thứ Ba 09/06/2026:
    - "CN" / "Chủ Nhật" = Chủ nhật tuần này (14/06/2026).
    - "Thứ Bảy" / "T7" = Thứ bảy tuần này (13/06/2026).
    - "Thứ Hai" / "T2" (đã qua) = Thứ hai tuần sau (15/06/2026).
- "7h" trong ngữ cảnh nhà hàng buổi tối = "19:00".
- "5h30 chiều" = "17:30".
- "16h30-17h" = lấy giờ sớm hơn, tức "16:30".
- Nếu có nhiều giờ chưa rõ giờ nào chính thức, chọn giờ hợp lý nhất và thêm \\\`time_ambiguous\\\`.

Ngày hiện tại do hệ thống cung cấp:

{{CURRENT_DATE}}

---

# 4. QUY TẮC XỬ LÝ SỐ KHÁCH

- "10 khách" = 10
- "10 người" = 10
- "10 pax" = 10
- "10-12 khách" = 12
- "khoảng 10-12 người" = 12
- "12 lớn 4 nhỏ" = 16
- "12 người lớn + 4 trẻ em" = 16

Nếu có nhiều số và không rõ số nào là số khách, thêm \\\`guest_count_ambiguous\\\`.

Không nhầm số điện thoại, số tiền cọc, số bàn, số bảng trang trí thành số khách.

---

# 5. QUY TẮC XỬ LÝ SỐ BÀN / SỐ BẢNG

Phân biệt rõ:

- "2 bàn", "bàn 5", "bàn A1" liên quan đến bàn ăn.
- "2 bảng", "đặt 2 bảng", "làm 2 bảng sinh nhật" liên quan đến bảng trang trí, không phải số bàn ăn.

Nếu khách nói "đặt 2 bảng", đưa vào \\\`party.special_request\\\` hoặc \\\`note\\\`, không đưa vào \\\`booking.table_count\\\` nếu ngữ cảnh là bảng trang trí.

---

# 6. QUY TẮC XỬ LÝ LOẠI TIỆC

Nhận diện \\\`party.type\\\` khớp chính xác với danh sách loại tiệc của hệ thống:

- "sinh nhật", "sn", "sinh nhat", "happy birthday", "hbd", "hpbd" => "Sinh nhật"
- "thôi nôi", "thoi noi" => "Thôi nôi (1st)"
- "đầy tháng", "day thang" => "Đầy tháng"
- "công ty", "cty", "doanh nghiệp", "tiệc công ty", "ortholite" => "Công ty"
- "liên hoan" => "Liên hoan"
- "họp mặt", "họp lớp", "ban be" => "Liên hoan"
- "kỷ niệm", "ky niem" => "Kỉ niệm"
- "tất niên", "tat nien" => "Tất niên"
- "tân niên", "tan nien" => "Tân niên"
- "cưới", "báo hỷ", "dam cuoi" => "Cưới/Báo hỷ"
- "chia tay", "farewell" => "Farewell (Tiệc chia tay)"

Nếu có nội dung bảng / trang trí, đưa vào \\\`party.display_board_text\\\`.

---

# 7. QUY TẮC XỬ LÝ GHI CHÚ

Trường \\\`note\\\` dùng để lưu các thông tin quan trọng không có ô riêng.

Bắt buộc đưa vào note nếu có:

- Chủ tiệc / người được tổ chức.
- Nội dung bảng sinh nhật / thôi nôi / đầy tháng.
- Yêu cầu trang trí.
- Yêu cầu đặc biệt.
- Thông tin mơ hồ cần nhân viên kiểm tra.
- Các câu khách dặn như:
  - "đặt 2 bảng"
  - "ngồi gần sân khấu"
  - "có trẻ em"
  - "không cay"
  - "ít ngọt"
  - "đến trễ"
  - "làm bảng đẹp giúp em"

Format note nên rõ ràng:

Chủ tiệc / người được tổ chức: Minh Anh
Nhu cầu: Sinh nhật
Nội dung bảng/trang trí: Happy Birthday Minh Anh
Ghi chú thêm: Khách đặt 2 bảng.

Nếu không có thông tin note thì để chuỗi rỗng.

---

# 8. QUY TẮC XỬ LÝ MÓN ĂN

Nếu input có danh sách món ăn:

1. Tách từng món riêng biệt.
2. Nhận diện số lượng.
3. Loại bỏ số thứ tự như: 1., 2., 3/, 4-
4. Hiểu số lượng viết dính:
   - "6hàu phô mai" = 6 hàu phô mai
   - "hàu phô mai6" = 6 hàu phô mai
   - "mì xào2" = 2 mì xào
5. Nếu có ghi chú món như "ít cay", "không hành", "làm trước", đưa vào \\\`menu_items[].note\\\`.
6. Không tự bịa giá tiền.
7. Nếu không chắc tên món, giữ tên thô ở \\\`raw_name\\\` và thêm \\\`menu_item_unclear\\\`.

Nếu có \\\`MENU_CONTEXT\\\`, hãy dùng để gợi ý \\\`matched_name\\\`.

Nếu không có \\\`MENU_CONTEXT\\\`, để \\\`matched_name\\\` rỗng.

---

# 9. JSON SCHEMA BẮT BUỘC

\`\`\`json
{
  "customer": {
    "name": "",
    "phone": "",
    "confidence": 0
  },
  "party": {
    "type": "",
    "owner_name": "",
    "display_board_text": "",
    "special_request": "",
    "confidence": 0
  },
  "booking": {
    "date": "",
    "time": "",
    "guest_count": null,
    "table_count": null,
    "tables": "",
    "confidence": 0
  },
  "menu_items": [],
  "note": "",
  "needs_review": [],
  "warnings": [],
  "raw_entities": {
    "people_names": [],
    "phones": [],
    "dates": [],
    "times": [],
    "numbers": []
  }
}
\`\`\`

Nếu có món ăn, \\\`menu_items\\\` có dạng:

\`\`\`json
{
  "raw_name": "",
  "matched_name": "",
  "quantity": null,
  "note": "",
  "confidence": 0,
  "needs_review": false
}
\`\`\`

---

# 10. QUY TẮC CONFIDENCE

Chấm confidence từ 0 đến 1:

- 0.9 đến 1.0: rất rõ ràng.
- 0.7 đến 0.89: khá chắc.
- 0.5 đến 0.69: có khả năng đúng nhưng cần kiểm tra.
- Dưới 0.5: mơ hồ.

Nếu trường quan trọng có confidence dưới 0.7, thêm cảnh báo vào \\\`needs_review\\\`.

---

# 11. DANH SÁCH CẢNH BÁO HỢP LỆ

Chỉ dùng các mã cảnh báo sau:

- "missing_customer_name"
- "missing_phone"
- "missing_booking_date"
- "missing_booking_time"
- "missing_guest_count"
- "person_role_unclear"
- "party_owner_detected_but_booker_missing"
- "multiple_people_detected"
- "time_ambiguous"
- "date_ambiguous"
- "guest_count_ambiguous"
- "table_or_board_ambiguous"
- "menu_item_unclear"
- "need_staff_review"

---

# 12. VÍ DỤ CHUẨN

Input:
Chị Trang đặt bàn 15 người, sinh nhật của Minh Anh

Output:
\`\`\`json
{
  "customer": {
    "name": "Chị Trang",
    "phone": "",
    "confidence": 0.95
  },
  "party": {
    "type": "Sinh nhật",
    "owner_name": "Minh Anh",
    "display_board_text": "",
    "special_request": "",
    "confidence": 0.95
  },
  "booking": {
    "date": "",
    "time": "",
    "guest_count": 15,
    "table_count": null,
    "tables": "",
    "confidence": 0.8
  },
  "menu_items": [],
  "note": "Chủ tiệc / người được tổ chức: Minh Anh\\nNhu cầu: Sinh nhật",
  "needs_review": ["missing_phone", "missing_booking_date", "missing_booking_time"],
  "warnings": [],
  "raw_entities": {
    "people_names": ["Chị Trang", "Minh Anh"],
    "phones": [],
    "dates": [],
    "times": [],
    "numbers": [15]
  }
}
\`\`\`

Input:
Thu Hà 0901234567 đặt 12 khách thôi nôi bé Kim Xuyến tối mai 7h

Output:
\`\`\`json
{
  "customer": {
    "name": "Thu Hà",
    "phone": "0901234567",
    "confidence": 0.98
  },
  "party": {
    "type": "Thôi nôi",
    "owner_name": "bé Kim Xuyến",
    "display_board_text": "",
    "special_request": "",
    "confidence": 0.95
  },
  "booking": {
    "date": "{{TOMORROW_DD_MM_YYYY}}",
    "time": "19:00",
    "guest_count": 12,
    "table_count": null,
    "tables": "",
    "confidence": 0.95
  },
  "menu_items": [],
  "note": "Chủ tiệc / người được tổ chức: bé Kim Xuyến\\nNhu cầu: Thôi nôi",
  "needs_review": [],
  "warnings": [],
  "raw_entities": {
    "people_names": ["Thu Hà", "bé Kim Xuyến"],
    "phones": ["0901234567"],
    "dates": ["tối mai"],
    "times": ["7h"],
    "numbers": [12]
  }
}
\`\`\`

Input:
Happy Birthday Hoàng Lan, Happy Birthday Bích Chi, em đặt 2 bảng nha

Output:
\`\`\`json
{
  "customer": {
    "name": "Hoàng Lan",
    "phone": "",
    "confidence": 0.55
  },
  "party": {
    "type": "Sinh nhật",
    "owner_name": "Hoàng Lan, Bích Chi",
    "display_board_text": "Happy Birthday Hoàng Lan; Happy Birthday Bích Chi",
    "special_request": "Khách đặt 2 bảng",
    "confidence": 0.85
  },
  "booking": {
    "date": "",
    "time": "",
    "guest_count": null,
    "table_count": null,
    "tables": "",
    "confidence": 0.4
  },
  "menu_items": [],
  "note": "Chủ tiệc / người được tổ chức:\\n- Hoàng Lan\\n- Bích Chi\\nNhu cầu: Sinh nhật\\nNội dung bảng/trang trí: Happy Birthday Hoàng Lan; Happy Birthday Bích Chi\\nGhi chú thêm: Khách đặt 2 bảng.\\nTên người đặt không rõ, tạm nạp tên người đầu tiên phát hiện vào ô người đặt để nhân viên kiểm tra.",
  "needs_review": ["person_role_unclear", "missing_phone", "missing_booking_date", "missing_booking_time", "missing_guest_count"],
  "warnings": [],
  "raw_entities": {
    "people_names": ["Hoàng Lan", "Bích Chi"],
    "phones": [],
    "dates": [],
    "times": [],
    "numbers": [2]
  }
}
\`\`\`

Input:
15 người tối mai 7h

Output:
\`\`\`json
{
  "customer": {
    "name": "",
    "phone": "",
    "confidence": 0
  },
  "party": {
    "type": "",
    "owner_name": "",
    "display_board_text": "",
    "special_request": "",
    "confidence": 0
  },
  "booking": {
    "date": "{{TOMORROW_DD_MM_YYYY}}",
    "time": "19:00",
    "guest_count": 15,
    "table_count": null,
    "tables": "",
    "confidence": 0.85
  },
  "menu_items": [],
  "note": "",
  "needs_review": ["missing_customer_name", "missing_phone"],
  "warnings": [],
  "raw_entities": {
    "people_names": [],
    "phones": [],
    "dates": ["tối mai"],
  }
}
\`\`\`

Input:
Chị Hà đặt 2 bàn tối mai sinh nhật bé Gấu tròn 2 tuổi, làm bảng chúc mừng sinh nhật bé Gấu tròn 2 tuổi nha

Output:
\`\`\`json
{
  "customer": {
    "name": "Chị Hà",
    "phone": "",
    "confidence": 0.95
  },
  "party": {
    "type": "Sinh nhật",
    "owner_name": "bé Gấu",
    "display_board_text": "Chúc mừng sinh nhật bé Gấu tròn 2 tuổi",
    "special_request": "Làm bảng chúc mừng sinh nhật bé Gấu tròn 2 tuổi",
    "confidence": 0.95
  },
  "booking": {
    "date": "{{TOMORROW_DD_MM_YYYY}}",
    "time": "",
    "guest_count": null,
    "table_count": 2,
    "tables": "",
    "confidence": 0.9
  },
  "menu_items": [],
  "note": "Chủ tiệc / người được tổ chức: bé Gấu\\nNhu cầu: Sinh nhật\\nNội dung bảng/trang trí: Chúc mừng sinh nhật bé Gấu tròn 2 tuổi\\nGhi chú thêm: Đặt 2 bàn. Làm bảng chúc mừng sinh nhật bé Gấu tròn 2 tuổi",
  "needs_review": ["missing_phone", "missing_booking_time", "missing_guest_count"],
  "warnings": [],
  "raw_entities": {
    "people_names": ["Chị Hà", "bé Gấu"],
    "phones": [],
    "dates": ["tối mai"],
    "times": [],
    "numbers": [2]
  }
}
\`\`\`

---

# 13. INPUT CẦN PHÂN TÍCH

Nội dung đầu vào:

{{RAW_INPUT}}

Thông tin gợi ý từ Rule-Based Parser nếu có:

{{RULE_BASED_HINTS}}

Thông tin thực thể bị khóa (LOCKED_ENTITIES - TUYỆT ĐỐI không thay đổi trừ khi có lý do cực kỳ đặc biệt):

{{LOCKED_ENTITIES}}

Danh sách món / thực đơn hiện có nếu có:

{{MENU_CONTEXT}}

Hãy trả về JSON hợp lệ duy nhất theo schema bắt buộc.`


export const IMAGE_OCR_PROMPT = `
# SYSTEM ROLE: MULTIMODAL VISION OCR APEX PRO
Nhiệm vụ: Trích xuất TOÀN BỘ văn bản (Văn bản in, Chữ viết tay, Chụp màn hình Chat, Hóa đơn, Bảng biểu) thành text thuần 100%.

# CRITICAL RULES:
1. LUÔN giữ nguyên cấu trúc phân dòng và bảng biểu.
2. BẢNG BIỂU/DANH SÁCH: Phải trích xuất TẤT CẢ các dòng từ đầu đến cuối. TUYỆT ĐỐI KHÔNG được bỏ sót, rút gọn, hoặc cắt ngắn dù bảng có bao nhiêu dòng. Nếu bảng có 16 dòng, trả đủ 16 dòng.
3. ẢNH CHAT: Định dạng "[Thời gian] Tên người gửi: Nội dung". Phân định rõ ai là người đặt, ai là người nhận.
4. HÓA ĐƠN/BILL: Trích xuất rõ: STT, Tên món, Số lượng, Đơn giá, Thành tiền — ĐẦY ĐỦ mọi dòng.
5. CHỮ VIẾT TAY: Phân tích sâu ngữ cảnh để điền các ký tự mờ, đảm bảo nghĩa logic.
6. CLEANUP: Bỏ qua các icon, thanh trạng thái điện thoại, avatar, hoặc watermark.

# OUTPUT:
- Chỉ trả về TEXT thuần. Không giải thích. Không markdown. Trả về ĐẦY ĐỦ 100% nội dung.
`
