# Subtitle Translator — Tradutor de Legendas

Traduz arquivos de legenda `.srt` do inglês para o português (BR). Você envia o arquivo, acompanha a tradução ao vivo, revisa as falas marcadas com aviso, corrige o que quiser e baixa o `.srt` final.

Stack: **Angular 20** (site estático) · **API Express** como Vercel Function em `/api` · **Neon Postgres** · tudo em **um único projeto na Vercel**.

## Deploy na Vercel (primeira vez)

1. Suba o repositório para o GitHub e importe-o em <https://vercel.com/new>. Deixe a raiz do repositório como *Root Directory*: o `vercel.json` já configura o build, a saída e a função.
2. No projeto da Vercel, abra **Storage → Create Database → Neon** e conecte ao projeto. Isso cria a variável `DATABASE_URL` sozinho. As tabelas são criadas automaticamente na primeira requisição.
3. Opcional: em **Settings → Environment Variables**, defina `MYMEMORY_EMAIL` (aumenta a cota do tradutor reserva).
4. Faça o redeploy e abra `https://<seu-app>.vercel.app/api/health`. Deve responder `{"status":"OK","database":"ok"}`. Se o banco não estiver conectado, a própria resposta explica o que falta.

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
| `MYMEMORY_EMAIL` | opcional | Aumenta a cota do tradutor reserva de ~5k para ~50k caracteres/dia |

## Testes

```bash
npm test               # backend (Jest, com Postgres real via PGlite em memória) + frontend (Karma, Chrome headless)
npm run e2e:live       # traduz de verdade os .srt de tests/ e gera tests/output/*.pt-BR.srt
```

O `e2e:live` usa a internet e imprime um relatório por arquivo: tempo, falas não traduzidas, linhas longas e uma amostra das traduções. Coloque mais `.srt` em `tests/` para testar outros casos.

## API

Base: `/api/subtitles` (mesmo domínio do site)

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

## Estrutura

```
api/index.ts                Vercel Function: exporta o app Express
vercel.json                 build do Angular, saída estática e rotas /api
packages/backend/src/
  app.ts                    monta o Express (usado pela função e pelo dev local)
  index.ts                  servidor local (npm run dev)
  srt/                      parser/serializer de .srt e tratamento do texto de cada fala
  translation/              provedores (Google gtx, MyMemory) e o pipeline memória → provedor → reserva
  db/                       cliente Postgres (Neon ou PGlite), memória de tradução e jobs
  controllers/JobController.ts
packages/frontend/src/app/
  upload/                   envio com arrastar e soltar
  translation/              progresso, revisão, edição e download
  services/subtitle.service.ts
tests/                      arquivos .srt reais usados nos testes
```
