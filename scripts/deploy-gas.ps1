# Helper script to deploy and configure Google Apps Script (GAS) on Google Sheets
# Usage: .\scripts\deploy-gas.ps1

Write-Host "=== Google Apps Script (GAS) Deployment Guide ===" -ForegroundColor Cyan
Write-Host "Because Google Apps Script uses Google's web-based editor, follow these steps to configure it:" -ForegroundColor Green
Write-Host ""
Write-Host "Step 1: Open your Google Sheet." -ForegroundColor Yellow
Write-Host "Step 2: Go to Extensions -> Apps Script." -ForegroundColor Yellow
Write-Host "Step 3: Copy the code from 'gas/Code.js' or the provided GAS server files in this project into the Apps Script editor." -ForegroundColor Yellow
Write-Host "Step 4: Click the Save icon." -ForegroundColor Yellow
Write-Host "Step 5: Click 'Deploy' -> 'New Deployment'." -ForegroundColor Yellow
Write-Host "Step 6: Select type 'Web App', configure Execute as: 'Me' (your email), and Who has access: 'Anyone'." -ForegroundColor Yellow
Write-Host "Step 7: Copy the generated Web App URL." -ForegroundColor Yellow
Write-Host "Step 8: Paste the URL as VITE_GAS_URL in your .env.local file to connect the frontend." -ForegroundColor Yellow
Write-Host ""
Write-Host "Verification:" -ForegroundColor Cyan
Write-Host "Run the following command to test if your local config points to a valid GAS URL:" -ForegroundColor Yellow
Write-Host "Get-Content .env.local | Select-String VITE_GAS_URL" -ForegroundColor White
Write-Host ""
Write-Host "Setup Completed." -ForegroundColor Green
