// Script para testar indicadores de treinamento
// Execute este script no console do browser para simular um treinamento ativo

// Simula um treinamento ativo
const simulateActiveTraining = () => {
  const trainingData = {
    sessionId: 'test-session-' + Date.now(),
    startTime: Date.now(),
    status: 'active'
  };
  
  localStorage.setItem('activeTrainingSession', JSON.stringify(trainingData));
  console.log('🧠 Treinamento simulado como ativo');
  console.log('Recarregue a página para ver os indicadores visuais');
};

// Remove treinamento ativo
const clearActiveTraining = () => {
  localStorage.removeItem('activeTrainingSession');
  console.log('✅ Treinamento marcado como concluído');
  console.log('Recarregue a página para remover os indicadores');
};

// Executa automaticamente
console.log('=== TESTE DE INDICADORES DE TREINAMENTO ===');
console.log('Para simular treinamento ativo: simulateActiveTraining()');
console.log('Para limpar treinamento: clearActiveTraining()');

// Simula treinamento ativo automaticamente
simulateActiveTraining();
