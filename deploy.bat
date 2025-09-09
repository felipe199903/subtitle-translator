@echo off
REM Deploy Script para Windows
REM Execute: deploy.bat

echo 🚀 Starting production deploy...

REM Verificar se estamos na branch main
git branch --show-current > current_branch.tmp
set /p current_branch=<current_branch.tmp
del current_branch.tmp

if not "%current_branch%"=="main" (
    echo ❌ Please switch to main branch first
    exit /b 1
)

REM Build do frontend
echo 📦 Building frontend...
cd packages\frontend
call npm run build
cd ..\..

REM Build do backend
echo 📦 Building backend...
cd packages\backend
call npm run build
cd ..\..

REM Commit das mudanças
echo 💾 Committing changes...
git add .
git commit -m "Production deploy: %date% %time%"
git push origin main

echo ✅ Deploy completed!
echo 🔗 Check your deployments:
echo    - Frontend: https://vercel.com/dashboard  
echo    - Backend: https://railway.app/dashboard
