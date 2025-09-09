# 🚀 Guia de Deploy para Produção - Menor Custo

## 🎯 Opções de Deploy Recomendadas (Do Mais Barato ao Mais Caro)

### 💰 **OPÇÃO 1: Vercel + Railway (RECOMENDADA - ~$5-10/mês)**

#### Frontend na Vercel (GRATUITO)
- ✅ **Vantagens**: Deploy automático, CDN global, SSL gratuito, domínio .vercel.app
- ✅ **Limites gratuitos**: 100GB bandwidth/mês, deploys ilimitados
- ✅ **Perfeito para**: Angular SSR/SPA

#### Backend na Railway (~$5/mês)
- ✅ **Vantagens**: $5/mês fixo, deploy automático, domínio HTTPS
- ✅ **Recursos**: 512MB RAM, 1GB storage, ~$5 fixo
- ✅ **Perfeito para**: Node.js + SQLite

### 💰 **OPÇÃO 2: Vercel Full-Stack (~$20/mês)**
- Frontend + Backend na Vercel Pro
- Mais caro mas tudo integrado

### 💰 **OPÇÃO 3: VPS (~$5-15/mês)**
- DigitalOcean, Linode, Vultr
- Mais trabalho de configuração

---

## 🔧 **IMPLEMENTAÇÃO - OPÇÃO 1 (RECOMENDADA)**

### 📋 **Preparação do Projeto**

#### 1. Configurar Backend para Railway

✅ Já criados os arquivos necessários:
- `packages/backend/railway.json` - Configuração Railway
- `packages/backend/Procfile` - Comando de start
- `packages/backend/.env.example` - Variáveis de ambiente

#### 2. Configurar Frontend para Vercel

✅ Já criados os arquivos necessários:
- `packages/frontend/vercel.json` - Configuração Vercel
- `packages/frontend/src/environments/environment.prod.ts` - URL da API

---

## 🚀 **PASSOS DE DEPLOY**

### **ETAPA 1: Deploy do Backend (Railway)**

1. **Acesse Railway.app** e faça login com GitHub
2. **New Project** → **Deploy from GitHub repo**
3. **Conecte** este repositório
4. **Configure** as variáveis de ambiente:
   ```
   NODE_ENV=production
   PORT=3001
   FRONTEND_URL=https://seu-app.vercel.app
   DB_PATH=./tm.db
   ```
5. **Deploy automático** será iniciado
6. **Anote a URL** gerada (ex: `https://seu-backend.railway.app`)

### **ETAPA 2: Atualizar Frontend com URL do Backend**

1. **Edite** `packages/frontend/src/environments/environment.prod.ts`:
   ```typescript
   export const environment = {
     production: true,
     apiUrl: 'https://SEU-BACKEND.railway.app/api/subtitles'
   };
   ```

2. **Commit** as mudanças:
   ```bash
   git add .
   git commit -m "Configure production API URL"
   git push origin main
   ```

### **ETAPA 3: Deploy do Frontend (Vercel)**

1. **Acesse Vercel.com** e faça login com GitHub
2. **New Project** → **Import Git Repository**
3. **Selecione** este repositório
4. **Configure** o projeto:
   - **Framework Preset**: Angular
   - **Root Directory**: `packages/frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist/frontend`
5. **Deploy!**

### **ETAPA 4: Configurar CORS (Final)**

1. **Anote a URL Vercel** (ex: `https://seu-app.vercel.app`)
2. **Vá para Railway** → Variables → Edite:
   ```
   FRONTEND_URL=https://sua-url-vercel.vercel.app
   ```
3. **Redeploy** do backend acontecerá automaticamente

---

## 💰 **CUSTOS ESTIMADOS**

### **Opção Recomendada: Vercel + Railway**
- **Frontend (Vercel)**: 🆓 **GRATUITO**
  - 100GB bandwidth/mês
  - Deploys ilimitados
  - SSL + CDN inclusos
  
- **Backend (Railway)**: 💵 **$5/mês**
  - 512MB RAM
  - 1GB storage
  - Domínio HTTPS
  - Deploy automático

**TOTAL: ~$5/mês** 🎉

### **Comparação com Outras Opções**
- **Vercel Pro (Full-stack)**: $20/mês
- **Heroku**: $7-25/mês 
- **DigitalOcean VPS**: $6-12/mês + configuração
- **AWS/Azure**: $10-30/mês + complexidade

---

## 🔧 **SCRIPTS DE DEPLOY AUTOMÁTICO**

✅ Criados scripts para facilitar deploys futuros:

### **Para Linux/Mac:**
```bash
chmod +x deploy.sh
./deploy.sh
```

### **Para Windows:**
```batch
deploy.bat
```

---

## 🎯 **RESUMO RÁPIDO**

### **Para começar AGORA:**

1. **Crie conta gratuita** em [Railway.app](https://railway.app)
2. **Deploy o backend** → New Project → GitHub → Selecione este repo
3. **Configure env vars** no Railway:
   ```
   NODE_ENV=production
   FRONTEND_URL=https://seu-app.vercel.app
   ```
4. **Anote a URL** do Railway (ex: `https://app.railway.app`)
5. **Edite** `packages/frontend/src/environments/environment.prod.ts` com a URL
6. **Crie conta gratuita** em [Vercel.com](https://vercel.com)  
7. **Deploy o frontend** → New Project → GitHub → `packages/frontend`
8. **Anote URL Vercel** e atualize `FRONTEND_URL` no Railway

### **Custo Total: ~$5/mês** 💰

---

## 🆘 **SUPORTE E PROBLEMAS COMUNS**

### **CORS Error**
- Verifique se `FRONTEND_URL` no Railway está correto
- Aguarde alguns minutos após mudança (cache)

### **API não conecta**  
- Verifique se URL em `environment.prod.ts` está correta
- Teste `https://seu-backend.railway.app/health`

### **Build falha**
- Verifique se Node.js version é compatível
- Limpe cache: `npm cache clean --force`

### **Upload não funciona**
- Railway tem limite de 100MB por request
- Para arquivos maiores, considere implementar chunked upload

---

## 🚀 **PRÓXIMAS MELHORIAS**

1. **Domínio personalizado** (+ $12/ano)
2. **Monitoramento** com Sentry/LogRocket  
3. **Backup automático** do banco
4. **CDN** para uploads grandes
5. **Cache Redis** para performance

---

**💡 TIP: Comece com Railway + Vercel gratuito, upgrade conforme necessário!**

**🎉 Seu app estará online em ~15 minutos!** ⚡
