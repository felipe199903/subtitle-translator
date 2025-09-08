const axios = require('axios');
const fs = require('fs');

// Create a simple SRT file for testing
const srtContent = `1
00:00:01,000 --> 00:00:05,000
This is a test subtitle

2
00:00:06,000 --> 00:00:10,000
Hello world

3
00:00:11,000 --> 00:00:15,000
The quick brown fox jumps over the lazy dog
`;

fs.writeFileSync('test-subtitle.srt', srtContent);

async function testFrontendAPI() {
  try {
    console.log('📤 Testing Frontend API Flow...\n');
    
    // Step 1: Upload file to get parsed subtitles
    console.log('Step 1: Uploading SRT file...');
    const FormData = require('form-data');
    const form = new FormData();
    form.append('srtFile', fs.createReadStream('test-subtitle.srt'), 'test-subtitle.srt');
    
    const uploadResponse = await axios.post('http://localhost:3001/api/subtitles/upload', form, {
      headers: {
        ...form.getHeaders(),
      },
    });
    
    console.log('✅ Upload Response:');
    console.log(JSON.stringify(uploadResponse.data, null, 2));
    
    const subtitles = uploadResponse.data.data.subtitles;
    
    // Step 2: Translate the parsed subtitles
    console.log('\nStep 2: Translating subtitles...');
    const translateResponse = await axios.post('http://localhost:3001/api/subtitles/translate', {
      subtitles: subtitles,
      targetLanguage: 'pt-BR'
    });
    
    console.log('\n✅ Translation Response:');
    console.log(JSON.stringify(translateResponse.data, null, 2));
    
    // Check if we got TM matches from the translation response
    const segments = translateResponse.data.data.translatedSubtitles || [];
    console.log('\n📊 Translated Segments:');
    segments.forEach((seg, i) => {
      console.log(`${i+1}. "${seg.text}" → "${seg.translatedText}"`);
    });
    
    // Note: The enhanced translation info is logged by the server but not returned in the API response
    // This is expected behavior for the frontend integration
    
    // Clean up
    fs.unlinkSync('test-subtitle.srt');
    
  } catch (error) {
    console.error('❌ Error testing frontend API:');
    console.error('Status:', error.response?.status);
    console.error('Data:', error.response?.data);
    console.error('Message:', error.message);
    if (fs.existsSync('test-subtitle.srt')) {
      fs.unlinkSync('test-subtitle.srt');
    }
  }
}

testFrontendAPI();
