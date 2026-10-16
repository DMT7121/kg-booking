/**
 * APPLICATION CONSTANTS
 * Migrated from King's Grill Manager AI v1.8.6
 */

export const AI_TIMEOUTS = {
  fastModelMs: 6000,
  qualityModelMs: 10000,
  proxyMs: 15000,
  totalBudgetMs: 25000
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
  mistral: { name: 'Mistral AI', getUrl: 'https://console.mistral.ai/api-keys', icon: 'fa-wind', color: 'text-teal-500' },
  openrouter: { name: 'OpenRouter (Free)', getUrl: 'https://openrouter.ai/keys', icon: 'fa-route', color: 'text-blue-400' },
  nvidia: { name: 'NVIDIA NIM (Free)', getUrl: 'https://build.nvidia.com/explore/discover', icon: 'fa-microchip', color: 'text-emerald-500' },
  cohere: { name: 'Cohere Trial (Free)', getUrl: 'https://dashboard.cohere.com/api-keys', icon: 'fa-brain', color: 'text-purple-500' },
  pollinations: { name: 'Pollinations (Free)', getUrl: 'https://pollinations.ai/', icon: 'fa-seedling', color: 'text-green-500' }
}

// --- TIERED AI MODELS ROSTER V6.5 APEX (Verified Free-Tier APIs 2026) ---
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
  // ══════ TEXT PIPELINE (VERIFIED FREE TIER 2026) ══════
  // Tier 0: Ultra-Fast — Groq LPU (1000+ tok/s, Free Tier)
  { id: 'qwen/qwen3.8-27b', name: 'Qwen 3.8 27B (Groq)', provider: 'groq', type: 'text', tier: 0, url: 'https://api.groq.com/openai/v1/chat/completions', format: 'openai' },
  { id: 'openai/gpt-oss-120b', name: 'OpenAI GPT-OSS 120B (Groq)', provider: 'groq', type: 'text', tier: 0, url: 'https://api.groq.com/openai/v1/chat/completions', format: 'openai' },
  // Tier 1: Google Gemini Fleet (Super Reliable & High Accuracy, Free 1500 req/day) & Groq Fast Backup
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Google)', provider: 'google', type: 'text', tier: 1, url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', format: 'gemini' },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite (Google)', provider: 'google', type: 'text', tier: 1, url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent', format: 'gemini' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Google)', provider: 'google', type: 'text', tier: 1, url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', format: 'gemini' },
  { id: 'gemini-flash-latest', name: 'Gemini Flash Latest (Google)', provider: 'google', type: 'text', tier: 1, url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent', format: 'gemini' },
  { id: 'openai/gpt-oss-20b', name: 'OpenAI GPT-OSS 20B (Groq)', provider: 'groq', type: 'text', tier: 1, url: 'https://api.groq.com/openai/v1/chat/completions', format: 'openai' },
  // Tier 2: Mistral AI Experiment Tier (Free)
  { id: 'ministral-14b-latest', name: 'Ministral 14B (Mistral)', provider: 'mistral', type: 'text', tier: 2, url: 'https://api.mistral.ai/v1/chat/completions', format: 'openai' },
  { id: 'ministral-8b-latest', name: 'Ministral 8B (Mistral)', provider: 'mistral', type: 'text', tier: 2, url: 'https://api.mistral.ai/v1/chat/completions', format: 'openai' },
  { id: 'codestral-latest', name: 'Codestral Latest (Mistral)', provider: 'mistral', type: 'text', tier: 2, url: 'https://api.mistral.ai/v1/chat/completions', format: 'openai' },
  { id: 'mistral-small-latest', name: 'Mistral Small 4 (Mistral)', provider: 'mistral', type: 'text', tier: 3, url: 'https://api.mistral.ai/v1/chat/completions', format: 'openai' },
  // Tier 3: NVIDIA NIM & Cohere Trial (Free Developer API Keys)
  { id: 'nvidia/nemotron-3-super-120b-a12b', name: 'Nemotron 3 Super 120B (NVIDIA NIM)', provider: 'nvidia', type: 'text', tier: 3, url: 'https://integrate.api.nvidia.com/v1/chat/completions', format: 'openai' },
  { id: 'deepseek-ai/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash (NVIDIA NIM)', provider: 'nvidia', type: 'text', tier: 3, url: 'https://integrate.api.nvidia.com/v1/chat/completions', format: 'openai' },
  { id: 'google/gemma-4-31b-it', name: 'Gemma 4 31B Instruct (NVIDIA NIM)', provider: 'nvidia', type: 'text', tier: 3, url: 'https://integrate.api.nvidia.com/v1/chat/completions', format: 'openai' },
  { id: 'nvidia/nemotron-3.5-lightning-30b-a3b', name: 'Nemotron 3.5 Lightning (NVIDIA NIM)', provider: 'nvidia', type: 'text', tier: 3, url: 'https://integrate.api.nvidia.com/v1/chat/completions', format: 'openai' },
  { id: 'z-ai/glm-5.3-flash', name: 'GLM 5.3 Flash (NVIDIA NIM)', provider: 'nvidia', type: 'text', tier: 3, url: 'https://integrate.api.nvidia.com/v1/chat/completions', format: 'openai' },
  { id: 'command-a-03-2025', name: 'Command A (Cohere Free)', provider: 'cohere', type: 'text', tier: 3, url: 'https://api.cohere.ai/compatibility/v1/chat/completions', format: 'openai' },
  { id: 'command-r-plus-08-2024', name: 'Command R+ (Cohere Free)', provider: 'cohere', type: 'text', tier: 3, url: 'https://api.cohere.ai/compatibility/v1/chat/completions', format: 'openai' },
  // Tier 4: OpenRouter Verified Free Models (2026 :free Roster)
  { id: 'openrouter/free', name: 'OpenRouter Free Router', provider: 'openrouter', type: 'text', tier: 4, url: 'https://openrouter.ai/api/v1/chat/completions', format: 'openai' },
  { id: 'google/gemma-4-31b-it:free', name: 'Gemma 4 31B (OpenRouter Free)', provider: 'openrouter', type: 'text', tier: 4, url: 'https://openrouter.ai/api/v1/chat/completions', format: 'openai' },
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'Nemotron 3 Ultra 550B (Free)', provider: 'openrouter', type: 'text', tier: 4, url: 'https://openrouter.ai/api/v1/chat/completions', format: 'openai' },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super 120B (Free)', provider: 'openrouter', type: 'text', tier: 4, url: 'https://openrouter.ai/api/v1/chat/completions', format: 'openai' },
  { id: 'nvidia/nemotron-3.5-lightning:free', name: 'Nemotron 3.5 Lightning (Free)', provider: 'openrouter', type: 'text', tier: 4, url: 'https://openrouter.ai/api/v1/chat/completions', format: 'openai' },
  // Tier 5: Pollinations Keyless Free Fallback
  { id: 'openai', name: 'Pollinations GPT (Free)', provider: 'pollinations', type: 'text', tier: 5, url: 'https://text.pollinations.ai/openai/v1/chat/completions', format: 'openai' },
  { id: 'qwen', name: 'Qwen 2.5 72B (Free)', provider: 'pollinations', type: 'text', tier: 5, url: 'https://text.pollinations.ai/openai/v1/chat/completions', format: 'openai' },
  { id: 'llama', name: 'Llama 3.3 70B (Free)', provider: 'pollinations', type: 'text', tier: 5, url: 'https://text.pollinations.ai/openai/v1/chat/completions', format: 'openai' },
  { id: 'deepseek', name: 'DeepSeek R1 / V3 (Free)', provider: 'pollinations', type: 'text', tier: 5, url: 'https://text.pollinations.ai/openai/v1/chat/completions', format: 'openai' },

  // ══════ VISION PIPELINE (VERIFIED FREE TIER 2026) ══════
  // Tier 0: Google Gemini Multimodal & Groq Qwen 3.8 Vision (Highest OCR & Vietnamese accuracy)
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Vision)', provider: 'google', type: 'vision', tier: 0, url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', format: 'gemini' },
  { id: 'qwen/qwen3.8-27b', name: 'Qwen 3.8 27B Vision (Groq)', provider: 'groq', type: 'vision', tier: 0, url: 'https://api.groq.com/openai/v1/chat/completions', format: 'openai' },
  // Tier 1: Google Gemini Fast Backup
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite (Vision)', provider: 'google', type: 'vision', tier: 1, url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent', format: 'gemini' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Vision)', provider: 'google', type: 'vision', tier: 1, url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', format: 'gemini' },
  { id: 'gemini-flash-latest', name: 'Gemini Flash Latest (Vision)', provider: 'google', type: 'vision', tier: 1, url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent', format: 'gemini' },
  // Tier 2: Mistral Ministral & Pixtral Vision (Free Tier)
  { id: 'ministral-14b-latest', name: 'Ministral 14B (Vision)', provider: 'mistral', type: 'vision', tier: 2, url: 'https://api.mistral.ai/v1/chat/completions', format: 'openai' },
  { id: 'pixtral-12b-2409', name: 'Pixtral 12B (Vision)', provider: 'mistral', type: 'vision', tier: 2, url: 'https://api.mistral.ai/v1/chat/completions', format: 'openai' },
  { id: 'ministral-8b-latest', name: 'Ministral 8B (Vision)', provider: 'mistral', type: 'vision', tier: 2, url: 'https://api.mistral.ai/v1/chat/completions', format: 'openai' },
  // Tier 3: OpenRouter & NVIDIA NIM Free Vision
  { id: 'openrouter/free', name: 'OpenRouter Free Vision Router', provider: 'openrouter', type: 'vision', tier: 3, url: 'https://openrouter.ai/api/v1/chat/completions', format: 'openai' },
  { id: 'google/gemma-4-31b-it:free', name: 'Gemma 4 31B Vision (Free)', provider: 'openrouter', type: 'vision', tier: 3, url: 'https://openrouter.ai/api/v1/chat/completions', format: 'openai' },
  { id: 'google/gemma-4-26b-a4b-it:free', name: 'Gemma 4 26B Vision (Free)', provider: 'openrouter', type: 'vision', tier: 3, url: 'https://openrouter.ai/api/v1/chat/completions', format: 'openai' },
  { id: 'meta/llama-3.2-90b-vision-instruct', name: 'Llama 3.2 90B Vision (NVIDIA NIM)', provider: 'nvidia', type: 'vision', tier: 3, url: 'https://integrate.api.nvidia.com/v1/chat/completions', format: 'openai' },
  // Tier 4: Pollinations Free Vision Fallback
  { id: 'openai', name: 'Pollinations GPT-4o Vision (Free)', provider: 'pollinations', type: 'vision', tier: 4, url: 'https://text.pollinations.ai/openai/v1/chat/completions', format: 'openai' }
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
  { name: 'Đầy tháng', icon: 'fa-baby-carriage' },
  { name: 'Công ty', icon: 'fa-building' },
  { name: 'Ăn thường', icon: 'fa-utensils' },
  { name: 'Cưới/Báo hỷ', icon: 'fa-ring' },
  { name: 'Báo hỷ', icon: 'fa-ring' },
  { name: 'Liên hoan', icon: 'fa-champagne-glasses' },
  { name: 'Họp mặt', icon: 'fa-users' },
  { name: 'Gia đình', icon: 'fa-house-chimney-user' },
  { name: 'Farewell (Tiệc chia tay)', icon: 'fa-plane-departure' },
  { name: 'Tiệc chia tay (Farewell)', icon: 'fa-plane-departure' },
  { name: 'Kỉ niệm', icon: 'fa-heart' },
  { name: 'Cầu hôn (Proposal)', icon: 'fa-gem' },
  { name: 'Tiếp khách / Đối tác', icon: 'fa-handshake' },
  { name: 'Tất niên', icon: 'fa-calendar-xmark' },
  { name: 'Tân niên', icon: 'fa-calendar-star' },
  { name: 'Khác', icon: 'fa-star' }
]

// --- SET COMBOS ---
export const SETS: Record<string, string> = {
  'Set menu 1': "1/ Sum Vầy [1]\n2/ Súp Gà Trứng Bắc Thảo (10) [1]\n3/ Thịt Heo Xiên Nướng [2]\n4/ Bò Om Pate [2]\n5/ Tôm Cocktail (10) [1]\n6/ Lẩu Riêu Cua Đồng [1]\n7/ Trái Cây/ Tàu Hủ Lạnh/ Bánh Bò Thốt Nốt [1]",
  'Set menu 2': "1/ Combo Khai Vị: Chả Giò Kim Tiền (10), Gỏi Tôm Thịt Hoa Chuối, Thịt Xiên Nướng (10) [1]\n2/ Miến Xào Trứng Tôm [2]\n3/ Giò Heo Muối Hoa Tiêu Xôi Hạt Sen [1]\n4/ Mực Trứng Om Ớt Xiêm Xanh [2]\n5/ Lẩu Chua Cay Hải Sản [1]\n6/ Trái Cây/ Tàu Hủ Lạnh/ Bánh Bò Thốt Nốt [1]",
  'Set menu 3': "1/ Con Gà Cục Tác Lá Chanh [1]\n2/ Chả Giò Bát Bửu (5) [2]\n3/ Bê Chao Tỏi [2]\n4/ Cá Chim Om Chanh [1]\n5/ Lẩu Bò Sate [1]\n6/ Trái Cây/ Tàu Hủ Lạnh/ Bánh Bò Thốt Nốt [1]",
  'Set menu 4': "1/ Gỏi Bò Rau Muống [2]\n2/ Gà Om Mía [2]\n3/ Cơm Chiên Cá Mặn [2]\n4/ Cá Diêu Hồng Nướng Hà Giang [2]\n5/ Tôm Cocktail (10) [1]\n6/ Lẩu Nấm Hải Sản [1]\n7/ Trái Cây/ Tàu Hủ Lạnh/ Bánh Bò Thốt Nốt [1]",
  'Set menu 5': "1/ Salad King's Grill [2]\n2/ Chả Đùm Trứng Muối [2]\n3/ Gà Nướng King's Grill [1]\n4/ Tôm Nướng Muối Ớt (10) [1]\n5/ Sườn Bò Om Kim Chi [2]\n6/ Lẩu Bò Lá Giang [1]\n7/ Trái Cây/ Tàu Hủ Lạnh/ Bánh Bò Thốt Nốt [1]",
  'Set menu 6': "1/ Gánh Gánh Gồng Gồng (Tôm (10), Thịt Xiên (10), Chả Giò Kim Tiền (10), Chả Vuông) [1]\n2/ Súp Cua Rong Biển (10) [1]\n3/ Bò Nướng Xiên Sốt Mè [2]\n4/ Tôm Cocktail (10) [1]\n5/ Mực Né Chảo Gang [2]\n6/ Lẩu Gà Nấm Shiitake [1]\n7/ Trái Cây/ Tàu Hủ Lạnh/ Bánh Bò Thốt Nốt [1]",
  'Set menu 7': "1/ Gỏi Gà Hoa Chuối [2]\n2/ Cá Chim Chiên Giòn Sốt Mắm Chanh [2]\n3/ Tôm Rang Mắm Phú Quốc (10) [1]\n4/ Bò Lúc Lắc [2]\n5/ Bao Tử Om Tiêu [2]\n6/ Lẩu Riêu Cua Đồng [1]\n7/ Trái Cây/ Tàu Hủ Lạnh/ Bánh Bò Thốt Nốt [1]",
  'Set menu 8': "1/ Gỏi Đu Đủ Đâm & Nạc Nọng Nướng [2]\n2/ Chả Giò Bát Bửu (10) [2]\n3/ Thịt Heo Nướng Xiên [2]\n4/ Hủ Tiếu Áp Chảo Tomyum [2]\n5/ Dã Tràng Xe Cát Biển Đông (5 tôm sú) [2]\n6/ Lẩu Mực Lá É [1]\n7/ Trái Cây/ Tàu Hủ Lạnh/ Bánh Bò Thốt Nốt [1]",
  'Set menu 9': "1/ Chả Giò Kim Tiền (5) [2]\n2/ Giò Heo Muối Hoa Tiêu Xôi Hạt Sen [2]\n3/ Con Gà Cục Tác Lá Chanh [1]\n4/ Tôm Cocktail (10) [1]\n5/ Bê Chao Tỏi [2]\n6/ Lẩu Chua Cay Hải Sản [1]\n7/ Trái Cây/ Tàu Hủ Lạnh/ Bánh Bò Thốt Nốt [1]",
  'Set menu 10': "1/ Sum Vầy [2]\n2/ Gà Nướng King's Grill [1]\n3/ Phá Lấu Bánh Mì [2]\n4/ Tôm Rang Trứng Muối (10) [2]\n5/ Bò Lục Lạc Nướng Than Hoa [2]\n6/ Lẩu Chua Cay Hải Sản [1]\n7/ Trái Cây/ Tàu Hủ Lạnh/ Bánh Bò Thốt Nốt [1]",
  'Set menu 11': "1/ Thịt Nguội [2]\n2/ Chả Giò Kim Tiền (5) [2]\n3/ Bò Nướng Chảo Gang [2]\n4/ Tôm Càng Nướng Phomai (10) [1]\n5/ Giò Heo Muối Hoa Tiêu Xôi Hạt Sen [1]\n6/ Mực Trứng Om Ớt Xiêm Xanh [2]\n7/ Lẩu Gà Nấm Shiitake [1]\n8/ Trái Cây/ Tàu Hủ Lạnh/ Bánh Bò Thốt Nốt [1]",
  'Set menu 12': "1/ Combo Khai Vị: (Chả Đùm Trứng Muối (1), Chả Giò Bát Bửu (10), Phá Lấu Bánh Mì (1)) [1]\n2/ Súp Bào Ngư (10) [1]\n3/ Con Gà Cục Tác Lá Chanh [1]\n4/ Sườn Bò Nướng Tiêu Đen Sốt Salsa [2]\n5/ Cá Chim Om Chanh [2]\n6/ Tôm Cocktail (10) [1]\n7/ Lẩu Sườn Bò Kim Chi [1]\n8/ Trái Cây/ Tàu Hủ Lạnh/ Bánh Bò Thốt Nốt [1]",
  'Set menu 13': "1/ Salad King's Grill [2]\n2/ Thịt Heo Nướng Xiên [2]\n3/ Súp Hải Sản Tomyum (10) [1]\n4/ Gà Om Mía & Xôi Xéo [2]\n5/ Cá Bống Mú Hấp Hongkong [1]\n6/ Tôm Cocktail (10) [1]\n7/ Lẩu Chua Cay Hải Sản [1]\n8/ Trái Cây/ Tàu Hủ Lạnh/ Bánh Bò Thốt Nốt [1]",
  'Set menu 14': "1/ Khói Tây Bắc & Gỏi Đu Đủ Đâm [2]\n2/ Sườn Heo Om Ớt Xiêm Xanh [2]\n3/ Bò Nướng Xiên Sốt Mè [2]\n4/ Tôm Cocktail (10) [1]\n5/ Cá Lăng Nướng Muối Ớt [2]\n6/ Bào Ngư Sốt XO [1]\n7/ Lẩu Gà Nấm Shiitake Thượng Hạng [1]\n8/ Trái Cây/ Tàu Hủ Lạnh/ Bánh Bò Thốt Nốt [1]",
  'Set menu 15': "1/ Combo Khai Vị: Bánh Bèo, Bánh Bột Lọc, Bánh Nậm [1]\n2/ Gỏi Tôm Thịt Hoa Chuối [2]\n3/ Dã Tràng Xe Cát Biển Đông [2]\n4/ Gà Nướng King's Grill [1]\n5/ Bò Né Rau Củ Dầu Hào [2]\n6/ Mực Một Nắng Nướng Sate [2]\n7/ Lẩu Cá Lăng Măng Chua [1]\n8/ Trái Cây/ Tàu Hủ Lạnh/ Bánh Bò Thốt Nốt [1]",
  'Combo couple 1': "1/ Nạc Dăm Heo Nướng Thảo Mộc Sốtchẩm Chéo [1]\n2/ Ba Rọi Xông Khói Nướng Sốt Chua Ngọt [1]\n3/ Xúc Xích Nướng Tiêu [1]\n4/ Salad Dầu Giấm [1]",
  'Combo couple 2': "1/ Lườn Ngỗng Xông Khói Áp Chảo Sốt Tiêu Đen [1]\n2/ Nai Nướng Sốt Chẩm Chéo [1]\n3/ Ba Rọi Heo Nướng Riềng Mẻ [1]\n4/ Salad Dầu Giấm [1]",
  'Combo couple 3': "1/ Bò Mỹ Nướng Sốt Chua Ngọt [1]\n2/ Đùi Gà Nướng Sốt Teriyaki [1]\n3/ Bạch Tuộc Nướng Muối Ớt [1]\n4/ Salad Dầu Giấm [1]",
  'Combo couple 4': "1/ Thăn Ngoại Bò Nướng Thảo Mộc [1]\n2/ Sườn Heo Nướng Sốt Bbq [1]\n3/ Lườn Ngỗng Xông Khói Áp Chảo Sốt Tiêu Đen [1]\n4/ Salad Dầu Giấm [1]",
  'Combo couple 5': "1/ Bò Cuộn Nấm Kim Châm [1]\n2/ Đà Điểu Nướng Thảo Mộc [1]\n3/ Cá Cơm Sông Ôm Trứng [1]\n4/ Salad Dầu Giấm [1]",
  'Combo couple 6': "1/ Thăn Nội Bò Nướng Thảo Mộc [1]\n2/ Thịt Heo Xiên Nướng [1]\n3/ Tôm Nướng Muối Ớt [1]\n4/ Salad Dầu Giấm [1]",
  'Combo couple 7': "1/ Sườn Cừu Nướng Thảo Mộc [1]\n2/ Đùi Gà Nướng Sốt Teriyaki [1]\n3/ Ba Rọi Bò Mỹ Nướng Sốt Cay [1]\n4/ Salad Dầu Giấm [1]",
  'Combo couple 8': "1/ Dẻ Sườn Bò Mỹ Nướng Thảo Mộc [1]\n2/ Vú Heo Nướng Chao [1]\n3/ Bạch Tuộc Nướng Sa Tế [1]\n4/ Salad Dầu Giấm [1]",
  'Combo couple 9': "1/ Bò Lúc Lắc [1]\n2/ Sườn Heo Nướng Sốt Bbq [1]\n3/ Mực Một Nắng Nướng Muối Ớt [1]\n4/ Salad Dầu Giấm [1]",
  'Combo couple 10': "1/ Sườn Cừu Nướng Thảo Mộc [1]\n2/ Thăn Ngoại Bò Nướng Thảo Mộc [1]\n3/ Tôm Nướng Muối Ớt [1]\n4/ Salad Dầu Giấm [1]",
  'Combo couple 11': "1/ Cá Tuyết Áp Chảo Sốt Bơ Chanh [1]\n2/ Thăn Nội Bò Nướng Thảo Mộc [1]\n3/ Lườn Ngỗng Xông Khói Áp Chảo Sốt Tiêu Đen [1]\n4/ Salad Dầu Giấm [1]",
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

# 5. MÓN ĂN (menu_items) & QUY TẮC ĐẶC BIỆT CHO SET MENU / COMBO COUPLE
- CHỈ trích xuất món ăn khách hàng THỰC SỰ ĐẶT / YÊU CẦU trong tin nhắn.
- TUYỆT ĐỐI KHÔNG tự bịa, không tự ý thêm món từ thực đơn nếu khách không yêu cầu. Nếu khách không đặt món, để menu_items = [].
- Trích xuất ĐẦY ĐỦ TẤT CẢ các món ăn được gọi, không bỏ sót món.
- QUY TẮC SET MENU (Set menu 1..15) & COMBO COUPLE (Combo couple 1..11):
  * GIỮ NGUYÊN SỐ ĐỊNH DANH CỦA SET/COMBO TRONG TÊN MÓN: "Set menu 3" -> raw_name = "Set menu 3", matched_name = "Set menu 3", quantity = 1. "Combo couple 5" -> raw_name = "Combo couple 5", matched_name = "Combo couple 5", quantity = 1.
  * TUYỆT ĐỐI KHÔNG tách con số định danh của Set/Combo làm quantity! Ví dụ: "Set menu 3" là Set số 3 với quantity = 1 (KHÔNG PHẢI "Set menu 1" với quantity = 3!). "2 Set menu 3" hoặc "Set menu 3 (2 bàn)" hoặc "Set menu 3 x2" mới có quantity = 2 và tên món là "Set menu 3".
  * Khi khách gọi Set menu hoặc Combo couple kèm theo danh sách các món thành phần bên dưới (ví dụ các dòng "1/ ... [1]", "2/ ... [2]", ...): TUYỆT ĐỐI KHÔNG tách các món thành phần của Set/Combo thành các món lẻ độc lập trong menu_items! Chỉ trả về 1 phần tử duy nhất cho Set menu / Combo couple đó.
  * Nếu khách có yêu cầu đổi món hoặc ghi chú riêng trong Set (vd: "đổi lẩu chua cay thành lẩu nấm"), ghi yêu cầu đó vào trường note của Set menu.
- raw_name: Tên món thô trong tin nhắn (xử lý dính chữ: "6hàu" -> 6 hàu, "mì xào2" -> 2 mì xào, nhưng giữ nguyên "Set menu 2", "Combo couple 3").
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

export const SINGLE_PASS_VISION_PROMPT = `
# SYSTEM ROLE: MULTIMODAL BOOKING EXTRACTION EXPERT (KING'S GRILL)
Nhiệm vụ: Phân tích trực tiếp hình ảnh (Ảnh chụp tin nhắn chat, Hóa đơn thanh toán, Giấy cọc ngân hàng, Bảng thông tin đặt bàn, Thực đơn viết tay/in) và trích xuất TOÀN BỘ thông tin đặt bàn thành cấu trúc JSON chuẩn mực DUY NHẤT trong 1 lượt (Single-Pass).

# QUY TẮC PHÂN TÍCH:
1. OCR_RAW_TEXT:
   - Đọc và ghi lại nguyên văn toàn bộ nội dung chữ có trong ảnh vào trường "ocr_raw_text" (giữ nguyên xuống dòng \\n) để nhân viên đối chiếu.
2. CUSTOMER:
   - name: Tên người đặt bàn chính (tách bỏ tiền tố Chị/Anh/C./A./Em/Khách hàng). KHÔNG lấy tên chủ tiệc/bé sinh nhật hay tên nhân viên làm tên khách.
   - phone: Số điện thoại di động VN (10 số).
3. BOOKING:
   - event_date (hoặc date): Ngày tổ chức dạng DD/MM/YYYY.
   - event_time (hoặc time): Giờ tiệc dạng HH:mm (24h).
   - guest_count: Tổng số khách (người lớn + trẻ em).
   - table_count: Số lượng bàn nếu có.
   - table_number (hoặc tables): Mã bàn (ví dụ: A1, C5, VIP2).
   - need: Nhu cầu tiệc ("Sinh nhật", "Thôi nôi (1st)", "Ăn thường", "Công ty", "Liên hoan", "Kỉ niệm", "Cưới/Báo hỷ").
4. PARTY & DECOR:
   - owner_name: Tên chủ tiệc / bé mừng sinh nhật (ví dụ: "Bé Bắp", "Thiên Hào").
   - decor_color: Tông màu trang trí (ví dụ: "Hồng pastel", "Xanh dương", "Trắng kem").
   - display_board_text: Chữ in trên bảng tên mừng (ví dụ: "Happy 1st Birthday Bé Bắp").
   - mirror_board_text: Chữ viết gương chào mừng.
   - special_request: Dặn dò trang trí, bóng bay, hoa tươi, backdrop.
   - seating_preference: Yêu cầu chỗ ngồi, ghế em bé, phòng VIP, khu vực.
   - dietary_notes: Yêu cầu khẩu vị (không cay, ít cay, không hành, ăn chay, dị ứng).
5. DEPOSIT:
   - amount: Số tiền cọc dạng số nguyên (ví dụ: 500000, 1000000) hoặc null nếu không có.
   - status: "đã cọc" nếu giao dịch thành công / đã nhận tiền; "chờ cọc" nếu chưa chuyển; "" nếu không đề cập.
   - bank_ref: Mã giao dịch hoặc nội dung chuyển khoản.
6. MENU_ITEMS:
   - Trích xuất TOÀN BỘ món ăn/đồ uống được đặt: [{ "raw_name": string, "matched_name": string, "quantity": number, "unit_price": number, "note": string }]
   - Tuyệt đối KHÔNG đưa tên người hoặc chi tiết trang trí vào menu_items.
7. NOTE:
   - Tổng hợp mạch lạc mọi lưu ý về khẩu vị, chỗ ngồi, trang trí và dặn dò bếp/phục vụ.

Trả về DUY NHẤT chuỗi JSON hợp lệ theo cấu trúc:
{
  "ocr_raw_text": string,
  "customer": { "name": string, "phone": string, "confidence": number },
  "booking": { "event_date": string, "event_time": string, "date": string, "time": string, "guest_count": number | null, "table_count": number | null, "table_number": string, "tables": string, "need": string, "confidence": number },
  "party": { "type": string, "owner_name": string, "decor_color": string, "display_board_text": string, "mirror_board_text": string, "special_request": string, "seating_preference": string, "dietary_notes": string, "confidence": number },
  "deposit": { "amount": number | null, "status": string, "bank_ref": string },
  "menu_items": Array<{ "raw_name": string, "matched_name": string, "quantity": number, "unit_price": number, "note": string }>,
  "note": string,
  "needs_review": string[],
  "warnings": []
}
KHÔNG giải thích, KHÔNG bọc markdown \`\`\`json.
`

