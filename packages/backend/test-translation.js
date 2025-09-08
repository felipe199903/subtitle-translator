import { TranslationService } from './src/services/TranslationService';

async function test() {
  const translationService = new TranslationService();
  try {
    console.log('Testing translation service...');
    const result = await translationService.translateText('Hello world', 'pt-BR');
    console.log('Translation result:', result);
  } catch (error) {
    console.error('Error:', error);
  }
}

test();
