# Tradução automática de legendas (servidor de mídia)

Serviço que roda no servidor de mídia e cria, aos poucos, legendas **PT-BR** a partir das legendas em **inglês** que já estão sincronizadas com o vídeo. Usa o mesmo motor do site (memória de tradução → Google gratuito → MyMemory) e o mesmo tratamento de falas (itálico, diálogos, quebras de linha, músicas).

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
- **Recusa do Google:** se mais de `MAX_PROVIDER_FAIL_RATIO` dos pedidos voltarem vazios (HTTP 429 etc.), **não grava nada**, devolve o vídeo para a fila sem gastar tentativa e pausa por `COOLDOWN_HOURS`, dobrando a cada recusa seguida (6 h → 12 h → 24 h) até a próxima tradução bem-sucedida. Falas que simplesmente ficam iguais (nomes, "Hmm") não contam como recusa.

## Nome do arquivo

`<vídeo>.pt-BR.Tradução-automática.srt` (UTF-8 com BOM, CRLF).

- **Emby:** mostra como *Português (Brasil)* com o título **Tradução-automática**, separado das legendas baixadas.
- **Bazarr:** só reconhece `.pt-BR.srt` puro, então **continua procurando** uma legenda humana. Quando ela chega, este serviço apaga a automática na varredura seguinte.

## Mapa (o que foi e o que não foi traduzido)

- `http://<servidor>:8787`: contagem por status, últimas traduzidas, fila e falhas; clique num status para a lista completa.
- `http://<servidor>:8787/api/files.csv?status=translated`: exporta a lista (sem `status` = todos).
- `http://<servidor>:8787/api/status`: resumo em JSON.

## Configuração (variáveis de ambiente)

| Variável | Padrão | Uso |
|---|---|---|
| `MEDIA_ROOTS` | `/movies,/TV-Show,/TV-Show-2,/Anime` | Pastas de mídia (dentro do container) |
| `DATA_DIR` | `/data` | Banco local (PGlite): mapa + memória de tradução |
| `MEMORY_DATABASE_URL` | vazio | Postgres externo (ex.: o Neon do site) para a memória, se quiser que as correções feitas no site valham aqui |
| `CYCLE_MINUTES` / `FILES_PER_CYCLE` / `DAILY_LIMIT` | 30 / 1 / 40 | Ritmo |
| `SCAN_HOURS` | 6 | Intervalo entre varreduras completas |
| `WAIT_DAYS` | 3 | Espera após o vídeo chegar |
| `REQUEST_DELAY_MS` | 3000 | Pausa antes de cada pedido ao tradutor |
| `COOLDOWN_HOURS` / `MAX_ATTEMPTS` | 6 / 3 | Pausa inicial quando o tradutor recusa (dobra até 24 h) / tentativas por arquivo (erros do próprio arquivo) |
| `MAX_PROVIDER_FAIL_RATIO` | 0.2 | Parcela de pedidos sem resposta do Google que caracteriza recusa |
| `MAX_CUES` | 3000 | Acima disso o arquivo é pulado (legenda de efeitos, não diálogo) |
| `MIN_VIDEO_MB` | 50 | Ignora amostras e extras |
| `LOG_FILE` | vazio | Também grava o log neste arquivo |
| `PORT` | 8787 | Página de status |

## Rodando

```bash
npm run test:auto                                  # testes das regras
docker build -f Dockerfile.auto -t subtitle-translator-auto .
```

No servidor, o compose fica no repositório `majula-server` (`docker/09-subtitle-translator.yml`).
