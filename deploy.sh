#!/bin/bash

# Deploy Script para Produção
# Execute: chmod +x deploy.sh && ./deploy.sh

echo "🚀 Starting production deploy..."

# Verificar se estamos na branch main
if [ "$(git branch --show-current)" != "main" ]; then
    echo "❌ Please switch to main branch first"
    exit 1
fi

# Build do frontend
echo "📦 Building frontend..."
cd packages/frontend
npm run build
cd ../..

# Build do backend
echo "📦 Building backend..."
cd packages/backend
npm run build
cd ../..

# Commit das mudanças
echo "💾 Committing changes..."
git add .
git commit -m "Production deploy: $(date)"
git push origin main

echo "✅ Deploy completed!"
echo "🔗 Check your deployments:"
echo "   - Frontend: https://vercel.com/dashboard"
echo "   - Backend: https://railway.app/dashboard"
