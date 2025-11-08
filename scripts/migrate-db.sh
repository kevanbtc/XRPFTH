#!/bin/bash

# FTH Program - Database Migration Script
# Applies schema changes and regenerates Prisma client

echo "🔄 FTH Database Migration Script"
echo "================================"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable is not set"
  echo "Please set it in your .env file"
  exit 1
fi

echo "📋 Step 1: Creating migration..."
npx prisma migrate dev --name add_usdf_nft_banking_por --create-only

echo ""
echo "📋 Step 2: Applying migration..."
npx prisma migrate deploy

echo ""
echo "📋 Step 3: Generating Prisma Client..."
npx prisma generate

echo ""
echo "✅ Migration complete!"
echo ""
echo "Summary of changes:"
echo "  - Added USDF balance tracking to Member model"
echo "  - Added MembershipNFT model for XRPL NFTs"
echo "  - Added USBankAccount model for US banking"
echo "  - Added PorSnapshot model for reserve tracking"
echo "  - Enhanced LedgerTransaction with metadata"
echo "  - Enhanced GoldOrder with discounts and USDF usage"
echo ""
