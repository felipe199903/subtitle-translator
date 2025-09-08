# 🎬 Tradutor de Legendas SRT

Uma aplicação monorepo completa para tradução automática de arquivos de legenda SRT para português brasileiro.

## 📋 Funcionalidades

- 📁 **Upload de arquivos SRT**: Envie seus arquivos de legenda .srt com interface drag & drop
- 🔍 **Detecção automática de idioma**: Identifica automaticamente o idioma original da legenda
- 🌐 **Tradução para PT-BR**: Converte o texto para português brasileiro
- 📥 **Download do arquivo traduzido**: Baixe o novo arquivo SRT traduzido
- 👀 **Prévia lado a lado**: Visualize o texto original e traduzido simultaneamente
- 📱 **Interface responsiva**: Funciona perfeitamente em desktop e mobile

## 🚀 Como executar rapidamente

```bash
# 1. Instalar todas as dependências
npm run install:all

# 2. Iniciar aplicação completa
npm run dev
```

**Acesse**: http://localhost:4200

## 🏗️ Arquitetura

### Frontend (Angular 20+)
- Angular com standalone components (zoneless)
- Interface moderna e responsiva
- Upload de arquivos com validação
- Visualização em tempo real das traduções

### Backend (Node.js + Express)
- API RESTful para processamento de legendas
- Parser de arquivos SRT
- Sistema de detecção de idioma
- Serviço de tradução expandível

## 🎯 Como usar

1. **Acesse** http://localhost:4200
2. **Selecione um arquivo .srt** 
3. **Clique em "Enviar e Processar"**
4. **Visualize** idioma detectado e legendas
5. **Clique em "Traduzir para Português (BR)"**
6. **Compare** original vs tradução
7. **Baixe** o arquivo traduzido

## 🛠️ Tecnologias

- **Frontend**: Angular 20+, TypeScript, SCSS
- **Backend**: Node.js, Express, TypeScript
- **Upload**: Multer, validação de arquivos
- **Segurança**: Helmet, CORS, validações

## 📁 Estrutura do projeto

```
app-subs/
├── packages/
│   ├── frontend/    # Angular app
│   └── backend/     # Node.js API
├── package.json     # Monorepo config
└── README.md
```

## 🔧 Scripts

- `npm run dev` - Inicia frontend + backend
- `npm run install:all` - Instala todas dependências
- `npm run build` - Build completo
- `npm start` - Produção

## 🌐 API Endpoints

- `POST /api/subtitles/upload` - Upload SRT
- `POST /api/subtitles/translate` - Traduzir
- `GET /api/subtitles/languages` - Idiomas
- `GET /health` - Health check

## 🔮 Extensibilidade

Para integrar APIs reais de tradução:
- Google Translate API
- DeepL API
- Microsoft Translator

## 🤝 Contribuindo

1. Fork do projeto
2. Crie feature branch
3. Commit mudanças
4. Push para branch
5. Abra Pull Request

---

**🎉 Aplicação pronta! Execute `npm run dev` e acesse http://localhost:4200**
