# Subtitle Translator - Tradutor de Legendas

Uma aplicação monorepo completa para tradução de arquivos de legenda SRT, desenvolvida com Angular no frontend e Node.js/Express no backend.

## 🚀 Funcionalidades

- **Upload de arquivos SRT**: Interface amigável para envio de arquivos de legenda
- **Detecção automática de idioma**: Identifica automaticamente o idioma da legenda original
- **Tradução para Português-BR**: Traduz todas as legendas para português brasileiro
- **Preview das traduções**: Visualize as traduções antes de fazer o download
- **Download do arquivo traduzido**: Baixe o novo arquivo SRT com as traduções
- **Interface responsiva**: Funciona perfeitamente em desktop e mobile

## 🏗️ Estrutura do Projeto

```
subtitle-translator-monorepo/
├── packages/
│   ├── frontend/          # Aplicação Angular
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── components/
│   │   │   │   ├── services/
│   │   │   │   └── ...
│   │   │   └── ...
│   │   └── package.json
│   └── backend/           # API Node.js/Express
│       ├── src/
│       │   ├── controllers/
│       │   ├── services/
│       │   ├── middleware/
│       │   └── routes/
│       └── package.json
├── package.json           # Configuração do monorepo
└── README.md
```

## 🛠️ Tecnologias Utilizadas

### Frontend
- **Angular 17**: Framework para desenvolvimento web
- **Angular Material**: Biblioteca de componentes UI
- **TypeScript**: Linguagem de programação
- **SCSS**: Pré-processador CSS
- **RxJS**: Biblioteca para programação reativa

### Backend
- **Node.js**: Runtime JavaScript
- **Express.js**: Framework web
- **TypeScript**: Linguagem de programação
- **Multer**: Middleware para upload de arquivos
- **Cors**: Middleware para CORS
- **Helmet**: Middleware de segurança

## 📋 Pré-requisitos

- Node.js 18+ 
- npm 9+

## ⚡ Instalação e Execução

### 1. Clone o repositório
\`\`\`bash
git clone <repository-url>
cd subtitle-translator-monorepo
\`\`\`

### 2. Instale todas as dependências
\`\`\`bash
npm run install:all
\`\`\`

### 3. Execute a aplicação em modo desenvolvimento
\`\`\`bash
npm run dev
\`\`\`

Este comando irá iniciar:
- Backend API na porta 3001: http://localhost:3001
- Frontend Angular na porta 4200: http://localhost:4200

### 4. Scripts disponíveis

\`\`\`bash
# Instalar dependências
npm run install:all          # Instala todas as dependências
npm run install:frontend     # Instala apenas frontend
npm run install:backend      # Instala apenas backend

# Desenvolvimento
npm run dev                  # Executa frontend e backend
npm run dev:frontend         # Executa apenas frontend
npm run dev:backend          # Executa apenas backend

# Build para produção
npm run build               # Build completo
npm run build:frontend      # Build apenas frontend
npm run build:backend       # Build apenas backend

# Produção
npm start                   # Inicia servidor de produção
\`\`\`

## 🔧 Configuração

### Backend (.env)
Crie um arquivo `.env` em `packages/backend/` baseado no `.env.example`:

\`\`\`bash
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:4200

# APIs de Tradução (opcional - para produção)
# GOOGLE_TRANSLATE_API_KEY=sua_chave_aqui
# DEEPL_API_KEY=sua_chave_aqui
\`\`\`

### Frontend (environment)
As configurações de ambiente estão em:
- `packages/frontend/src/environments/environment.ts` (desenvolvimento)
- `packages/frontend/src/environments/environment.prod.ts` (produção)

## 🎯 Como Usar

1. **Acesse a aplicação**: Abra http://localhost:4200 no seu navegador
2. **Selecione um arquivo SRT**: Clique no botão "Selecionar Arquivo SRT"
3. **Faça o upload**: Clique em "Processar e Traduzir"
4. **Visualize o resultado**: Veja as traduções na interface
5. **Baixe o arquivo**: Clique em "Baixar Arquivo SRT Traduzido"

## 📁 Formatos Suportados

- **Entrada**: Arquivos .srt (SubRip Subtitle)
- **Saída**: Arquivos .srt traduzidos para português brasileiro

## 🔍 API Endpoints

### POST /api/subtitles/upload
Faz upload e processa um arquivo SRT
- **Body**: FormData com arquivo SRT
- **Response**: Dados extraídos e idioma detectado

### POST /api/subtitles/translate
Traduz legendas para português
- **Body**: JSON com array de legendas
- **Response**: Legendas traduzidas e conteúdo SRT

### GET /api/subtitles/languages
Lista idiomas suportados
- **Response**: Lista de idiomas disponíveis

## 🚧 Desenvolvimento

### Estrutura dos Componentes (Frontend)

- **HeaderComponent**: Cabeçalho da aplicação
- **SubtitleUploaderComponent**: Interface de upload
- **SubtitleViewerComponent**: Visualizador de legendas
- **TranslationResultComponent**: Resultado da tradução

### Serviços (Backend)

- **SubtitleService**: Manipulação de arquivos SRT
- **LanguageDetectionService**: Detecção de idioma
- **TranslationService**: Tradução de texto

## 🔐 Segurança

- Validação de tipos de arquivo
- Limite de tamanho de arquivo (10MB)
- Headers de segurança com Helmet
- Validação de entrada nos endpoints

## 🎨 Interface

A interface usa Angular Material para uma experiência moderna e responsiva:
- Design Material Design
- Componentes acessíveis
- Responsivo para mobile
- Feedback visual durante operações

## 📝 Observações de Desenvolvimento

### Tradução
Atualmente, a aplicação usa um sistema simples de tradução para demonstração. Para produção, recomenda-se integrar com APIs como:
- Google Translate API
- DeepL API
- Microsoft Translator

### Detecção de Idioma
O sistema de detecção de idioma é básico. Para maior precisão, considere usar bibliotecas especializadas como:
- franc
- langdetect
- Google Cloud Translation

## 🤝 Contribuição

1. Faça um fork do projeto
2. Crie uma branch para sua feature (\`git checkout -b feature/AmazingFeature\`)
3. Commit suas mudanças (\`git commit -m 'Add some AmazingFeature'\`)
4. Push para a branch (\`git push origin feature/AmazingFeature\`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para detalhes.

## ✨ Próximas Funcionalidades

- [ ] Suporte a múltiplos idiomas de destino
- [ ] Integração com APIs de tradução profissionais
- [ ] Editor de legendas inline
- [ ] Suporte a outros formatos (VTT, ASS)
- [ ] Histórico de traduções
- [ ] Tradução em lote de múltiplos arquivos

---

**Desenvolvido com ❤️ para facilitar a tradução de legendas**
