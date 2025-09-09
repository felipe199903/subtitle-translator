#!/usr/bin/env node

/**
 * Teste de treinamento com arquivo pequeno para verificar auto-aplicação
 */

const fs = require('fs');
const FormData = require('form-data');

const baseUrl = 'http://localhost:3001/api/subtitles';

// Criar um arquivo SRT pequeno para teste
const testSrtContent = `1
00:00:01,000 --> 00:00:03,000
Hello my friend

2
00:00:04,000 --> 00:00:06,000
How are you today

3
00:00:07,000 --> 00:00:09,000
I am very happy

4
00:00:10,000 --> 00:00:12,000
Thank you so much

5
00:00:13,000 --> 00:00:15,000
Good morning sunshine

6
00:00:16,000 --> 00:00:18,000
Nice to see you

7
00:00:19,000 --> 00:00:21,000
Have a great day

8
00:00:22,000 --> 00:00:24,000
See you later

9
00:00:25,000 --> 00:00:27,000
Take care now

10
00:00:28,000 --> 00:00:30,000
Goodbye for now`;

async function testSmallTraining() {
  console.log('🧪 Iniciando teste de treinamento pequeno...\n');

  // Criar arquivo temporário
  const tempFile = 'temp-test-training.srt';
  fs.writeFileSync(tempFile, testSrtContent);

  try {
    console.log('📊 Métricas antes do treinamento:');
    const beforeResponse = await fetch(`${baseUrl}/system-metrics`);
    const beforeMetrics = await beforeResponse.json();
    const dictSizeBefore = beforeMetrics.data.dictionary.totalPhrases;
    const tmSizeBefore = beforeMetrics.data.translationMemory.totalEntries;
    console.log(`- Dicionário: ${dictSizeBefore} frases`);
    console.log(`- TM: ${tmSizeBefore} entradas`);

    console.log('\n📤 Enviando arquivo para treinamento...');
    
    // Preparar form data
    const formData = new FormData();
    formData.append('srtFiles', fs.createReadStream(tempFile));

    const uploadResponse = await fetch(`${baseUrl}/batch-upload`, {
      method: 'POST',
      body: formData
    });

    const uploadResult = await uploadResponse.json();
    
    if (!uploadResult.success) {
      throw new Error(`Upload failed: ${uploadResult.error}`);
    }

    const sessionId = uploadResult.data.sessionId;
    console.log(`✅ Treinamento iniciado - Session ID: ${sessionId}`);

    // Monitorar progresso
    console.log('⏳ Aguardando conclusão do treinamento...');
    let completed = false;
    let attempts = 0;
    const maxAttempts = 30; // 30 segundos

    while (!completed && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      attempts++;

      const statusResponse = await fetch(`${baseUrl}/training-status/${sessionId}`);
      const status = await statusResponse.json();

      if (status.success) {
        const sessionStatus = status.data.summary.status;
        const progress = status.data.summary.progress;
        
        console.log(`📊 Progresso: ${progress.toFixed(1)}% - Status: ${sessionStatus}`);

        if (sessionStatus === 'completed') {
          completed = true;
          console.log('🎉 Treinamento concluído!');
          break;
        } else if (sessionStatus === 'error') {
          throw new Error('Treinamento falhou');
        }
      }
    }

    if (!completed) {
      throw new Error('Timeout waiting for training completion');
    }

    // Aguardar um pouco para auto-aplicação
    console.log('⏳ Aguardando auto-aplicação...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('\n📊 Métricas após o treinamento:');
    const afterResponse = await fetch(`${baseUrl}/system-metrics`);
    const afterMetrics = await afterResponse.json();
    const dictSizeAfter = afterMetrics.data.dictionary.totalPhrases;
    const tmSizeAfter = afterMetrics.data.translationMemory.totalEntries;
    console.log(`- Dicionário: ${dictSizeAfter} frases (${dictSizeAfter - dictSizeBefore > 0 ? '+' : ''}${dictSizeAfter - dictSizeBefore})`);
    console.log(`- TM: ${tmSizeAfter} entradas (${tmSizeAfter - tmSizeBefore > 0 ? '+' : ''}${tmSizeAfter - tmSizeBefore})`);

    if (dictSizeAfter > dictSizeBefore || tmSizeAfter > tmSizeBefore) {
      console.log('\n🎉 SUCESSO! Auto-aplicação funcionando - sistema aprendeu novas frases!');
    } else {
      console.log('\n⚠️ PROBLEMA! Não houve aumento no dicionário ou TM após treinamento');
    }

  } catch (error) {
    console.error('\n❌ Erro no teste:', error.message);
  } finally {
    // Limpar arquivo temporário
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

// Executar teste
testSmallTraining();
