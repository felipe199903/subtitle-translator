# Pasta de Arquivos Temporários

Esta pasta contém arquivos temporários gerados durante o desenvolvimento e teste do sistema.

## Conteúdo

- Arquivos `.srt` temporários para teste
- Outputs de processamento
- Caches temporários

## Limpeza

Esta pasta pode ser limpa periodicamente sem afetar o funcionamento do sistema:

```bash
# Limpar pasta temp
rm -rf temp/*
# ou no Windows
del temp\*.*
```

**Nota**: Arquivos nesta pasta são temporários e não devem ser commitados ao git.
