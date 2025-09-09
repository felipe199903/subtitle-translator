# 🆓 DEPLOY GRATUITO - Alternativas ao Railway

## 💰 CUSTO ZERO - Opções 100% Gratuitas

### 🥇 **OPÇÃO 1: Render (Recomendada)**
- ✅ **100% GRATUITO** para sempre
- ✅ Suporte nativo a Node.js + SQLite
- ✅ 750h/mês gratuitas (suficiente)
- ⚠️ App "hiberna" após 15min inativo (reativa em ~30s)

#### 📋 Deploy no Render:
1. **Backend**: [render.com](https://render.com) → **Web Service**
   ```
   Build Command: npm run build
   Start Command: npm start
   Environment: NODE_ENV=production
   ```

2. **Frontend**: Continua na **Vercel** (gratuito)

---

### 🥈 **OPÇÃO 2: Fly.io**  
- ✅ **100% GRATUITO** (3 apps gratuitas)
- ✅ Sempre ativo (não hiberna)
- ✅ 256MB RAM gratuita
- ⚠️ Configuração um pouco mais técnica

#### 📋 Deploy no Fly.io:
```bash
# Instalar CLI
npm install -g flyctl

# Deploy
fly launch
fly deploy
```

---

### 🥉 **OPÇÃO 3: Koyeb**
- ✅ **100% GRATUITO** 
- ✅ 512MB RAM + 2.5GB storage
- ✅ Deploy direto do GitHub
- ⚠️ App hiberna após 2h inativo

---

### 🛠️ **OPÇÃO 4: Heroku Alternative Stack**
- ✅ **100% GRATUITO** usando alternativas ao Heroku
- **Railway** → **Render** 
- **Vercel** → **Netlify** (ambos gratuitos)

---

## 🎯 **RECOMENDAÇÃO: Render + Vercel**

### ✅ **Por que Render é a melhor opção gratuita:**
1. **Fácil**: Deploy idêntico ao Railway
2. **Confiável**: Usado por milhares de devs
3. **SQLite**: Suporte nativo 
4. **GitHub**: Integração automática
5. **Logs**: Interface visual completa

### ⚠️ **Única diferença**: 
- App "hiberna" após 15min sem uso
- **Solução**: Primeiro acesso demora ~30s para "acordar"
- **Impacto**: Zero para desenvolvimento/portfólio

---

## 🚀 **DEPLOY RENDER (10 minutos)**

### **Passo 1**: Render Backend
1. Acesse [render.com](https://render.com)
2. **New** → **Web Service** 
3. Connect GitHub → Selecione seu repo
4. Configure:
   ```
   Name: subtitle-translator-api
   Branch: main
   Root Directory: packages/backend
   Runtime: Node
   Build Command: npm run build  
   Start Command: npm start
   ```
5. **Environment Variables**:
   ```
   NODE_ENV=production
   DB_PATH=./tm.db
   FRONTEND_URL=https://seu-app.vercel.app
   ```

### **Passo 2**: Vercel Frontend (mesmo processo)
- Mantém exatamente igual ao checklist anterior
- Só muda a URL da API para `https://seu-app.render.com`

---

## 💡 **Comparação Rápida**

| Plataforma | Custo | Sempre Ativo | Facilidade | RAM |
|------------|-------|--------------|------------|-----|
| **Render** | 🆓 Free | ❌ Hiberna 15min | ⭐⭐⭐⭐⭐ | 512MB |
| **Fly.io** | 🆓 Free | ✅ Sim | ⭐⭐⭐ | 256MB |  
| **Railway** | 💵 $5/mo | ✅ Sim | ⭐⭐⭐⭐⭐ | 512MB |
| **Koyeb** | 🆓 Free | ❌ Hiberna 2h | ⭐⭐⭐⭐ | 512MB |

---

## 🎯 **DECISÃO FINAL**

**Para portfólio/desenvolvimento**: **Render + Vercel** (100% gratuito)
**Para produção comercial**: **Railway + Vercel** ($5/mês, sempre ativo)

**Você quer que eu crie o guia detalhado do Render?** 🤔
