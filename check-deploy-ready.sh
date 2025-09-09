#!/bin/bash

# Pre-deploy Check Script
echo "🔍 Checking project readiness for production deploy..."

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "packages" ]; then
    echo "❌ Please run this from the root project directory"
    exit 1
fi

echo "✅ Project structure OK"

# Check if backend files exist
if [ ! -f "packages/backend/railway.json" ]; then
    echo "❌ Missing packages/backend/railway.json"
    exit 1
fi

if [ ! -f "packages/backend/Procfile" ]; then
    echo "❌ Missing packages/backend/Procfile"
    exit 1
fi

echo "✅ Backend config files OK"

# Check if frontend files exist
if [ ! -f "packages/frontend/vercel.json" ]; then
    echo "❌ Missing packages/frontend/vercel.json"
    exit 1
fi

if [ ! -f "packages/frontend/src/environments/environment.prod.ts" ]; then
    echo "❌ Missing production environment file"
    exit 1
fi

echo "✅ Frontend config files OK"

# Check if builds work
echo "📦 Testing builds..."

cd packages/frontend
npm run build > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "❌ Frontend build failed"
    exit 1
fi
cd ../..

cd packages/backend
npm run build > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "❌ Backend build failed"  
    exit 1
fi
cd ../..

echo "✅ Both builds successful"

# Check git status
if [ -n "$(git status --porcelain)" ]; then
    echo "⚠️  You have uncommitted changes"
    git status --short
    echo "💡 Tip: Commit your changes before deploying"
else
    echo "✅ Git status clean"
fi

echo ""
echo "🎉 Project is ready for production deploy!"
echo ""
echo "Next steps:"
echo "1. Deploy backend to Railway: https://railway.app"
echo "2. Update environment.prod.ts with Railway URL"
echo "3. Deploy frontend to Vercel: https://vercel.com"  
echo "4. Update CORS in Railway with Vercel URL"
echo ""
echo "💰 Estimated cost: ~$5/month"
echo "⏱️  Estimated time: ~15 minutes"
