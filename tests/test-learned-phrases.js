#!/usr/bin/env node

/**
 * Teste para verificar se as frases aprendidas no treinamento 
 * estão sendo aplicadas corretamente nas traduções
 */

const baseUrl = 'http://localhost:3001/api/subtitles';

// Frases que deveriam estar no dicionário após o treinamento
const testPhrases = [
  'hello world',
  'you know',
  'thank you',
  'computer',
  'vampire',
  'how are you',
  'what are you',
  'my name is',
  'I\'m sorry',
  'excuse me'
];

async function testLearnedPhrases() {
  console.log('🧪 Testando frases aprendidas no treinamento...\n');
  
  let tmHits = 0;
  let dictHits = 0;
  let apiHits = 0;
  let total = testPhrases.length;
  
  for (const phrase of testPhrases) {
    try {
      const encodedPhrase = encodeURIComponent(phrase);
      const response = await fetch(`${baseUrl}/test-translation?text=${encodedPhrase}&targetLanguage=pt-BR`);
      const result = await response.json();
      
      if (result.success) {
        const translation = result.data.testResults.fullPipeline;
        const via = translation.via;
        
        if (via === 'TM' || via === 'FUZZY') {
          tmHits++;
          console.log(`✅ TM: "${phrase}" → "${translation.tgt}" (${via})`);
        } else if (via === 'DICT') {
          dictHits++;
          console.log(`📚 DICT: "${phrase}" → "${translation.tgt}"`);
        } else if (via === 'API') {
          apiHits++;
          console.log(`🌐 API: "${phrase}" → "${translation.tgt}"`);
        } else {
          console.log(`⚠️ OTHER: "${phrase}" → "${translation.tgt}" (${via})`);
        }
      } else {
        console.log(`❌ Erro testando "${phrase}":`, result.error);
      }
    } catch (error) {
      console.log(`❌ Erro testando "${phrase}":`, error.message);
    }
  }
  
  console.log('\n📊 Resultados do teste:');
  console.log(`TM Hits: ${tmHits}/${total} (${Math.round(tmHits/total*100)}%)`);
  console.log(`Dictionary Hits: ${dictHits}/${total} (${Math.round(dictHits/total*100)}%)`);
  console.log(`API Hits: ${apiHits}/${total} (${Math.round(apiHits/total*100)}%)`);
  console.log(`Total aprendido: ${tmHits + dictHits}/${total} (${Math.round((tmHits + dictHits)/total*100)}%)`);
  
  if (tmHits + dictHits > total * 0.7) {
    console.log('\n🎉 SUCESSO! O sistema está aplicando efetivamente o aprendizado!');
  } else if (tmHits + dictHits > total * 0.4) {
    console.log('\n✅ BOM! O sistema está parcialmente aplicando o aprendizado.');
  } else {
    console.log('\n⚠️ PROBLEMA! O sistema não está aplicando o aprendizado adequadamente.');
  }
}

// Executar teste
testLearnedPhrases().catch(console.error);
