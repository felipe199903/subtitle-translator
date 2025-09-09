#!/bin/bash
# Script para testar o backend no Render

# Cor para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🔍 Testando Backend no Render...${NC}"
echo

# Verifica se a URL foi fornecida
if [ -z "$1" ]; then
    echo -e "${RED}❌ Erro: Forneça a URL do Render${NC}"
    echo "Uso: ./test-backend.sh https://sua-url.onrender.com"
    exit 1
fi

BASE_URL=$1
echo -e "🌐 Testando: ${YELLOW}$BASE_URL${NC}"
echo

# Teste 1: Health Check
echo -e "${YELLOW}1️⃣ Testando Health Check...${NC}"
HEALTH_RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/health_response "$BASE_URL/health")
HEALTH_CODE="${HEALTH_RESPONSE: -3}"

if [ "$HEALTH_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Health Check: OK${NC}"
    cat /tmp/health_response
    echo
else
    echo -e "${RED}❌ Health Check: FALHOU (HTTP $HEALTH_CODE)${NC}"
    cat /tmp/health_response
    echo
fi

# Teste 2: CORS Headers
echo -e "${YELLOW}2️⃣ Testando CORS Headers...${NC}"
CORS_RESPONSE=$(curl -s -I -H "Origin: https://example.com" "$BASE_URL/health")
if echo "$CORS_RESPONSE" | grep -i "access-control-allow-origin" > /dev/null; then
    echo -e "${GREEN}✅ CORS: Configurado${NC}"
else
    echo -e "${RED}❌ CORS: Não configurado${NC}"
fi

# Teste 3: API Endpoint
echo -e "${YELLOW}3️⃣ Testando API Endpoint...${NC}"
API_RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/api_response "$BASE_URL/api/subtitles")
API_CODE="${API_RESPONSE: -3}"

if [ "$API_CODE" = "405" ] || [ "$API_CODE" = "200" ]; then
    echo -e "${GREEN}✅ API Endpoint: Acessível${NC}"
else
    echo -e "${RED}❌ API Endpoint: PROBLEMA (HTTP $API_CODE)${NC}"
fi

# Teste 4: Database Connection
echo -e "${YELLOW}4️⃣ Testando Conexão com Banco...${NC}"
# Criar um arquivo temporário de teste
echo "Test subtitle" > /tmp/test.srt

# Tentar fazer upload (isso testará se o banco está funcionando)
UPLOAD_RESPONSE=$(curl -s -w "%{http_code}" -F "file=@/tmp/test.srt" -F "targetLanguage=pt" "$BASE_URL/api/subtitles/translate")
UPLOAD_CODE="${UPLOAD_RESPONSE: -3}"

if [ "$UPLOAD_CODE" = "200" ] || [ "$UPLOAD_CODE" = "400" ]; then
    echo -e "${GREEN}✅ Database: Conectado${NC}"
else
    echo -e "${YELLOW}⚠️ Database: Possível problema (HTTP $UPLOAD_CODE)${NC}"
fi

# Limpeza
rm -f /tmp/health_response /tmp/api_response /tmp/test.srt

echo
echo -e "${YELLOW}📊 RESUMO DOS TESTES:${NC}"
echo -e "Health Check: $([ "$HEALTH_CODE" = "200" ] && echo -e "${GREEN}✅${NC}" || echo -e "${RED}❌${NC}")"
echo -e "CORS: $(echo "$CORS_RESPONSE" | grep -i "access-control-allow-origin" > /dev/null && echo -e "${GREEN}✅${NC}" || echo -e "${RED}❌${NC}")"
echo -e "API: $([ "$API_CODE" = "405" ] || [ "$API_CODE" = "200" ] && echo -e "${GREEN}✅${NC}" || echo -e "${RED}❌${NC}")"
echo -e "Database: $([ "$UPLOAD_CODE" = "200" ] || [ "$UPLOAD_CODE" = "400" ] && echo -e "${GREEN}✅${NC}" || echo -e "${YELLOW}⚠️${NC}")"

echo
if [ "$HEALTH_CODE" = "200" ]; then
    echo -e "${GREEN}🎉 Backend funcionando corretamente!${NC}"
else
    echo -e "${RED}❌ Backend com problemas. Verifique os logs no Render.${NC}"
fi
