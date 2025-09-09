# ✅ DEPLOY CHECKLIST - Produção

## 🎯 Opções de Deploy:

### 💰 **Railway + Vercel** (~$5/mês) - Sempre ativo  
### 🆓 **Render + Vercel** (GRATUITO) - Hiberna 15min

**👉 Para Railway pago, veja: `DEPLOY-FREE-OPTIONS.md`**

---

## ⚡ DEPLOY RENDER - 100% GRATUITO (10 minutos)

#### 📋 **ETAPA 1: Backend no Render**
- [ ] 1. Acesse [render.com](https://render.com)
- [ ] 2. Login com GitHub  
- [ ] 3. **New** → **Web Service**
- [ ] 4. **Connect Repository** → Selecione este repositório
- [ ] 5. Configure o serviço:
  ```
  Name: subtitle-translator-api
  Branch: main
  Root Directory: packages/backend  
  Runtime: Docker
  Dockerfile Path: render.dockerfile
  ```
- [ ] 6. Adicione variáveis de ambiente:
  ```
  NODE_ENV=production
  FRONTEND_URL=https://seu-app.vercel.app
  DB_PATH=./tm.db
  ```
- [ ] 7. **Create Web Service** e aguarde deploy (~3min)
- [ ] 8. **Anote a URL** gerada (ex: `https://subtitle-translator-api.onrender.com`)

#### 🎨 **ETAPA 2: Frontend na Vercel**  
- [ ] 1. Acesse [vercel.com](https://vercel.com)
- [ ] 2. Login com GitHub
- [ ] 3. **New Project** → **Import Git Repository**
- [ ] 4. Configure:
  - Framework: **Angular**
  - Root Directory: `packages/frontend`
  - Build Command: `npm run build`
  - Output Directory: `dist/frontend`
- [ ] 5. **Deploy!**
- [ ] 6. **Anote a URL** Vercel (ex: `app.vercel.app`)

#### 🔗 **ETAPA 3: Conectar Frontend + Backend**
- [ ] 1. Edite `packages/frontend/src/environments/environment.prod.ts`:
  ```typescript
  export const environment = {
    production: true,
    apiUrl: 'https://SUA-URL-RENDER.onrender.com/api/subtitles'
  };
  ```
- [ ] 2. Commit e push:
  ```bash
  git add .
  git commit -m "Configure Render API URL"
  git push origin main
  ```
- [ ] 3. No Render, atualize `FRONTEND_URL` para sua URL Vercel
- [ ] 4. Aguarde redeploys automáticos (~2min)

#### ✅ **TESTE FINAL**
- [ ] Acesse sua URL Vercel
- [ ] Teste upload de arquivo
- [ ] Verifique se não há erros de CORS
- [ ] Teste tradução completa

---

## 💰 **CUSTO: 100% GRATUITO! 🎉**
- **Vercel**: 🆓 Gratuito (100GB bandwidth)
- **Render**: 🆓 Gratuito (750h/mês - mais que suficiente)

## 🎉 **PRONTO! Seu app está no ar!**

### 🔧 **Deploy futuro (1 comando)**:
```bash
# Linux/Mac
./deploy.sh

# Windows  
deploy.bat
```

### 🆘 **Problemas?**
- **CORS Error**: Verifique URLs nas configs
- **API não conecta**: Teste `https://sua-url.onrender.com/health`
- **App lento**: Primeiro acesso demora ~30s (normal - acordando)
- **Build falha**: Execute `npm cache clean --force`

**💡 Dica**: Render + Vercel têm deploys automáticos no push para main!
**⚠️ Lembrete**: App hiberna após 15min sem uso (totalmente normal no plano gratuito)
