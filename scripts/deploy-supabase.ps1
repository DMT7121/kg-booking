# Interactive Supabase Setup & Deployment Script
# Usage: .\scripts\deploy-supabase.ps1

Write-Host "=== KING'S GRILL - Supabase Setup & Migration Tool ===" -ForegroundColor Cyan
Write-Host "Huong dan thiet lap nhanh Supabase PostgreSQL" -ForegroundColor Green
Write-Host ""

$envFile = ".env"

Write-Host "1. Neu ban chua co Supabase Project, hay thuc hien 3 buoc nhanh sau (1 phut):" -ForegroundColor Yellow
Write-Host "   a) Truy cap: https://supabase.com/dashboard va bam 'New Project'" -ForegroundColor White
Write-Host "   b) Dat ten Project: 'kg-booking' va chon Password" -ForegroundColor White
Write-Host "   c) Vao Project Settings -> API de lay Project URL va anon/public Key" -ForegroundColor White
Write-Host ""

$supabaseUrl = Read-Host "Nhap Supabase Project URL (vi du: https://xyz.supabase.co, bam Enter de bo qua)"
$supabaseAnonKey = Read-Host "Nhap Supabase Anon Key (eyJ..., bam Enter de bo qua)"

if ($supabaseUrl -and $supabaseAnonKey) {
    Write-Host "Cap nhat .env..." -ForegroundColor Yellow
    
    $envContent = Get-Content $envFile -Raw
    if ($envContent -match "VITE_SUPABASE_URL=") {
        $envContent = $envContent -replace "VITE_SUPABASE_URL=.*", "VITE_SUPABASE_URL=$supabaseUrl"
    } else {
        $envContent += "`nVITE_SUPABASE_URL=$supabaseUrl"
    }

    if ($envContent -match "VITE_SUPABASE_ANON_KEY=") {
        $envContent = $envContent -replace "VITE_SUPABASE_ANON_KEY=.*", "VITE_SUPABASE_ANON_KEY=$supabaseAnonKey"
    } else {
        $envContent += "`nVITE_SUPABASE_ANON_KEY=$supabaseAnonKey"
    }

    if ($envContent -match "VITE_BACKEND_MODE=") {
        $envContent = $envContent -replace "VITE_BACKEND_MODE=.*", "VITE_BACKEND_MODE=dual_write"
    } else {
        $envContent += "`nVITE_BACKEND_MODE=dual_write"
    }

    Set-Content $envFile $envContent
    Write-Host "Da cap nhat file .env thanh cong voi Backend Mode = dual_write!" -ForegroundColor Green
}

Write-Host ""
Write-Host "2. Migration SQL Scripts:" -ForegroundColor Yellow
Write-Host "   Tat ca file SQL tao bang va phan quyen (RLS) da duoc tao san tai:" -ForegroundColor White
Write-Host "   - supabase/migrations/001_initial_schema.sql" -ForegroundColor Cyan
Write-Host "   - supabase/migrations/002_rls_policies.sql" -ForegroundColor Cyan
Write-Host "   - supabase/migrations/003_d1_schema.sql (cho Cloudflare D1)" -ForegroundColor Cyan
Write-Host ""
Write-Host "Ban chi can vao Supabase Dashboard -> SQL Editor, copy va chay noi dung 2 file 001 & 002 tren la xong!" -ForegroundColor Green
Write-Host ""
