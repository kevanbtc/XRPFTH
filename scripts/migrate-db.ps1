# FTH Program - Database Migration Script (PowerShell)
# Applies schema changes and regenerates Prisma client

Write-Host "🔄 FTH Database Migration Script" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check if DATABASE_URL is set
if (-not $env:DATABASE_URL) {
  Write-Host "❌ ERROR: DATABASE_URL environment variable is not set" -ForegroundColor Red
  Write-Host "Please set it in your .env file" -ForegroundColor Yellow
  exit 1
}

Write-Host "📋 Step 1: Creating migration..." -ForegroundColor Yellow
npx prisma migrate dev --name add_usdf_nft_banking_por --create-only

Write-Host ""
Write-Host "📋 Step 2: Applying migration..." -ForegroundColor Yellow
npx prisma migrate deploy

Write-Host ""
Write-Host "📋 Step 3: Generating Prisma Client..." -ForegroundColor Yellow
npx prisma generate

Write-Host ""
Write-Host "✅ Migration complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Summary of changes:" -ForegroundColor Cyan
Write-Host "  - Added USDF balance tracking to Member model"
Write-Host "  - Added MembershipNFT model for XRPL NFTs"
Write-Host "  - Added USBankAccount model for US banking"
Write-Host "  - Added PorSnapshot model for reserve tracking"
Write-Host "  - Enhanced LedgerTransaction with metadata"
Write-Host "  - Enhanced GoldOrder with discounts and USDF usage"
Write-Host ""
