# FTH Program - Quick Start Deployment Script (PowerShell)
# Sets up complete development environment

Write-Host "🚀 FTH Program - Quick Start Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Host "📋 Checking prerequisites..." -ForegroundColor Yellow
Write-Host ""

# Check Node.js
$nodeVersion = node --version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Node.js not found. Please install Node.js 18+ first." -ForegroundColor Red
    exit 1
}
Write-Host "✅ Node.js: $nodeVersion" -ForegroundColor Green

# Check Docker
$dockerVersion = docker --version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker not found. Please install Docker Desktop first." -ForegroundColor Red
    exit 1
}
Write-Host "✅ Docker: $dockerVersion" -ForegroundColor Green

# Check Docker Compose
$composeVersion = docker-compose --version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker Compose not found. Please install Docker Compose first." -ForegroundColor Red
    exit 1
}
Write-Host "✅ Docker Compose: $composeVersion" -ForegroundColor Green

Write-Host ""

# Step 1: Environment Setup
Write-Host "📦 Step 1: Setting up environment..." -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
    Write-Host "Creating .env from template..." -ForegroundColor Cyan
    Copy-Item ".env.example" ".env"
    Write-Host "✅ .env file created. Please update with your credentials." -ForegroundColor Green
    Write-Host "⚠️  IMPORTANT: Update DATABASE_URL, XRPL seeds, and API keys!" -ForegroundColor Yellow
} else {
    Write-Host "✅ .env file already exists" -ForegroundColor Green
}

Write-Host ""

# Step 2: Install Dependencies
Write-Host "📦 Step 2: Installing dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ npm install failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Dependencies installed" -ForegroundColor Green

Write-Host ""

# Step 3: Start Docker Services
Write-Host "🐳 Step 3: Starting Docker services..." -ForegroundColor Yellow
docker-compose up -d postgres redis
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to start Docker services" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Docker services started" -ForegroundColor Green

Write-Host ""
Write-Host "⏳ Waiting for database to be ready..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

Write-Host ""

# Step 4: Database Migration
Write-Host "🗄️ Step 4: Running database migrations..." -ForegroundColor Yellow
npx prisma migrate dev --name init
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Database migration failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Database migrated" -ForegroundColor Green

Write-Host ""

# Step 5: Generate Prisma Client
Write-Host "🔧 Step 5: Generating Prisma Client..." -ForegroundColor Yellow
npx prisma generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Prisma client generation failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Prisma Client generated" -ForegroundColor Green

Write-Host ""

# Step 6: Seed Database (Optional)
Write-Host "🌱 Step 6: Seeding database with test data..." -ForegroundColor Yellow
$seedChoice = Read-Host "Seed database with test data? (y/n)"
if ($seedChoice -eq "y") {
    npm run seed
    if ($LASTEXITCODE -ne 0) {
        Write-Host "⚠️  Seed failed, but continuing..." -ForegroundColor Yellow
    } else {
        Write-Host "✅ Database seeded" -ForegroundColor Green
    }
} else {
    Write-Host "⏭️  Skipping database seed" -ForegroundColor Cyan
}

Write-Host ""

# Step 7: Build Application
Write-Host "🏗️ Step 7: Building application..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Application built" -ForegroundColor Green

Write-Host ""

# Deployment Complete
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "🎯 Next Steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Review and update .env file with your credentials" -ForegroundColor White
Write-Host "2. Start the API server:" -ForegroundColor White
Write-Host "   npm run dev" -ForegroundColor Cyan
Write-Host ""
Write-Host "3. Start the cron scheduler:" -ForegroundColor White
Write-Host "   npm run cron" -ForegroundColor Cyan
Write-Host ""
Write-Host "4. Access services:" -ForegroundColor White
Write-Host "   API:       http://localhost:3000" -ForegroundColor Cyan
Write-Host "   PgAdmin:   http://localhost:5050" -ForegroundColor Cyan
Write-Host "   Prometheus: http://localhost:9090" -ForegroundColor Cyan
Write-Host "   Grafana:   http://localhost:3001" -ForegroundColor Cyan
Write-Host ""
Write-Host "5. View logs:" -ForegroundColor White
Write-Host "   docker-compose logs -f api" -ForegroundColor Cyan
Write-Host ""
Write-Host "6. Run tests:" -ForegroundColor White
Write-Host "   npm test" -ForegroundColor Cyan
Write-Host ""

Write-Host "📚 Documentation:" -ForegroundColor Yellow
Write-Host "   README.md" -ForegroundColor Cyan
Write-Host "   docs/FLOWCHARTS_AND_DIAGRAMS.md" -ForegroundColor Cyan
Write-Host "   docs/INVESTOR_MEMO.md" -ForegroundColor Cyan
Write-Host "   docs/WEBSITE_PRD_FOR_SPARK.md" -ForegroundColor Cyan
Write-Host ""

Write-Host "🚀 Happy building!" -ForegroundColor Green
