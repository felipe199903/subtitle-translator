const FormData = require('form-data');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

async function testImprovedTranslation() {
    const form = new FormData();
    
    // Lê o arquivo SRT válido
    const srtPath = path.join(__dirname, 'test-improvements.srt');
    const srtContent = fs.readFileSync(srtPath, 'utf8');
    
    form.append('srt', Buffer.from(srtContent), {
        filename: 'test-improvements.srt',
        contentType: 'text/plain'
    });
    form.append('targetLanguage', 'pt-BR');

    try {
        console.log('\n🧪 TESTE DE MELHORIAS - Sistema de Tradução');
        console.log('=' .repeat(60));
        console.log('📊 Testando 20 frases representativas');
        
        const response = await fetch('http://localhost:3001/api/subtitles/translate', {
            method: 'POST',
            body: form,
            headers: form.getHeaders()
        });

        const result = await response.json();
        
        if (result.success) {
            console.log('\n✅ TRADUÇÃO CONCLUÍDA COM SUCESSO!');
            console.log('=' .repeat(60));
            
            const translations = result.data.translatedSubtitles;
            let perfectMatches = 0;
            let goodTranslations = 0;
            let problematicTranslations = 0;
            
            translations.forEach((item, index) => {
                const original = item.text;
                const translated = item.translatedText;
                
                console.log(`\n${index + 1}. "${original}"`);
                console.log(`   → "${translated}"`);
                
                // Análise mais rigorosa da qualidade
                const hasEnglishWords = /\b(the|and|you|are|is|was|have|do|get|make|say|go|know|take|see|come|think|look|want|give|use|find|tell|ask|work|seem|feel|try|leave|call|monochrome|fade|didn't|anything|supposed|immortal)\b/i.test(translated);
                const hasEnglishPhrases = /\b(EU-EU|UM monochrome|didn't ver|supposed to be)\b/i.test(translated);
                const hasPartialEnglish = /\b\w+[A-Z]+\w*\b/.test(translated) && !/^[A-Z][a-z]+$/.test(translated); // Detecta palavras com maiúsculas no meio
                const isComplete = translated.length > original.length * 0.3;
                const hasPortuguese = /[áàâãéêíóôõúç]/i.test(translated) || /\b(você|não|que|com|para|uma|por|até|bem|mas|seu|sua|ele|ela|isso|muito|mais|quando|onde|como|quem|sabe|espere|segundo|acredita|vampiros|biblioteca|agora|vamos|escola|incrível|alguém|boato|circulando|ultimamente|vestibulares|celular|emprestado|amigo|está|bem|sangue)\b/i.test(translated);
                
                let quality = '';
                if (hasEnglishPhrases) {
                    quality = '� PROBLEMÁTICA (híbrida)';
                    problematicTranslations++;
                } else if (hasEnglishWords || hasPartialEnglish) {
                    quality = '🟡 BOA (contém inglês)';
                    goodTranslations++;
                } else if (hasPortuguese || translated !== original) {
                    quality = '🟢 EXCELENTE';
                    perfectMatches++;
                } else {
                    quality = '🔴 PROBLEMÁTICA (sem tradução)';
                    problematicTranslations++;
                }
                
                console.log(`   📊 Qualidade: ${quality}`);
            });
            
            console.log('\n' + '=' .repeat(60));
            console.log('📈 ANÁLISE FINAL DE QUALIDADE');
            console.log('=' .repeat(60));
            console.log(`🟢 Traduções Excelentes: ${perfectMatches}/${translations.length} (${Math.round(perfectMatches/translations.length*100)}%)`);
            console.log(`🟡 Traduções Boas: ${goodTranslations}/${translations.length} (${Math.round(goodTranslations/translations.length*100)}%)`);
            console.log(`🔴 Traduções Problemáticas: ${problematicTranslations}/${translations.length} (${Math.round(problematicTranslations/translations.length*100)}%)`);
            console.log(`📊 Taxa de Sucesso Total: ${Math.round((perfectMatches + goodTranslations)/translations.length*100)}%`);
            
            // Avaliação geral
            const successRate = (perfectMatches + goodTranslations) / translations.length;
            if (successRate >= 0.9) {
                console.log('\n🎉 QUALIDADE EXCEPCIONAL! Sistema funcionando perfeitamente.');
            } else if (successRate >= 0.8) {
                console.log('\n✨ EXCELENTE QUALIDADE! Sistema bem otimizado.');
            } else if (successRate >= 0.7) {
                console.log('\n👍 BOA QUALIDADE! Sistema funcionando bem.');
            } else {
                console.log('\n⚠️  NECESSITA AJUSTES. Sistema precisa de melhorias.');
            }
            
        } else {
            console.error('❌ Erro na tradução:', result.error);
        }
    } catch (error) {
        console.error('💥 Erro na comunicação:', error.message);
    }
}

testImprovedTranslation();
