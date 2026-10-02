# Tradução automática de legendas (servidor de mídia)

Serviço que roda no servidor de mídia e cria, aos poucos, legendas **PT-BR** a partir das legendas em **inglês** que já estão sincronizadas com o vídeo. Usa a memória de tradução e o tratamento de falas do site (itálico, diálogos, quebras de linha, músicas).

## Motor de tradução

- **Com `GEMINI_API_KEY`** (chave grátis do [Google AI Studio](https://aistudio.google.com)): memória de tradução → **Gemini** → Google gratuito só para as falas que o Gemini não devolver.
  - Cada pedido leva um lote de falas consecutivas (`GEMINI_GROUP_CHARS`) em JSON; as vizinhas servem de contexto (gênero, tratamento, frases quebradas entre falas). A resposta usa saída estruturada e precisa voltar com os mesmos ids; o que faltar ou vier bloqueado é refeito em pedaços menores, até uma fala.
  - Modelos em cascata (`GEMINI_MODELS`). A cota grátis é **por modelo e por dia** e zera à meia-noite do Pacífico. Quando um modelo esgota, passa para o próximo; quando todos esgotam, o serviço pausa até a cota voltar. Limite por minuto (429) e "alta demanda" (503) são repetidos com espera.
  - Use versões fixas: os apelidos `-latest` mudam de modelo sem aviso (o `gemini-flash-latest` passou a apontar para um modelo com só 20 pedidos/dia no plano grátis).
- **Sem a chave:** memória → Google gratuito → MyMemory, no ritmo antigo (1 arquivo a cada 30 min, 40/dia).

## O que ele faz

A cada varredura (padrão: 6 h), para cada vídeo nas pastas de mídia:

| Situação | Status no mapa |
|---|---|
| Já existe PT-BR (arquivo `.pt-BR.srt`, `.pb.srt`, `.por.srt`… ou faixa embutida em português) | `has_ptbr` |
| O áudio já é em português | `audio_pt` |
| Há inglês (`.en.srt`, ou faixa de texto embutida) e o vídeo chegou há menos de `WAIT_DAYS` dias | `waiting` (dando tempo para o Bazarr achar uma legenda humana) |
| Há inglês e já passou o prazo | `pending` (fila) |
| Tradução gravada | `translated` |
| Chegou uma legenda PT-BR humana depois da tradução | `superseded` (o arquivo automático é **apagado**) |
| Sem inglês / inglês só em imagem (PGS) | `no_english` / `image_only` |
| Falhou `MAX_ATTEMPTS` vezes | `failed` |

A cada ciclo (padrão: 30 min) traduz até `FILES_PER_CYCLE` vídeos da fila, dos mais novos para os mais antigos, respeitando `DAILY_LIMIT` por dia e esperando `REQUEST_DELAY_MS` antes de cada pedido ao Google.

- **Faixas ASS (anime):** são lidas direto, mantendo só os estilos de diálogo. Letreiros, karaokê (`OP_EN`, `ED-Romaji`, `Signs`…), desenhos vetoriais e linhas animadas quadro a quadro são descartados. Um episódio que o ffmpeg convertia em 28 mil "falas" fica com as ~400 de diálogo. Acima de `MAX_CUES` falas o arquivo é pulado (não é diálogo).
- **Faixa certa em anime:** faixas de letreiros/músicas ("S&S", "Signs & Songs", "TS") não são usadas como fonte. Se a faixa escolhida render menos de 30 falas, o serviço testa as outras faixas em inglês e fica com a de mais diálogo.
- **Recusa do tradutor:** se mais de `MAX_PROVIDER_FAIL_RATIO` dos textos enviados ao motor principal voltarem vazios, **não grava nada** e devolve o vídeo para a fila sem gastar tentativa. Com Gemini, pausa até a cota diária voltar; com o Google gratuito, pausa por `COOLDOWN_HOURS`, dobrando a cada recusa seguida (6 h → 12 h → 24 h). Trocar de motor zera a pausa. Falas que simplesmente ficam iguais (nomes, "Hmm") não contam como recusa.

## Nome do arquivo

`<vídeo>.pt-BR.Tradução-automática.srt` (UTF-8 com BOM, CRLF).

- **Emby:** mostra como *Português (Brasil)* com o título **Tradução-automática**, separado das legendas baixadas.
- **Bazarr:** só reconhece `.pt-BR.srt` puro, então **continua procurando** uma legenda humana. Quando ela chega, este serviço apaga a automática na varredura seguinte.

## Mapa (o que foi e o que não foi traduzido)

- `http://<servidor>:8787`: contagem por status, motor e pedidos por modelo hoje, últimas traduzidas, fila e falhas; clique num status para a lista completa.
- `http://<servidor>:8787/api/files.csv?status=translated`: exporta a lista (sem `status` = todos).
- `http://<servidor>:8787/api/status`: resumo em JSON.

## Configuração (variáveis de ambiente)

| Variável | Padrão | Uso |
|---|---|---|
| `MEDIA_ROOTS` | `/movies,/TV-Show,/TV-Show-2,/Anime` | Pastas de mídia (dentro do container) |
| `DATA_DIR` | `/data` | Banco local (PGlite): mapa + memória de tradução |
| `MEMORY_DATABASE_URL` | vazio | Postgres externo (ex.: o Neon do site) para a memória, se quiser que as correções feitas no site valham aqui |
| `GEMINI_API_KEY` | vazio | Chave do Google AI Studio; liga o Gemini como motor principal |
| `GEMINI_MODELS` | `gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite` | Modelos, em ordem de preferência |
| `GEMINI_GROUP_CHARS` | 12000 | Caracteres de legenda por pedido (mais = mais contexto, menos pedidos) |
| `GEMINI_DELAY_MS` | 4500 | Pausa antes de cada pedido ao Gemini |
| `CYCLE_MINUTES` / `FILES_PER_CYCLE` / `DAILY_LIMIT` | 20 / 2 / 120 com Gemini; 30 / 1 / 40 sem | Ritmo |
| `SCAN_HOURS` | 6 | Intervalo entre varreduras completas |
| `WAIT_DAYS` | 3 | Espera após o vídeo chegar |
| `REQUEST_DELAY_MS` | 3000 | Pausa antes de cada pedido ao Google gratuito |
| `COOLDOWN_HOURS` / `MAX_ATTEMPTS` | 6 / 3 | Pausa inicial quando o tradutor recusa (dobra até 24 h) / tentativas por arquivo (erros do próprio arquivo) |
| `MAX_PROVIDER_FAIL_RATIO` | 0.2 | Parcela de textos sem resposta do motor principal que caracteriza recusa |
| `MAX_CUES` | 3000 | Acima disso o arquivo é pulado (legenda de efeitos, não diálogo) |
| `MIN_VIDEO_MB` | 50 | Ignora amostras e extras |
| `LOG_FILE` | vazio | Também grava o log neste arquivo |
| `PORT` | 8787 | Página de status |

## Rodando

```bash
npm run test:auto                                  # testes das regras
docker build -f Dockerfile.auto -t subtitle-translator-auto .
```

No servidor, o compose fica no repositório `majula-server` (`docker/09-subtitle-translator.yml`); a chave vai num `.env` ao lado dele (fora do git).

### Comparar motores antes de soltar o ciclo

```bash
docker exec -w /app/packages/auto subtitle-translator /app/node_modules/.bin/tsx src/try.ts "/movies/Filme (2020)/Filme (2020).mkv"
```

Grava `<vídeo>.pt-BR.Teste-Gemini.srt` (sem usar nem alimentar a memória de tradução e sem mexer no mapa) para conferir no Emby. A varredura ignora arquivos `Teste-*`; apague-os depois.
