/**
 * APPLICATION CONSTANTS
 * Migrated from King's Grill Manager AI v1.8.6
 */

export const AI_TIMEOUTS = {
  fastModelMs: 1200,
  qualityModelMs: 4500,
  proxyMs: 10000,
  totalBudgetMs: 12000
}

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
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Google)', provider: 'google', type: 'text', tier: 1, url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', format: 'gemini' },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite (Google)', provider: 'google', type: 'text', tier: 1, url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent', format: 'gemini' },
  { id: 'gemini-flash-latest', name: 'Gemini Flash Latest (Google)', provider: 'google', type: 'text', tier: 1, url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent', format: 'gemini' },
  { id: 'llama-3.2-11b-vision-instruct', name: 'Llama 3.2 11B (Groq)', provider: 'groq', type: 'text', tier: 1, url: 'https://api.groq.com/openai/v1/chat/completions', format: 'openai' },
  // Tier 2: Cerebras Wafer-Scale (2000+ tok/s) - Verified IDs
  { id: 'llama-3.3-70b', name: 'Llama 3.3 70B (Cerebras)', provider: 'cerebras', type: 'text', tier: 1, url: 'https://api.cerebras.ai/v1/chat/completions', format: 'openai' },
  { id: 'llama-3.1-8b', name: 'Llama 3.1 8B (Cerebras)', provider: 'cerebras', type: 'text', tier: 2, url: 'https://api.cerebras.ai/v1/chat/completions', format: 'openai' },
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
  { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1 (SambaNova)', provider: 'sambanova', type: 'text', tier: 4, url: 'https://api.sambanova.ai/v1/chat/completions', format: 'openai' },
  { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3 (SambaNova)', provider: 'sambanova', type: 'text', tier: 1, url: 'https://api.sambanova.ai/v1/chat/completions', format: 'openai' },
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
  { id: 'llama-3.2-11b-vision-instruct', name: 'Llama 3.2 11B (Groq)', provider: 'groq', type: 'vision', tier: 0, url: 'https://api.groq.com/openai/v1/chat/completions', format: 'openai' },
  // Tier 1: Google Gemini Fleet
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google', type: 'vision', tier: 1, url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', format: 'gemini' },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', provider: 'google', type: 'vision', tier: 1, url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent', format: 'gemini' },
  { id: 'gemini-flash-latest', name: 'Gemini Flash Latest', provider: 'google', type: 'vision', tier: 1, url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent', format: 'gemini' },
  // Tier 2: Mistral Vision
  { id: 'pixtral-large-latest', name: 'Pixtral Large (Vision)', provider: 'mistral', type: 'vision', tier: 2, url: 'https://api.mistral.ai/v1/chat/completions', format: 'openai' },
  { id: 'mistral-small-latest', name: 'Mistral Small 4 (Vision)', provider: 'mistral', type: 'vision', tier: 2, url: 'https://api.mistral.ai/v1/chat/completions', format: 'openai' },
  // Tier 3: GitHub & SambaNova Backup
  { id: 'gpt-4o', name: 'GitHub GPT-4o (Vision)', provider: 'github', type: 'vision', tier: 3, url: 'https://models.github.ai/inference/chat/completions', format: 'openai' },
  { id: 'gpt-4o-mini', name: 'GitHub GPT-4o-Mini (Vision)', provider: 'github', type: 'vision', tier: 3, url: 'https://models.github.ai/inference/chat/completions', format: 'openai' },
  { id: 'Llama-4-Maverick-17B-128E-Instruct', name: 'Llama 4 Maverick (SambaNova)', provider: 'sambanova', type: 'vision', tier: 3, url: 'https://api.sambanova.ai/v1/chat/completions', format: 'openai' },
  { id: 'Llama-4-Scout-17B-16E-Instruct', name: 'Llama 4 Scout (SambaNova)', provider: 'sambanova', type: 'vision', tier: 3, url: 'https://api.sambanova.ai/v1/chat/completions', format: 'openai' },
  { id: 'google/gemini-2.0-flash:free', name: 'Gemini 2.0 Flash (Free)', provider: 'openrouter', type: 'vision', tier: 3, url: 'https://openrouter.ai/api/v1/chat/completions', format: 'openai' },
  { id: 'qwen/qwen-2.5-vl-72b-instruct:free', name: 'Qwen 2.5 VL 72B (Free Vision)', provider: 'openrouter', type: 'vision', tier: 3, url: 'https://openrouter.ai/api/v1/chat/completions', format: 'openai' },
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

export const DEFAULT_FALLBACK_MENU_ITEMS = [
  { name: 'Khoai tây chiên', price: 45000, desc: 'KHAI VỊ', cleanName: 'khoai tay chien', acronym: 'ktc' },
  { name: 'Ngô chiên', price: 45000, desc: 'KHAI VỊ', cleanName: 'ngo chien', acronym: 'nc' },
  { name: 'Salad cà chua dưa chuột', price: 55000, desc: 'KHAI VỊ', cleanName: 'salad ca chua dua chuot', acronym: 'sccdc' },
  { name: 'Bò nướng tảng', price: 250000, desc: 'MÓN CHÍNH', cleanName: 'bo nuong tang', acronym: 'bnt' },
  { name: 'Dẻ sườn bò Mỹ', price: 199000, desc: 'MÓN CHÍNH', cleanName: 'de suon bo my', acronym: 'dsbm' },
  { name: 'Ba chỉ heo nướng', price: 120000, desc: 'MÓN CHÍNH', cleanName: 'ba chi heo nuong', acronym: 'bchn' },
  { name: 'Coca', price: 15000, desc: 'ĐỒ UỐNG', cleanName: 'coca', acronym: 'c' },
  { name: 'Bia Tiger', price: 25000, desc: 'ĐỒ UỐNG', cleanName: 'bia tiger', acronym: 'bt' },
  { name: 'Rượu Vodka Men', price: 150000, desc: 'ĐỒ UỐNG', cleanName: 'ruou vodka men', acronym: 'rvm' }
]

export const ADVANCED_AI_PROMPT = `Bạn là AI trích xuất thông tin đặt bàn SIÊU CHÍNH XÁC của nhà hàng KING's GRILL.
Đọc input, trích xuất dữ liệu chính xác thành JSON hợp lệ duy nhất khớp Schema. Không giải thích, không markdown.

NGUYÊN TẮC BẮT BUỘC:
1. Loại bỏ mọi biểu tượng định dạng nhiễu: ✔, ↳, •, -, +, *, >, emoji, hoặc thụt lề đầu dòng trước khi trích xuất.
2. Chỉ trích xuất thông tin thực tế trong input. Thiếu thì để null hoặc "". Không tự bịa thông tin.
3. Ưu tiên độ chính xác tuyệt đối. Nếu mơ hồ hoặc thiếu thông tin quan trọng, thêm mã cảnh báo tương ứng vào needs_review.
4. ĐẢM BẢO KHÔNG BỎ SÓT DỮ LIỆU: Mọi chi tiết trang trí, tông màu, bảng tên, yêu cầu riêng đều phải xuất hiện trong party.special_request VÀ được tổng hợp đầy đủ vào note.

# 1. QUY TẮC PHÂN ĐỊNH TÊN & VAI TRÒ
- customer.name & customer.phone: Người liên hệ / đặt bàn chính (vd: "Chị Ngọc", "Anh Nam", "Chị Trang 0938..."). Xưng hô Anh/Chị giữ cùng tên nếu có.
- TUYỆT ĐỐI KHÔNG lấy tên nhân vật chính của buổi tiệc (như "Bé Min", "Bé Bún", "Chị Thảo (chủ tiệc)") làm customer.name. Nếu chỉ có tên chủ tiệc/nhân vật chính mà không rõ người đặt, để customer.name = "".
- TUYỆT ĐỐI KHÔNG lấy số bàn, mã bàn/khu vực (như "Bàn 5", "Bàn C6", "A12", "VIP2", "Khu A"), tên nhân viên nhận cọc/đơn (như "Thuận", "Dương", "Tiên", "Lễ tân", "Admin"), hoặc thông tin yêu cầu/món ăn làm customer.name. Nếu không có tên khách rõ ràng, để customer.name = "".
- party.owner_name: Chủ tiệc / người được tổ chức (vd: "Thiên Hào" trong "Happy birthday Thiên Hào", "Bé Bún" trong "Sinh nhật Bé Bún 1 tuổi").
- party.display_board_text: Nguyên văn nội dung hiển thị trên bảng welcome/bảng tên nếu có (vd: "Happy birthday Thiên Hào", "Chúc mừng sinh nhật Chị Thảo").
- Thứ tự ưu tiên tên người:
  1. Từ khóa đặt/liên hệ (khách hàng, khách đặt, liên hệ, sđt, đặt bàn...) -> customer.name.
  2. Tên đi liền SĐT -> customer.name & customer.phone.
  3. Tên đi sau từ khóa tiệc/bảng tên (sinh nhật, thôi nôi, bảng tên, happy birthday...) -> party.owner_name & party.display_board_text.
  4. Có tên nhưng vai trò mơ hồ -> customer.name = "", party.owner_name = tên, thêm "person_role_unclear" vào needs_review.
  5. Không có tên -> customer.name = "", thêm "missing_customer_name" vào needs_review.

# 2. XỬ LÝ NGÀY GIỜ (Dựa trên thời gian hệ thống: {{CURRENT_DATE}})
- Chuẩn hóa: Ngày dạng DD/MM/YYYY, Giờ dạng HH:mm (24h).
- Nếu input chỉ có Ngày/Tháng (vd "06/08", "6/8"), tự động lấy Năm từ {{CURRENT_DATE}} (vd: "06/08/2026").
- Từ ngữ tương đối: "nay", "tối nay" = ngày hiện tại. "mai", "chiều mai" = ngày hiện tại + 1. "mốt", "ngày kia" = ngày hiện tại + 2.
- Thứ trong tuần (T7, CN, thứ hai...): tự động tính dựa trên {{CURRENT_DATE}}. Nếu thứ đó đã qua trong tuần hiện tại, chọn thứ đó của tuần sau.
- Giờ tối: "7h" -> "19:00", "6h30 tối", "18g30" -> "18:30", "16h30-17h" -> lấy giờ sớm nhất "16:30". Mơ hồ thì thêm "time_ambiguous".

# 3. SỐ KHÁCH, BÀN & TRANG TRÍ
- guest_count: "10 khách", "10 người", "12 lớn 4 nhỏ" (16), "10-12 pax" (12). Mơ hồ thì thêm "guest_count_ambiguous". Không nhầm với SĐT, số bàn hay tiền cọc.
- table_count & tables: "2 bàn", "bàn A1" -> table_count, tables.
- party.decor_color: Tông màu trang trí yêu cầu (vd: "Hồng pastel", "Xanh dương", "Vàng kim", "Đen đỏ", "Trắng kem", v.v.). Trích xuất trực tiếp tông màu nếu có đề cập.
- party.special_request: Ghi nhận đầy đủ chi tiết trang trí bổ sung: hoa tươi ("trang trí hoa tươi", "hoa tươi trên bàn"), hoa lụa, bong bóng, backdrop, vị trí bàn ("gần sân khấu", "phòng riêng"), giờ đem bánh kem ("đem bánh kem lúc 20h").
- KHÔNG nhầm số lượng bảng trang trí ("2 bảng tên") với table_count.

# 4. LOẠI TIỆC & TỔNG HỢP GHI CHÚ (NOTE)
- party.type: "Sinh nhật", "Thôi nôi (1st)", "Đầy tháng", "Công ty", "Liên hoan", "Kỉ niệm", "Tất niên", "Tân niên", "Cưới/Báo hỷ", "Farewell (Tiệc chia tay)".
- note: Tổng hợp mạch lạc toàn bộ thông tin quan trọng. Format gợi ý:
  "Chủ tiệc: [party.owner_name] | Tông màu: [party.decor_color] | Bảng tên: \"[party.display_board_text]\" | Gương: \"[party.mirror_board_text]\" | Trang trí/Dặn dò: [party.special_request] | Yêu cầu khác: [ăn uống/vị trí]"

# 5. MÓN ĂN (menu_items)
- CHỈ trích xuất món ăn khách hàng THỰC SỰ ĐẶT / YÊU CẦU trong tin nhắn.
- TUYỆT ĐỐI KHÔNG tự bịa, không tự ý thêm món từ thực đơn nếu khách không yêu cầu. Nếu khách không đặt món, để menu_items = [].
- Trích xuất ĐẦY ĐỦ TẤT CẢ các món ăn được gọi, không bỏ sót món.
- raw_name: Tên món thô trong tin nhắn (xử lý dính chữ: "6hàu" -> 6 hàu, "mì xào2" -> 2 mì xào).
- matched_name: Khớp chính xác tên từ thực đơn ứng viên nếu có {{MENU_CONTEXT}}, không có để "".
- quantity: Số lượng suất gọi (mặc định 1).
- note: Yêu cầu riêng hoặc quy cách khẩu phần (vd: "ít cay", "1/2 con", "5 con", "10 con", "0.5kg", "dĩa lớn").

# 6. CONFIDENCE & CẢNH BÁO HỢP LỆ
- Đánh giá từ 0.0 đến 1.0. Nếu trường chính < 0.7, thêm cảnh báo vào needs_review.
- Các cảnh báo hợp lệ trong needs_review:
  "missing_customer_name", "missing_phone", "missing_booking_date", "missing_booking_time", "missing_guest_count", "person_role_unclear", "party_owner_detected_but_booker_missing", "multiple_people_detected", "time_ambiguous", "date_ambiguous", "guest_count_ambiguous", "table_or_board_ambiguous", "menu_item_unclear", "need_staff_review".

# 7. VÍ DỤ MINH HỌA (Khớp schema)

Input:
✔ Khách hàng: Chị Ngọc – 0938009889
✔ Thời gian: 18:30 ngày 06/08
✔ Số lượng: 10 khách (Tiệc sinh nhật)
✔ Trang trí mặt bàn: Hoa lụa miễn phí theo tông màu Xanh dương
↳ Ghi chú: Bảng tên "Happy birthday Thiên Hào"

Output:
\`\`\`json
{
  "customer": { "name": "Chị Ngọc", "phone": "0938009889", "confidence": 0.98 },
  "party": { "type": "Sinh nhật", "owner_name": "Thiên Hào", "display_board_text": "Happy birthday Thiên Hào", "decor_color": "Xanh dương", "special_request": "Hoa lụa miễn phí theo tông màu Xanh dương", "confidence": 0.98 },
  "booking": { "date": "06/08/2026", "time": "18:30", "guest_count": 10, "table_count": null, "tables": "", "confidence": 0.98 },
  "menu_items": [],
  "note": "Chủ tiệc: Thiên Hào | Bảng tên: \"Happy birthday Thiên Hào\" | Trang trí: Hoa lụa miễn phí theo tông màu Xanh dương",
  "needs_review": [],
  "warnings": [],
  "raw_entities": { "people_names": ["Chị Ngọc", "Thiên Hào"], "phones": ["0938009889"], "dates": ["06/08"], "times": ["18:30"], "numbers": [10] }
}
\`\`\`

Input:
Chị Trang đặt bàn 15 người, sinh nhật của Minh Anh
Output:
\`\`\`json
{
  "customer": { "name": "Chị Trang", "phone": "", "confidence": 0.95 },
  "party": { "type": "Sinh nhật", "owner_name": "Minh Anh", "display_board_text": "", "special_request": "", "confidence": 0.95 },
  "booking": { "date": "", "time": "", "guest_count": 15, "table_count": null, "tables": "", "confidence": 0.8 },
  "menu_items": [],
  "note": "Chủ tiệc / người được tổ chức: Minh Anh | Nhu cầu: Sinh nhật",
  "needs_review": ["missing_phone", "missing_booking_date", "missing_booking_time"],
  "warnings": [],
  "raw_entities": { "people_names": ["Chị Trang", "Minh Anh"], "phones": [], "dates": [], "times": [], "numbers": [15] }
}
\`\`\`

\`\`\`

---
# INPUT CẦN PHÂN TÍCH
Nội dung đầu vào:
{{RAW_INPUT}}

Thông tin gợi ý từ Rule-Based Parser nếu có:
{{RULE_BASED_HINTS}}

Thông tin thực thể bị khóa (LOCKED_ENTITIES):
{{LOCKED_ENTITIES}}

Danh sách món / thực đơn hiện có nếu có:
{{MENU_CONTEXT}}

Hãy trả về JSON hợp lệ duy nhất theo schema bắt buộc.`;


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
