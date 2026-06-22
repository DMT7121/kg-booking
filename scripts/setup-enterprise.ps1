# Setup Helper Script for King's Grill Booking Enterprise
# Run this script using: .\scripts\setup-enterprise.ps1

Write-Host "=== King's Grill Booking Enterprise Setup Helper ===" -ForegroundColor Cyan
Write-Host "Script nay se huong dan ban thiet lap Cloudflare AI Gateway & Supabase Database." -ForegroundColor Green
Write-Host ""

# 1. Check Cloudflare login status
Write-Host "1. Dang kiem tra dang nhap Cloudflare..." -ForegroundColor Yellow
npx wrangler whoami
if ($LASTEXITCODE -ne 0) {
    Write-Host "Ban chua dang nhap Cloudflare. Vui long chay lenh sau de dang nhap:" -ForegroundColor Red
    Write-Host "npx wrangler login" -ForegroundColor White
    exit 1
}

# 2. Deploy AI Gateway
Write-Host "2. Dang tien hanh deploy Cloudflare AI Gateway..." -ForegroundColor Yellow
cd workers/ai-gateway
npx wrangler deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host "Deploy Edge Worker that bai! Vui long kiem tra wrangler.toml." -ForegroundColor Red
    exit 1
}
cd ../..

# 3. Setup secrets
Write-Host ""
Write-Host "3. Dang cau hinh Secrets (API Keys) cho Cloudflare Worker..." -ForegroundColor Yellow
Write-Host "Luu y: Wrangler se mo trinh duyet hoac nhap tren terminal de luu an toan." -ForegroundColor LightGray

Write-Host "Nhap API Key cho Google Gemini (de trong de bo qua):"
$gemini = Read-Host
if ($gemini) {
    $gemini | npx wrangler secret put GEMINI_API_KEY
}

Write-Host "Nhap API Key cho Groq (de trong de bo qua):"
$groq = Read-Host
if ($groq) {
    $groq | npx wrangler secret put GROQ_API_KEY
}

Write-Host "Nhap API Key cho OpenRouter (de trong de bo qua):"
$openrouter = Read-Host
if ($openrouter) {
    $openrouter | npx wrangler secret put OPENROUTER_API_KEY
}

Write-Host "Nhap Email cua Google Service Account (de trong de bo qua):"
$gEmail = Read-Host
if ($gEmail) {
    $gEmail | npx wrangler secret put GOOGLE_CLIENT_EMAIL
}

Write-Host "Nhap Private Key (PEM) cua Google Service Account (de trong de bo qua):"
$gKey = Read-Host
if ($gKey) {
    $gKey | npx wrangler secret put GOOGLE_PRIVATE_KEY
}

Write-Host ""
Write-Host "=== THIET LAP HOAN TAT! ===" -ForegroundColor Green
Write-Host "Vui long thuc hien nap SQL Schema database tu file:" -ForegroundColor Cyan
Write-Host "[001_initial_schema.sql](file:///f:/kg-booking/supabase/migrations/001_initial_schema.sql) vao Supabase SQL Editor." -ForegroundColor White
