# Interactive Deployment Script for Cloudflare Worker AI Gateway
# Usage: .\scripts\deploy-cloudflare.ps1

Write-Host "=== Cloudflare Worker AI Gateway Deployer ===" -ForegroundColor Cyan
Write-Host "This script will help you deploy the AI Gateway and configure API keys." -ForegroundColor Green
Write-Host ""

# Check wrangler CLI
if (!(Get-Command npx -ErrorAction SilentlyContinue)) {
    Write-Host "npx is required but not found. Please install Node.js." -ForegroundColor Red
    exit 1
}

# 1. Login check
Write-Host "Checking Cloudflare credentials..." -ForegroundColor Yellow
npx wrangler whoami
if ($LASTEXITCODE -ne 0) {
    Write-Host "You are not logged in to Cloudflare. Opening login page..." -ForegroundColor Red
    npx wrangler login
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Cloudflare login failed or cancelled." -ForegroundColor Red
        exit 1
    }
}

# 2. Deploy Worker
Write-Host "Deploying Cloudflare Edge Worker..." -ForegroundColor Yellow
cd workers/ai-gateway
npx wrangler deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host "Deployment failed. Please check workers/ai-gateway/wrangler.toml configuration." -ForegroundColor Red
    cd ../..
    exit 1
}
cd ../..

Write-Host "Cloudflare Worker deployed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Would you like to set or update API keys in Cloudflare Secrets? (y/n)"
$choice = Read-Host
if ($choice.ToLower() -eq 'y') {
    Write-Host "Input API Key for Google Gemini (press Enter to skip):"
    $gemini = Read-Host
    if ($gemini) {
        $gemini | npx wrangler secret put GEMINI_API_KEY --project ai-gateway
    }

    Write-Host "Input API Key for Groq (press Enter to skip):"
    $groq = Read-Host
    if ($groq) {
        $groq | npx wrangler secret put GROQ_API_KEY --project ai-gateway
    }

    Write-Host "Input API Key for OpenRouter (press Enter to skip):"
    $openrouter = Read-Host
    if ($openrouter) {
        $openrouter | npx wrangler secret put OPENROUTER_API_KEY --project ai-gateway
    }
}

Write-Host "Setup completed successfully!" -ForegroundColor Green
