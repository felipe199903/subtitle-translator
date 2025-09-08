const fs = require('fs');

// Cria um arquivo SRT de teste com exemplos mais variados
const testSrt = `1
00:00:01,000 --> 00:00:03,000
Hello world

2
00:00:04,000 --> 00:00:06,000
You know...

3
00:00:07,000 --> 00:00:10,000
Why do you know my name?

4
00:00:11,000 --> 00:00:15,000
Amazing! You know the name of someone like me!

5
00:00:16,000 --> 00:00:20,000
Do you believe in vampires?

6
00:00:21,000 --> 00:00:25,000
There's been a rumor going around lately.

7
00:00:26,000 --> 00:00:30,000
Computer programming is difficult.

8
00:00:31,000 --> 00:00:35,000
The quick brown fox jumps over the lazy dog.`;

// Salva o arquivo de teste
fs.writeFileSync('test-subtitle-improved.srt', testSrt);

// Função para testar a tradução
async function testTranslation() {
    try {
        console.log('🧪 Testing improved translation with realistic anime content...\n');

        const FormData = require('form-data');
        const fetch = require('node-fetch');
        
        // Primeiro, faz upload do arquivo
        const form = new FormData();
        form.append('srtFile', fs.createReadStream('test-subtitle-improved.srt'), {
            filename: 'test-subtitle-improved.srt',
            contentType: 'application/x-subrip'
        });

        console.log('📤 Uploading improved test file...');
        const uploadResponse = await fetch('http://localhost:3001/api/subtitles/upload', {
            method: 'POST',
            body: form
        });

        const uploadData = await uploadResponse.json();
        
        if (!uploadData.success) {
            throw new Error('Upload failed: ' + JSON.stringify(uploadData));
        }

        console.log(`✅ Upload successful! Detected language: ${uploadData.data.originalLanguage}`);
        console.log(`📝 Found ${uploadData.data.subtitles.length} subtitle entries\n`);

        // Agora traduz
        console.log('🔄 Starting translation...');
        const translateResponse = await fetch('http://localhost:3001/api/subtitles/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subtitles: uploadData.data.subtitles,
                targetLanguage: 'pt-BR'
            })
        });

        const translateData = await translateResponse.json();
        
        if (!translateData.success) {
            throw new Error('Translation failed: ' + JSON.stringify(translateData));
        }

        console.log('✅ Translation completed!\n');

        // Analisa os resultados
        console.log('📊 TRANSLATION ANALYSIS:');
        console.log('='.repeat(80));
        
        let tmMatches = 0;
        let dictMatches = 0;
        let apiMatches = 0;
        let originalKept = 0;
        let improvements = [];
        
        translateData.data.translatedSubtitles.forEach((subtitle, index) => {
            const original = subtitle.text;
            const translated = subtitle.translatedText;
            const improved = translated !== original;
            
            if (improved) {
                if (translated.includes('olá mundo') || translated.includes('você sabe') || 
                    translated.includes('Por que você sabe meu nome') || translated.includes('Incrível!') ||
                    translated.includes('vampiros') || translated.includes('boato')) {
                    tmMatches++;
                    improvements.push({
                        index: index + 1,
                        original,
                        translated,
                        source: 'TM/Dictionary',
                        quality: 'EXCELLENT'
                    });
                } else {
                    apiMatches++;
                    improvements.push({
                        index: index + 1,
                        original,
                        translated,
                        source: 'API/Fallback',
                        quality: 'GOOD'
                    });
                }
            } else {
                originalKept++;
            }
            
            console.log(`${index + 1}. "${original}"`);
            console.log(`   → "${translated}"`);
            console.log(`   ${improved ? '✅ TRANSLATED' : '⚠️  ORIGINAL KEPT'}`);
            console.log();
        });

        console.log('=' .repeat(80));
        console.log('📈 SUMMARY:');
        console.log(`🎯 TM/Dictionary matches: ${tmMatches}`);
        console.log(`🤖 API/Fallback translations: ${apiMatches}`);
        console.log(`📄 Original text kept: ${originalKept}`);
        console.log(`📊 Total improvement rate: ${Math.round(((tmMatches + apiMatches) / translateData.data.translatedSubtitles.length) * 100)}%`);
        
        if (improvements.length > 0) {
            console.log('\n🏆 QUALITY IMPROVEMENTS:');
            improvements.forEach(imp => {
                console.log(`   ${imp.index}. ${imp.quality} (${imp.source}): "${imp.original}" → "${imp.translated}"`);
            });
        }

        // Salva o resultado
        fs.writeFileSync('test-result-improved.srt', translateData.data.srtContent);
        console.log('\n💾 Result saved to: test-result-improved.srt');

        // Verifica se a qualidade melhorou
        const qualityScore = (tmMatches * 2 + apiMatches) / translateData.data.translatedSubtitles.length;
        if (qualityScore >= 1.5) {
            console.log('\n🎉 EXCELLENT QUALITY! Translation system working well.');
        } else if (qualityScore >= 1.0) {
            console.log('\n👍 GOOD QUALITY! Translation system functional.');
        } else {
            console.log('\n⚠️  NEEDS IMPROVEMENT! Some translations may need refinement.');
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

// Executa o teste
testTranslation();
