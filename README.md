# Subtitle Translator — Tradutor de Legendas

Traduz arquivos de legenda `.srt` do inglês para o português (BR). Você envia o arquivo, acompanha a tradução ao vivo, revisa as falas marcadas com aviso, corrige o que quiser e baixa o `.srt` final.

Produção: **<https://subtitle-translator.com.br>**

Stack: **Angular 20** (site estático) · **API Express** como Vercel Function em `/api` · **Neon Postgres** · **Stripe** (assinatura e Pix) · tudo em **um único projeto na Vercel**.

## Planos

| Plano | Preço | Pagamento | Limites |
|---|---|---|---|
| Grátis | R$ 0 | — | 3 legendas/mês, até 1.500 falas por arquivo |
| Pro Mensal | R$ 19,90/mês | cartão, renovação automática | uso justo de 200 legendas/mês, até 10.000 falas |
| Pro 30 dias | R$ 19,90 | Pix ou cartão, pagamento único | igual ao Pro |
| Pro 12 meses | R$ 179,00 | Pix ou cartão, pagamento único | igual ao Pro |

Os limites ficam em `packages/backend/src/auth/plans.ts`. Os preços ficam no Stripe e são encontrados por `lookup_key` (`pro_monthly`, `pro_30d`, `pro_365d`). Para mudar um valor, edite `packages/backend/scripts/stripe-setup.ts` e rode o script de novo.

Traduzir exige conta (Google ou link por e-mail, sem senha). A landing, os preços, os guias de SEO (`/traduzir-legenda-srt`, `/legendas-plex-jellyfin-kodi`, `/corrigir-acentos-legenda`) e as páginas legais são públicos.

**Motor por plano:** o Grátis usa o Google gtx (com MyMemory de reserva). O Pro usa o **Gemini** quando `GEMINI_API_KEY` está definida, com o gtx como reserva, um prazo de 30 s por lote para caber na função de 60 s e a memória de tradução separada por origem (`user > ai > mt`): o assinante nunca recebe do cache uma tradução do gtx. Sem a chave, o Pro usa o mesmo motor do Grátis e o site não anuncia a IA.

## Deploy na Vercel (primeira vez)

1. Suba o repositório para o GitHub e importe-o em <https://vercel.com/new>. Deixe a raiz do repositório como *Root Directory*: o `vercel.json` já configura o build, a saída e a função.
2. No projeto da Vercel, abra **Storage → Create Database → Neon** e conecte ao projeto. Isso cria a variável `DATABASE_URL` sozinho. As tabelas são criadas automaticamente na primeira requisição.
3. Opcional: em **Settings → Environment Variables**, defina `MYMEMORY_EMAIL` (aumenta a cota do tradutor reserva).
4. Faça o redeploy e abra `https://subtitle-translator.com.br/api/health`. Deve responder `{"status":"OK","database":"ok"}`. Se o banco não estiver conectado, a própria resposta explica o que falta.

## Colocando à venda (checklist)

O código está pronto; estes passos dependem de contas e painéis externos.

1. **Domínio (Vercel → Settings → Domains):** adicione `subtitle-translator.com.br` e `www.subtitle-translator.com.br`, este redirecionando para o primeiro. No Registro.br, aponte o DNS como a Vercel indicar (registro A do domínio raiz e CNAME do `www`). O HTTPS é automático.
2. **Dados do responsável:** preencha `holder` (nome ou razão social) e `document` (CPF ou CNPJ) em `packages/frontend/src/app/legal/company.ts`. O Decreto 7.962/2013 exige esses dados em sites que vendem.
3. **E-mail de contato:** é o `email` de `packages/frontend/src/app/legal/company.ts` e aparece nos termos, no rodapé e no Stripe. Quando quiser um endereço do domínio, crie um encaminhamento (Cloudflare Email Routing ou ImprovMX) e troque lá.
4. **Stripe (conta nova, só deste projeto):**
   - Crie a conta em <https://dashboard.stripe.com/register> e ative-a com CPF ou CNPJ, conta bancária, site `https://subtitle-translator.com.br`, descritor de fatura `SUBTITLE TRANSLATOR` e o e-mail de suporte.
   - **Settings → Payment methods:** ative o **Pix** e mantenha os cartões.
   - **Settings → Emails:** ative os recibos de pagamentos bem-sucedidos e de reembolsos.
   - Rode o setup, primeiro com a chave de teste e depois com a de produção. Sem `--confirm`, ele só mostra qual conta vai usar:
     ```bash
     STRIPE_SECRET_KEY=sk_test_... npm run stripe:setup
     STRIPE_SECRET_KEY=sk_test_... npm run stripe:setup -- --confirm acct_...
     ```
     Ele cria o produto, os 3 preços, o Portal do Cliente, o webhook `https://subtitle-translator.com.br/api/billing/webhook` (e imprime o `STRIPE_WEBHOOK_SECRET`) e o cupom de lançamento **LANCAMENTO** (30% nos 3 primeiros meses, 100 usos, 60 dias). A faixa do cupom aparece no site só enquanto o código está ativo no Stripe. É seguro rodar de novo.
5. **Login com Google (Google Cloud Console → APIs e serviços → Credenciais):** crie um *ID do cliente OAuth* do tipo **Aplicativo da Web** com as origens JavaScript `https://subtitle-translator.com.br` e `http://localhost:4200`. Na tela de consentimento, use o nome do app, o logo e os links de termos e privacidade.
6. **E-mail de acesso (Resend):** em <https://resend.com>, adicione o domínio, crie no Registro.br os registros SPF e DKIM (e um DMARC) que ele mostrar e gere uma API key.
7. **Variáveis na Vercel (Production):** cadastre as da tabela abaixo e faça o Redeploy.
8. **Teste de ponta a ponta em produção:** entre com o Google e com o link por e-mail, assine com cartão, compre um passe com Pix, cancele pelo portal e confira em **Minha conta**. Em Developers → Webhooks, os eventos devem aparecer com resposta 200.
9. **IA no Pro:** crie uma chave em <https://aistudio.google.com/apikey> **num projeto com faturamento ativo** (o nível gratuito pode usar os dados para treino e tem cotas baixas) e cadastre `GEMINI_API_KEY` na Vercel.
10. **Analytics:** em Vercel → Analytics, ative o Web Analytics (sem cookies; o código já envia as visitas, sem query string).
11. **Fiscal:** com um contador, defina o enquadramento (MEI ou ME) e a emissão de NFS-e das vendas. Isso fica fora do código.

## Como funciona

1. **Envio**: arraste o `.srt` (até 4 MB; um filme tem ~100 KB). A tradução começa na hora, e o link da página (`/translation/:id`) sobrevive a um F5.
2. **Tradução**: a página pede à API um lote de ~300 falas por vez até terminar. Um filme de ~1.100 falas leva poucos segundos. Se você recarregar a página ou a rede cair no meio, ela continua de onde parou; depois de 3 falhas seguidas, a tradução pausa e aparece um botão **Continuar**.
3. **Revisão**: original e tradução lado a lado. Os avisos por fala podem ser filtrados:
   - **Não traduzida**: o texto voltou igual ao original.
   - **Linha longa**: passou de 42 caracteres por linha.
   - **Leitura rápida**: a tradução ficou longa demais para a duração da fala.
   - **Tradutor reserva**: foi traduzida pelo serviço secundário.
4. **Correção**: clique numa tradução e edite. Ela é salva ao sair do campo (Esc desfaz) e vai para a **memória de tradução**, então da próxima vez essa fala já sai com a sua versão.
5. **Download**: `Nome.pt-BR.srt` em UTF-8 com BOM e quebras CRLF, o formato que TVs e players leem com acentos corretos.

### O que o tradutor preserva

- Tempos, ordem e posicionamento (`X1:… Y1:…`, `{\an8}`).
- Itálico (`<i>`) de falas e linhas inteiras. Itálico parcial dentro de uma linha é removido para não gerar tags quebradas.
- Diálogos (`- Fala A` / `- Fala B`): cada fala é traduzida separadamente e os travessões são mantidos.
- Frases quebradas em duas linhas são traduzidas inteiras e depois re-quebradas em até 2 linhas equilibradas.
- Letras de música (`♪ … ♪`).

### Motor de tradução

- **Principal:** Google Translate pelo endpoint público `gtx`. Gratuito e sem chave, mas **não oficial**: pode limitar ou mudar sem aviso, e os IPs compartilhados da Vercel podem sofrer limite de requisições com mais frequência. Falhas temporárias (429/5xx) são repetidas com espera crescente.
- **Reserva:** MyMemory, usado só nas falas em que o principal falhou. A cota anônima é de ~5 mil caracteres por dia; defina `MYMEMORY_EMAIL` para ~50 mil.
- Se os dois falharem, a fala fica com o original, marcada como **Não traduzida**, e o botão **Tentar de novo** reenvia só essas.

### Memória de tradução

Fica no Postgres (Neon). Ela guarda **falas inteiras**, com match exato após normalizar maiúsculas, espaços e tags:

- Correções feitas por você (`user`) têm prioridade sobre qualquer tradução automática e nunca são sobrescritas.
- Traduções automáticas (`mt`) ficam em cache, então traduzir o mesmo arquivo de novo é instantâneo e não usa a rede.

## Rodando localmente

Pré-requisitos: Node.js 20+ e npm 9+.

```bash
npm install
npm run dev        # API em :3001 + Angular em :4200 (o Angular repassa /api para a API)
```

Abra http://localhost:4200. Sem `DATABASE_URL`, a API usa um **Postgres embutido (PGlite)** salvo em `packages/backend/.data/`, então não é preciso instalar nada.

Para usar o mesmo banco Neon da Vercel no dev:

```bash
npx vercel link
npx vercel env pull .env.local   # traz DATABASE_URL; a API lê .env.local sozinha
```

### Variáveis de ambiente

| Variável | Onde | Uso |
|---|---|---|
| `DATABASE_URL` | Vercel (criada pelo Neon) / `.env.local` | Postgres. Sem ela, o dev local usa PGlite |
| `APP_URL` | Vercel | `https://subtitle-translator.com.br`. Usado nos links de e-mail e nos retornos do Stripe |
| `SESSION_SECRET` | Vercel (obrigatória) | Assina o cookie de sessão. Gere com `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID` | Vercel | ID do cliente OAuth. Sem ele, o botão do Google não aparece |
| `RESEND_API_KEY` | Vercel | Envia o link de acesso. No dev local, sem ela, o link aparece no terminal da API |
| `EMAIL_FROM` | opcional | Remetente. Padrão: `Subtitle Translator <nao-responda@subtitle-translator.com.br>` |
| `STRIPE_SECRET_KEY` | Vercel | Chave secreta da conta Stripe deste projeto. Sem ela, os pagamentos ficam desligados |
| `STRIPE_WEBHOOK_SECRET` | Vercel | Impresso pelo `npm run stripe:setup` (ou pelo `stripe listen` no dev) |
| `STRIPE_PORTAL_CONFIGURATION` | opcional | Só se o setup pedir (quando o portal criado não vira o padrão) |
| `GEMINI_API_KEY` | Vercel | Liga a tradução por IA no Pro. Use uma chave de projeto com faturamento |
| `GEMINI_MODELS` | opcional | Modelos em ordem de preferência, separados por vírgula (padrão: o mesmo do `auto`) |
| `MYMEMORY_EMAIL` | opcional | Aumenta a cota do tradutor reserva de ~5k para ~50k caracteres/dia |

Para testar pagamentos no dev local, use a chave de teste e repasse os webhooks com a [Stripe CLI](https://docs.stripe.com/stripe-cli):

```bash
stripe listen --forward-to localhost:3001/api/billing/webhook   # imprime o whsec_ para STRIPE_WEBHOOK_SECRET
```

Cartão de teste: `4242 4242 4242 4242`, com qualquer validade futura e qualquer CVC.

## Testes

```bash
npm test               # backend (Jest, com Postgres real via PGlite em memória) + frontend (Karma, Chrome headless)
npm run e2e:live       # traduz de verdade os .srt de tests/ e gera tests/output/*.pt-BR.srt
```

O `e2e:live` usa a internet e imprime um relatório por arquivo: tempo, falas não traduzidas, linhas longas e uma amostra das traduções. Coloque mais `.srt` em `tests/` para testar outros casos.

## API

Base: `/api/subtitles` (mesmo domínio do site). Todas as rotas de job exigem o cookie de sessão, e cada pessoa só enxerga os próprios jobs. Ao passar do limite do plano, `POST /jobs` responde `402` com `code: "QUOTA"` ou `"TOO_LONG"`.

| Método e rota | Descrição |
|---|---|
| `POST /jobs` (multipart, campo `file`) | Valida o `.srt` e cria a tradução. Retorna `201` com o job e as falas |
| `POST /jobs/:id/translate` | Traduz o próximo lote de falas pendentes e devolve `{ status, progress, cues }`. Chame até `status` ser `done` |
| `GET /jobs/:id` | Job completo (usado ao abrir ou recarregar a página) |
| `PATCH /jobs/:id/cues/:position` `{ "translation": "…" }` | Salva a correção de uma fala (e grava na memória) |
| `POST /jobs/:id/retry` | Marca as falas não traduzidas para traduzir de novo |
| `GET /jobs/:id/download` | Baixa o `.srt` traduzido (`409` enquanto ainda traduz) |
| `GET /memory/stats` | Quantidade de entradas na memória, por origem |
| `GET /api/health` | Status da API e do banco |

Os jobs ficam no banco e são apagados 7 dias depois do último acesso (a limpeza acontece a cada novo envio).

Contas e pagamentos:

| Método e rota | Descrição |
|---|---|
| `GET /api/auth/me` | Usuário, plano, uso do mês e limites (`null` sem sessão) |
| `POST /api/auth/google` `{ credential }` | Login com o token do Google Identity Services |
| `POST /api/auth/magic-link` `{ email }` | Envia o link de acesso (até 3 por hora para o mesmo e-mail) |
| `POST /api/auth/verify` `{ token }` | Troca o token do link pela sessão (chamado pela página `/entrar/confirmar`) |
| `POST /api/auth/logout` · `DELETE /api/auth/account` | Sair · excluir a conta, os jobs e a assinatura (LGPD) |
| `GET /api/billing/prices` | Preços atuais do Stripe |
| `POST /api/billing/checkout` `{ plan }` | Abre o Stripe Checkout (`pro_monthly`, `pro_30d`, `pro_365d`) |
| `POST /api/billing/portal` | Abre o Portal do Cliente (cancelar, trocar o cartão, ver faturas) |
| `POST /api/billing/webhook` | Eventos do Stripe, com assinatura verificada e processados uma única vez |

## Estrutura

```
api/index.ts                Vercel Function: exporta o app Express
vercel.json                 build do Angular, saída estática e rotas /api
packages/backend/src/
  app.ts                    monta o Express (usado pela função e pelo dev local)
  index.ts                  servidor local (npm run dev)
  srt/                      parser/serializer de .srt e tratamento do texto de cada fala
  translation/              provedores (Google gtx, MyMemory) e o pipeline memória → provedor → reserva
  db/                       cliente Postgres (Neon ou PGlite), memória de tradução, jobs e usuários
  auth/                     sessão (cookie assinado), planos e limites, envio de e-mail
  billing/stripe.ts         cliente Stripe e preços por lookup_key
  controllers/              jobs, login e pagamentos
packages/backend/scripts/stripe-setup.ts   cria produto, preços, portal e webhook no Stripe
packages/frontend/src/app/
  landing/ pricing/         página inicial, planos e FAQ
  login/ account/           entrar (Google ou link) e minha conta
  legal/                    termos de uso, privacidade e dados do responsável
  upload/                   envio com arrastar e soltar
  translation/              progresso, revisão, edição e download
  services/                 API de legendas, sessão, pagamentos e guarda de rotas
tests/                      arquivos .srt reais usados nos testes
```
