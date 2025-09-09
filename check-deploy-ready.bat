@echo off
REM Pre-deploy Check Script for Windows

echo 🔍 Checking project readiness for production deploy...

REM Check if we're in the right directory
if not exist "package.json" (
    echo ❌ Please run this from the root project directory
    exit /b 1
)

if not exist "packages" (
    echo ❌ Please run this from the root project directory
    exit /b 1
)

echo ✅ Project structure OK

REM Check backend files
if not exist "packages\backend\railway.json" (
    echo ❌ Missing packages/backend/railway.json
    exit /b 1
)

if not exist "packages\backend\Procfile" (
    echo ❌ Missing packages/backend/Procfile
    exit /b 1
)

echo ✅ Backend config files OK

REM Check frontend files
if not exist "packages\frontend\vercel.json" (
    echo ❌ Missing packages/frontend/vercel.json
    exit /b 1
)

if not exist "packages\frontend\src\environments\environment.prod.ts" (
    echo ❌ Missing production environment file
    exit /b 1
)

echo ✅ Frontend config files OK

REM Test builds
echo 📦 Testing builds...

cd packages\frontend
call npm run build >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Frontend build failed
    exit /b 1
)
cd ..\..

cd packages\backend  
call npm run build >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Backend build failed
    exit /b 1
)
cd ..\..

echo ✅ Both builds successful

echo.
echo 🎉 Project is ready for production deploy!
echo.
echo Next steps:
echo 1. Deploy backend to Railway: https://railway.app
echo 2. Update environment.prod.ts with Railway URL  
echo 3. Deploy frontend to Vercel: https://vercel.com
echo 4. Update CORS in Railway with Vercel URL
echo.
echo 💰 Estimated cost: ~$5/month
echo ⏱️  Estimated time: ~15 minutes
