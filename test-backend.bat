@echo off
REM Script para testar o backend no Render (Windows)

echo 🔍 Testando Backend no Render...
echo.

if "%1"=="" (
    echo ❌ Erro: Forneça a URL do Render
    echo Uso: test-backend.bat https://sua-url.onrender.com
    exit /b 1
)

set BASE_URL=%1
echo 🌐 Testando: %BASE_URL%
echo.

REM Teste 1: Health Check
echo 1️⃣ Testando Health Check...
curl -s %BASE_URL%/health
if %errorlevel% equ 0 (
    echo ✅ Health Check: OK
) else (
    echo ❌ Health Check: FALHOU
)
echo.

REM Teste 2: API Endpoint
echo 2️⃣ Testando API Endpoint...
curl -s -I %BASE_URL%/api/subtitles
if %errorlevel% equ 0 (
    echo ✅ API Endpoint: Acessível
) else (
    echo ❌ API Endpoint: PROBLEMA
)
echo.

REM Teste 3: CORS
echo 3️⃣ Testando CORS...
curl -s -H "Origin: https://example.com" -I %BASE_URL%/health
echo ✅ CORS testado (verifique output acima)
echo.

echo 📊 TESTES CONCLUÍDOS
echo.
echo 💡 Para testes mais detalhados, acesse:
echo 🔗 %BASE_URL%/health
echo 🔗 %BASE_URL%/api/subtitles
echo.
echo 🎉 Se os endpoints respondem, o backend está funcionando!
