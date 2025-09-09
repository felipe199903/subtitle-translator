# 🆓 RENDER + VERCEL - Deploy Gratuito (10 min)

## 🎯 100% GRATUITO - Zero custo mensal

### ✅ **Vantagens do Render:**
- Completamente gratuito para sempre
- 750h/mês incluídas (mais que suficiente)  
- Deploy automático via GitHub
- Suporte nativo a Node.js + SQLite
- Interface amigável (similar ao Railway)

### ⚠️ **Única limitação:**
- App "hiberna" após 15min sem uso
- Primeiro acesso demora ~30s para "acordar"
- **Perfeito para:** Portfólio, demos, desenvolvimento

---

## 🚀 DEPLOY RENDER (10 minutos)

### **ETAPA 1: Backend no Render**
1. **Acesse:** [render.com](https://render.com)
2. **Clique:** "Get Started for Free"
3. **Login:** com sua conta GitHub
4. **New** → **Web Service**
5. **Connect Repository:** selecione seu projeto
6. **Configure:**
   ```
   Name: subtitle-translator-api
   Branch: main  
   Root Directory: packages/backend
   Runtime: Node
   Build Command: npm run build
   Start Command: npm start
   ```
7. **Environment Variables:**
   ```
   NODE_ENV=production
   DB_PATH=./tm.db
   FRONTEND_URL=https://seu-app.vercel.app
   ```
8. **Deploy!** (aguarde ~3min)
9. **Anote a URL** (ex: `https://subtitle-translator-api.onrender.com`)

### **ETAPA 2: Frontend na Vercel**
1. **Acesse:** [vercel.com](https://vercel.com)
2. **Login:** com GitHub  
3. **New Project** → **Import Git Repository**
4. **Configure:**
   - Framework: **Angular**
   - Root Directory: `packages/frontend`
   - Build Command: `npm run build`
   - Output Directory: `dist/frontend`
5. **Deploy!**
6. **Anote a URL** (ex: `https://subtitle-translator.vercel.app`)

### **ETAPA 3: Conectar Apps**
1. **Edite:** `packages/frontend/src/environments/environment.prod.ts`
   ```typescript
   export const environment = {
     production: true,
     apiUrl: 'https://SUA-URL-RENDER.onrender.com/api/subtitles'
   };
   ```

2. **Commit e push:**
   ```bash
   git add .
   git commit -m "Configure Render API URL"
   git push origin main
   ```

3. **No Render:** Atualize `FRONTEND_URL` para sua URL Vercel

4. **Aguarde:** Redeploys automáticos (~2min)

---

## ✅ **TESTE FINAL**
- Acesse sua URL Vercel
- Teste upload de arquivo .srt
- Verifique tradução funcionando
- Primeiro acesso pode demorar ~30s (normal)

---

## 🎉 **PRONTO! App 100% gratuito no ar!**

### 💰 **Custo Total: R$ 0,00**
- **Render:** 🆓 Gratuito (750h/mês)
- **Vercel:** 🆓 Gratuito (100GB tráfego)

### 🔄 **Deploys Futuros:**
- Automático a cada `git push`
- Render + Vercel detectam mudanças
- Zero configuração adicional

### 🆘 **Troubleshooting:**
- **App lento na primeira vez:** Normal (acordando do hibernar)
- **CORS Error:** Verifique URLs nas configs
- **API não conecta:** Teste `/health` endpoint no Render
- **Build falha:** `npm cache clean --force`

### 🚀 **Para melhor performance:**
- **Upgrading:** Render Pro ($7/mês) mantém app sempre ativo
- **Alternativa:** Railway ($5/mês) também sempre ativo
- **Mas:** Para portfólio/demo, versão gratuita é perfeita!
