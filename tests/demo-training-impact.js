const FormData = require('form-data');
const fs = require('fs');
const fetch = require('node-fetch');

// Criar um arquivo SRT de teste com mais conteúdo
const testSrtContent = `1
00:00:01,000 --> 00:00:03,000
Hello world! This is amazing.

2
00:00:04,000 --> 00:00:06,000
How are you today? I hope you are well.

3
00:00:07,000 --> 00:00:09,000
This system is learning from our data.

4
00:00:10,000 --> 00:00:12,000
Machine learning is fascinating technology.

5
00:00:13,000 --> 00:00:15,000
Thank you for helping us improve.
`;

console.log('📊 Demonstrando impacto do treinamento nas métricas...');

async function demonstrateTrainingImpact() {
  try {
    // 1. Primeiro, obter métricas iniciais
    console.log('\n🔍 Obtendo métricas iniciais do sistema...');
    const initialMetrics = await fetch('http://localhost:3001/api/subtitles/system-metrics');
    const initialData = await initialMetrics.json();
    
    console.log('📈 Métricas Iniciais:');
    console.log(`  - TM Entries: ${initialData.data.translationMemory.totalEntries}`);
    console.log(`  - Dictionary: ${initialData.data.dictionary.totalPhrases} frases`);
    console.log(`  - Training Sessions: ${initialData.data.training.totalSessions}`);
    console.log(`  - System Health: TM=${initialData.data.systemHealth.tmDatabase}, Dict=${initialData.data.systemHealth.dictionary}, Training=${initialData.data.systemHealth.trainingData}`);
    
    // 2. Criar alguns arquivos para treinamento
    console.log('\n📁 Criando arquivos de teste para treinamento...');
    const tempFiles = [];
    const numFiles = 5; // Número pequeno para teste rápido
    
    for (let i = 1; i <= numFiles; i++) {
      const fileName = `demo-${i}.srt`;
      const customContent = testSrtContent.replace(/Hello world!/g, `Hello world from file ${i}!`);
      fs.writeFileSync(fileName, customContent);
      tempFiles.push(fileName);
    }
    
    console.log(`✅ Criados ${tempFiles.length} arquivos para demonstração`);
    
    // 3. Executar treinamento em lote
    console.log('\n🎓 Iniciando treinamento...');
    const form = new FormData();
    
    tempFiles.forEach(fileName => {
      form.append('srtFiles', fs.createReadStream(fileName));
    });
    
    const trainingResponse = await fetch('http://localhost:3001/api/subtitles/batch-upload', {
      method: 'POST',
      body: form
    });
    
    const trainingResult = await trainingResponse.json();
    
    if (trainingResponse.ok && trainingResult.success) {
      console.log(`✅ Treinamento iniciado! Session ID: ${trainingResult.data.sessionId}`);
      
      // 4. Aguardar conclusão do treinamento
      console.log('\n⏳ Aguardando conclusão do treinamento...');
      let completed = false;
      let attempts = 0;
      const maxAttempts = 30; // 30 segundos máximo
      
      while (!completed && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Aguardar 1 segundo
        attempts++;
        
        try {
          const statusResponse = await fetch(`http://localhost:3001/api/subtitles/training-status/${trainingResult.data.sessionId}`);
          const statusData = await statusResponse.json();
          
          if (statusResponse.ok && statusData.success) {
            const progress = statusData.data.summary;
            console.log(`  📊 Progresso: ${progress.processedFiles}/${progress.totalFiles} arquivos (${progress.progress.toFixed(1)}%)`);
            
            if (progress.status === 'completed') {
              completed = true;
              console.log('🎉 Treinamento concluído!');
              
              // Mostrar estatísticas do treinamento
              console.log('\n📊 Estatísticas do Treinamento:');
              console.log(`  - Total de legendas: ${progress.totalSubtitles}`);
              console.log(`  - Traduzidas: ${progress.totalTranslated}`);
              console.log(`  - Frases únicas: ${progress.totalUniquePhrases}`);
              console.log(`  - TM hits: ${progress.translationStats.tmHits}`);
              console.log(`  - Dict hits: ${progress.translationStats.dictHits}`);
              console.log(`  - API translations: ${progress.translationStats.apiTranslations}`);
              
            } else if (progress.status === 'error') {
              console.log(`❌ Treinamento falhou: ${progress.error}`);
              break;
            }
          }
        } catch (statusError) {
          console.log(`⚠️ Erro ao verificar status: ${statusError.message}`);
        }
      }
      
      // 5. Obter métricas finais e comparar
      if (completed) {
        console.log('\n🔍 Obtendo métricas finais...');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Aguardar 2 segundos para processar
        
        const finalMetrics = await fetch('http://localhost:3001/api/subtitles/system-metrics');
        const finalData = await finalMetrics.json();
        
        console.log('\n📈 Comparação de Métricas:');
        console.log('ANTES → DEPOIS:');
        console.log(`  - TM Entries: ${initialData.data.translationMemory.totalEntries} → ${finalData.data.translationMemory.totalEntries} (+${finalData.data.translationMemory.totalEntries - initialData.data.translationMemory.totalEntries})`);
        console.log(`  - Dictionary: ${initialData.data.dictionary.totalPhrases} → ${finalData.data.dictionary.totalPhrases} frases (+${finalData.data.dictionary.totalPhrases - initialData.data.dictionary.totalPhrases})`);
        console.log(`  - Training Sessions: ${initialData.data.training.totalSessions} → ${finalData.data.training.totalSessions} (+${finalData.data.training.totalSessions - initialData.data.training.totalSessions})`);
        
        console.log('\n🎯 Impacto do Treinamento:');
        console.log(`  - Files Processed: ${finalData.data.training.totalFilesProcessed}`);
        console.log(`  - Phrases Learned: ${finalData.data.training.totalPhrasesLearned}`);
        console.log(`  - System Health: TM=${finalData.data.systemHealth.tmDatabase}, Dict=${finalData.data.systemHealth.dictionary}, Training=${finalData.data.systemHealth.trainingData}`);
        
        if (finalData.data.recommendations && finalData.data.recommendations.length > 0) {
          console.log('\n💡 Novas Recomendações:');
          finalData.data.recommendations.forEach((rec, index) => {
            console.log(`  ${index + 1}. ${rec}`);
          });
        }
        
        // 6. Performance comparison se disponível
        if (finalData.data.performance.averageTranslationMethods) {
          console.log('\n⚡ Performance do Sistema:');
          const perf = finalData.data.performance.averageTranslationMethods;
          console.log(`  - TM Hit Rate: ${perf.tmHitRate}`);
          console.log(`  - Dict Hit Rate: ${perf.dictHitRate}`);
          console.log(`  - API Usage: ${perf.apiUsageRate}`);
          console.log(`  - Skip Rate: ${perf.skipRate}`);
        }
        
        console.log('\n✨ O sistema agora está mais inteligente e pode traduzir melhor conteúdo similar!');
      }
      
    } else {
      console.log(`❌ Erro no treinamento:`, trainingResult);
    }
    
    // Limpar arquivos temporários
    tempFiles.forEach(fileName => {
      try {
        fs.unlinkSync(fileName);
      } catch (e) {
        // Ignore cleanup errors
      }
    });
    
    console.log('\n🗑️ Arquivos temporários removidos');
    console.log('🎉 Demonstração concluída! Acesse http://localhost:4200/training para ver as métricas na interface.');
    
  } catch (error) {
    console.error('❌ Erro na demonstração:', error.message);
  }
}

demonstrateTrainingImpact();
