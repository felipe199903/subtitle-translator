const FormData = require('form-data');
const fs = require('fs');
const fetch = require('node-fetch');

// Criar um arquivo SRT de teste
const testSrtContent = `1
00:00:01,000 --> 00:00:03,000
Hello world

2
00:00:04,000 --> 00:00:06,000
This is a test subtitle

3
00:00:07,000 --> 00:00:09,000
How are you?
`;

console.log('📦 Testando upload em lotes - simulando muitos arquivos...');

async function testBatchUpload() {
  try {
    // Criar arquivos temporários
    const tempFiles = [];
    const numFiles = 160; // Mais que o limite de 150
    
    for (let i = 1; i <= numFiles; i++) {
      const fileName = `test-${i}.srt`;
      fs.writeFileSync(fileName, testSrtContent.replace('Hello world', `Hello world ${i}`));
      tempFiles.push(fileName);
    }
    
    console.log(`✅ Criados ${tempFiles.length} arquivos de teste`);
    
    // Tentar upload de todos os arquivos de uma vez (deve falhar)
    const form = new FormData();
    
    tempFiles.forEach(fileName => {
      form.append('srtFiles', fs.createReadStream(fileName));
    });
    
    console.log(`📤 Tentando upload de ${numFiles} arquivos (acima do limite de 150)...`);
    
    const response = await fetch('http://localhost:3001/api/subtitles/batch-upload', {
      method: 'POST',
      body: form
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Upload bem-sucedido:', result);
    } else {
      console.log('❌ Erro esperado:', result);
      
      if (result.errorCode === 'LIMIT_FILE_COUNT') {
        console.log('✅ Sistema detectou corretamente o erro "Too many files"');
        console.log('💡 Sugestão do sistema:', result.suggestion);
        console.log('📊 Limite máximo:', result.maxFilesAllowed);
      }
    }
    
    // Limpar arquivos temporários
    tempFiles.forEach(fileName => {
      try {
        fs.unlinkSync(fileName);
      } catch (e) {
        // Ignore cleanup errors
      }
    });
    
    console.log('🗑️ Arquivos temporários removidos');
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  }
}

testBatchUpload();
