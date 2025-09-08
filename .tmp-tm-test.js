// Quick test to check TM database contents
const axios = require('axios');

async function testTMDatabase() {
  try {
    console.log('🔍 Testing TM database contents...\n');
    
    // Test the direct translation endpoint from server.js (if available)
    try {
      const directResponse = await axios.post('http://localhost:3001/translate', {
        text: 'This is a test subtitle'
      });
      console.log('✅ Direct translation endpoint response:');
      console.log(JSON.stringify(directResponse.data, null, 2));
    } catch (e) {
      console.log('❌ Direct translation endpoint not available:', e.response?.status);
    }
    
    // Test TM save endpoint
    try {
      const saveResponse = await axios.post('http://localhost:3001/tm/save', {
        src: 'Test save',
        tgt: 'Testar salvar'
      });
      console.log('\n✅ TM save endpoint response:');
      console.log(JSON.stringify(saveResponse.data, null, 2));
    } catch (e) {
      console.log('\n❌ TM save endpoint not available:', e.response?.status);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testTMDatabase();
