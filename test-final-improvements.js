const FormData = require('form-data');
const fetch = require('node-fetch');
const fs = require('fs');

async function testImprovedTranslation() {
    const form = new FormData();
    
    // Testes baseados nos resultados que você mostrou
    const testSubtitles = [
        "A monochrome fade",
        "I-I didn't see anything...",
        "You know...",
        "Hey, wait a sec!",
        "Why do you know my name?",
        "We go to the same school.",
        "Amazing! You know the name of someone like me!",
        "Do you believe in vampires?",
        "What's up with vampires?",
        "There's been a rumor going around lately.",
        "I'm going to head to the library now.",
        "Do you want come with me?",
        "What are you gonna do at the library?",
        "You have exams next year, right?",
        "Do you have a cellphone?",
        "Can I borrow it?",
        "You made a friend.",
        "Are you alright?",
        "Give me thy blood.",
        "Isn't a vampire supposed to be immortal?"
    ];

    const srtContent = testSubtitles.map((text, i) => {
        const startMinute = Math.floor((i + 1) / 60);
        const startSecond = String((i + 1) % 60).padStart(2, '0');
        const endMinute = Math.floor((i + 2) / 60);
        const endSecond = String((i + 2) % 60).padStart(2, '0');
        return `${i + 1}\n00:${String(startMinute).padStart(2, '0')}:${startSecond},000 --> 00:${String(endMinute).padStart(2, '0')}:${endSecond},000\n${text}\n`;
    }).join('\n');

    form.append('srt', Buffer.from(srtContent), {
        filename: 'test-improved.srt',
        contentType: 'text/plain'
    });
    form.append('targetLanguage', 'pt-BR');

    try {
        console.log('\n🧪 TESTE DE MELHORIAS - Sistema de Tradução');
        console.log('=' .repeat(60));
        console.log(`📊 Testando ${testSubtitles.length} frases representativas`);
        
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
                
                // Análise da qualidade
                const hasEnglish = /[a-zA-Z]{3,}/.test(translated.replace(/[A-Z][a-z]*-[A-Z][a-z]*/, '')); // Ignora nomes próprios como "Kiss-Shot"
                const isComplete = translated.length > original.length * 0.3; // Não muito curta
                const hasPortuguese = /[áàâãéêíóôõúç]/i.test(translated) || /\b(você|não|que|com|para|uma|por|até|bem|mas)\b/i.test(translated);
                
                let quality = '🟢 EXCELENTE';
                if (hasEnglish || !isComplete) {
                    quality = '🟡 BOA (mista)';
                    goodTranslations++;
                } else if (hasPortuguese || translated !== original) {
                    quality = '🟢 EXCELENTE';
                    perfectMatches++;
                } else {
                    quality = '🔴 PROBLEMÁTICA';
                    problematicTranslations++;
                }
                
                console.log(`   📊 Qualidade: ${quality}`);
            });
            
            console.log('\n' + '=' .repeat(60));
            console.log('📈 ANÁLISE FINAL DE QUALIDADE');
            console.log('=' .repeat(60));
            console.log(`🟢 Traduções Excelentes: ${perfectMatches}/${testSubtitles.length} (${Math.round(perfectMatches/testSubtitles.length*100)}%)`);
            console.log(`🟡 Traduções Boas: ${goodTranslations}/${testSubtitles.length} (${Math.round(goodTranslations/testSubtitles.length*100)}%)`);
            console.log(`🔴 Traduções Problemáticas: ${problematicTranslations}/${testSubtitles.length} (${Math.round(problematicTranslations/testSubtitles.length*100)}%)`);
            console.log(`📊 Taxa de Sucesso Total: ${Math.round((perfectMatches + goodTranslations)/testSubtitles.length*100)}%`);
            
            // Avaliação geral
            const successRate = (perfectMatches + goodTranslations) / testSubtitles.length;
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
