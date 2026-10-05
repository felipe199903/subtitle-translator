/** Content of the public guide pages (one route each, see app.routes.ts). */
export interface GuidePage {
  path: string;
  title: string;
  description: string;
  h1: string;
  intro: string[];
  steps: { title: string; text: string }[];
  sections: { title: string; paragraphs: string[] }[];
  faq: { q: string; a: string }[];
}

export const GUIDES: GuidePage[] = [
  {
    path: 'traduzir-legenda-srt',
    title: 'Como traduzir legenda .srt do inglês para português — Tradutor de Legendas',
    description:
      'Traduza um arquivo de legenda .srt do inglês para o português do Brasil em segundos, mantendo tempos, itálico e acentos. Grátis para 3 legendas por mês.',
    h1: 'Como traduzir uma legenda .srt do inglês para o português',
    intro: [
      'Encontrou o filme ou a série, mas a legenda só existe em inglês? O formato .srt é um arquivo de texto com as falas e os tempos em que cada uma aparece. Para traduzir, não basta colar o texto num tradutor: os números, os tempos e as quebras de linha precisam continuar exatamente no lugar, senão o player não lê o arquivo.',
      'O Tradutor de Legendas faz isso por você: traduz só o texto das falas, mantém a sincronia e devolve um .srt pronto, em português do Brasil.',
    ],
    steps: [
      { title: 'Envie o .srt', text: 'Arraste o arquivo (até 4 MB) para a página. Um filme inteiro tem cerca de 100 KB.' },
      { title: 'Acompanhe a tradução', text: 'As falas são traduzidas em lotes, com o progresso na tela. Um filme leva poucos segundos.' },
      { title: 'Revise o que importa', text: 'Falas longas demais, rápidas demais para ler ou que ficaram sem tradução são marcadas. Corrija direto na lista.' },
      { title: 'Baixe o .pt-BR.srt', text: 'O arquivo sai em UTF-8, com os mesmos tempos do original, pronto para o player.' },
    ],
    sections: [
      {
        title: 'O que é preservado',
        paragraphs: [
          'Tempos e ordem das falas, posicionamento na tela, itálico, diálogos com travessão e trechos de música (♪). Frases quebradas em duas linhas são traduzidas inteiras e depois redistribuídas em até duas linhas equilibradas, com cerca de 42 caracteres cada, o padrão das boas legendas.',
        ],
      },
      {
        title: 'Tradução automática ou com IA',
        paragraphs: [
          'No plano grátis a tradução é automática, frase a frase. No Pro, a tradução por IA lê as falas vizinhas para acertar quem fala com quem, o tratamento (você ou senhor), gírias e piadas. Nos dois casos você revisa antes de baixar, e suas correções ficam guardadas para as próximas legendas.',
        ],
      },
    ],
    faq: [
      { q: 'Preciso instalar algum programa?', a: 'Não. Tudo funciona no navegador, no computador ou no celular.' },
      { q: 'A legenda fica fora de sincronia depois de traduzida?', a: 'Não. Os tempos não são alterados; só o texto das falas é traduzido.' },
      { q: 'Quanto custa?', a: 'Até 3 legendas por mês são grátis. Para mais legendas, arquivos maiores e tradução por IA, existe o plano Pro.' },
    ],
  },
  {
    path: 'legendas-plex-jellyfin-kodi',
    title: 'Legendas em português para Plex, Jellyfin e Kodi — Tradutor de Legendas',
    description:
      'Tem um servidor de mídia com Plex, Jellyfin, Emby ou Kodi e faltam legendas em português? Traduza o .srt em inglês e coloque ao lado do vídeo em minutos.',
    h1: 'Legendas em português para o seu Plex, Jellyfin ou Kodi',
    intro: [
      'Quem monta o próprio servidor de mídia conhece o problema: os agentes de legenda (OpenSubtitles, Bazarr e afins) quase sempre acham a versão em inglês, mas a em português não existe, está fora de sincronia ou é de outra versão do vídeo.',
      'A legenda em inglês que já casa com o seu arquivo é o melhor ponto de partida. Traduza-a e você tem uma legenda em português com a sincronia perfeita.',
    ],
    steps: [
      { title: 'Pegue o .srt em inglês', text: 'Use a legenda que já está sincronizada com o seu vídeo (a mesma pasta, ou baixada pelo seu agente de legendas).' },
      { title: 'Traduza aqui', text: 'Envie o arquivo, aguarde alguns segundos e revise as falas marcadas, se quiser.' },
      { title: 'Salve ao lado do vídeo', text: 'Baixe o arquivo e deixe com o mesmo nome do vídeo, terminando em .pt-BR.srt (ex.: Filme (2024).pt-BR.srt).' },
      { title: 'Atualize a biblioteca', text: 'No Plex, Jellyfin, Emby ou Kodi, atualize os metadados do item: a faixa "Português (Brasil)" aparece nas opções de legenda.' },
    ],
    sections: [
      {
        title: 'Nomes de arquivo que os servidores reconhecem',
        paragraphs: [
          'Plex, Jellyfin, Emby e Kodi leem legendas externas com o mesmo nome do vídeo seguido do código do idioma: "Nome do Filme (2024).pt-BR.srt" ou ".por.srt". O Tradutor de Legendas já baixa o arquivo com o sufixo .pt-BR.srt.',
        ],
      },
      {
        title: 'Acentos corretos em qualquer TV',
        paragraphs: [
          'O arquivo é salvo em UTF-8 com BOM e quebras de linha no padrão Windows, o formato que smart TVs, Fire TV, Chromecast e players de mesa leem sem trocar "ã" por símbolos estranhos.',
        ],
      },
    ],
    faq: [
      { q: 'Funciona com Stremio e VLC?', a: 'Sim. Qualquer player que aceite legenda .srt externa funciona: basta carregar o arquivo ou deixá-lo na mesma pasta do vídeo.' },
      { q: 'Dá para traduzir uma temporada inteira?', a: 'Sim, um episódio por vez. No plano Pro são até 200 legendas por mês, o suficiente para várias temporadas.' },
      { q: 'E legendas de anime?', a: 'Se a legenda estiver em .srt, sim. No Pro, a IA mantém honoríficos (-san, -kun, senpai) e nomes de técnicas.' },
    ],
  },
  {
    path: 'corrigir-acentos-legenda',
    title: 'Legenda com acentos errados (Ã£, Ã©)? Como corrigir — Tradutor de Legendas',
    description:
      'Por que a legenda mostra "nÃ£o" em vez de "não" e como corrigir: entenda a codificação UTF-8 e gere uma legenda .srt com acentos certos em qualquer player.',
    h1: 'Legenda com acentos quebrados? Entenda e corrija',
    intro: [
      'Se a sua legenda mostra "nÃ£o", "vocÃª" ou pontos de interrogação no lugar das letras acentuadas, o texto está certo: o problema é a codificação do arquivo. Legendas antigas costumam ser salvas em Windows-1252 (Latin-1), e muitos players e TVs esperam UTF-8.',
      'O Tradutor de Legendas detecta a codificação automaticamente, lê o arquivo corretamente e sempre entrega o resultado em UTF-8, o formato que funciona em todo lugar.',
    ],
    steps: [
      { title: 'Envie a legenda', text: 'Pode ser o .srt em inglês com problema de codificação. O site avisa quando o arquivo não estava em UTF-8.' },
      { title: 'Traduza e revise', text: 'A tradução usa o texto lido corretamente, sem os caracteres quebrados.' },
      { title: 'Baixe em UTF-8', text: 'O .pt-BR.srt sai em UTF-8 com BOM, reconhecido por smart TVs, VLC, Plex, Jellyfin e Kodi.' },
    ],
    sections: [
      {
        title: 'Por que isso acontece',
        paragraphs: [
          'Cada letra acentuada é gravada como um ou mais bytes, e cada codificação usa bytes diferentes. Quando um arquivo UTF-8 é lido como Latin-1, o "ã" (dois bytes em UTF-8) vira "Ã£". No caminho contrário, as letras acentuadas viram "?" ou losangos.',
        ],
      },
      {
        title: 'Por que UTF-8 com BOM',
        paragraphs: [
          'O BOM é uma marca invisível no início do arquivo que diz "isto é UTF-8". Players modernos não precisam dela, mas muitas TVs e aparelhos mais antigos só acertam os acentos quando ela está presente. Por isso o arquivo baixado já vem com a marca.',
        ],
      },
    ],
    faq: [
      { q: 'A legenda já está em português, só com acentos errados. Funciona?', a: 'O site é feito para traduzir do inglês. Se o arquivo já estiver em português, ele avisa e você pode baixar o resultado mesmo assim, já em UTF-8.' },
      { q: 'Preciso saber qual é a codificação do meu arquivo?', a: 'Não. A detecção é automática.' },
    ],
  },
];
