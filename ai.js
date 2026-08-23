const { dbHelper } = require('../database');

/**
 * Processa a mensagem do cliente usando a API do Gemini ou o Motor de Regras Inteligente Gratuito
 */
async function generateAiResponse({ userMessage, client, settings }) {
  const companyName = settings.company_name || 'IPTV Premium';
  const pixKey = settings.pix_key || 'Chave PIX não cadastrada';
  const systemPrompt = settings.system_prompt || '';
  const apiKey = settings.gemini_api_key || process.env.GEMINI_API_KEY;

  // Informações do cliente atual
  let clientContext = '';
  if (client) {
    const dueDateFormatted = client.due_date ? client.due_date.split('-').reverse().join('/') : 'Não cadastrado';
    const code = client.client_code || `#${1000 + client.id}`;
    clientContext = `
[DADOS DO CLIENTE QUE ESTÁ CONVERSANDO AGORA]
Nome do Cliente: ${client.name}
Código do Cliente: ${code}
Plano Atual: ${client.plan_name}
Data de Vencimento: ${dueDateFormatted}
Status do Plano: ${client.status === 'active' ? 'Ativo ✅' : 'Vencido ❌'}
Valor do Plano: R$ ${parseFloat(client.price).toFixed(2)}
`;
  } else {
    clientContext = `\n[NÚMERO NÃO CADASTRADO DIRETA OU AUTOMATICAMENTE]\nTrata-se de um novo cliente ou que ainda não se identificou por Nome/Código.`;
  }

  // Tentar responder via API Gemini se houver chave cadastrada
  if (apiKey && apiKey.trim().length > 10) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey.trim());
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const fullPrompt = `
Empresa: ${companyName}
Chave PIX para pagamentos: ${pixKey}

[INSTRUÇÕES DO SISTEMA E PROMPT DO ADMINISTRADOR]
${systemPrompt}

${clientContext}

REGRAS DE RESPOSTA OBRIGATÓRIAS:
1. Sempre cumprimente o cliente pelo NOME ("Olá, [Nome]! 👋") quando o nome for conhecido.
2. Se o cliente for novo ou seu nome/código não for identificado, cumprimente com simpatia e pergunte o Nome ou Código de Cliente para localizá-lo.
3. Responda de forma objetiva, simpática e profissional em Português (Brasil) utilizando emojis.

[MENSAGEM ENVIADA PELO CLIENTE]
"${userMessage}"
      `;

      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Erro na API do Gemini:', error.message);
    }
  }

  // Fallback Inteligente Gratuito (Motor de Regras + Contexto + System Prompt Oficial)
  const msgLower = userMessage.toLowerCase();
  const clientGreeting = client ? `Olá, *${client.name}*!` : `Olá!`;

  if (msgLower.includes('vencimento') || msgLower.includes('vence') || msgLower.includes('data')) {
    if (client) {
      const dueDateFormatted = client.due_date ? client.due_date.split('-').reverse().join('/') : 'Indefinida';
      const code = client.client_code || `#${1000 + client.id}`;
      return `Cadastro localizado com sucesso! ✅\n\n*Nome:* ${client.name}\n*Código:* ${code}\n*Plano:* ${client.plan_name}\n*Valor:* R$ ${parseFloat(client.price).toFixed(2)}\n*Vencimento:* ${dueDateFormatted}\n\nDeseja renovar seu plano agora? Posso enviar a chave PIX para pagamento.`;
    } else {
      return `Claro!\n\nPara localizar seu cadastro, por favor informe *seu nome completo* ou o *código do cliente*.`;
    }
  }

  if (msgLower.includes('pix') || msgLower.includes('pagar') || msgLower.includes('renovar') || msgLower.includes('comprovante') || msgLower.includes('pagamento')) {
    const nameToUse = client ? client.name : 'Cliente';
    return `Perfeito, *${nameToUse}*!\n\nSegue os dados para pagamento via PIX:\n\n*Banco:* CELCOIN\n*Nome:* Gerailton Neves\n*Chave PIX:* \`${pixKey}\`\n\nApós realizar o pagamento, envie o comprovante por aqui para que possamos identificar sua renovação o mais rápido possível.`;
  }

  if (msgLower.includes('teste') || msgLower.includes('degustacao') || msgLower.includes('gratis') || msgLower.includes('grátis')) {
    return `${clientGreeting} 🎁 *Solicitação de Teste Grátis*\n\nEm qual dispositivo você deseja realizar o teste?\n\n1️⃣ TV Smart\n2️⃣ TV Android\n3️⃣ Roku\n4️⃣ TV Box\n5️⃣ Fire Stick\n6️⃣ Chromecast\n7️⃣ Celular Android\n8️⃣ iPhone\n9️⃣ PC / Notebook\n\n_Oferecemos um teste gratuito de 3 horas para você conhecer nosso sistema antes de contratar!_`;
  }

  if (msgLower.includes('plano') || msgLower.includes('preco') || msgLower.includes('preço') || msgLower.includes('valor') || msgLower.includes('tabela')) {
    return `${clientGreeting} 📺 *Planos IPTV - GN IPTV*\n\n## Plano Premium\n📺 *1 Tela*: R$ 35,00 por mês\n📺 *2 Telas*: R$ 70,00 por mês\n\nTodos os planos incluem:\n✅ Canais Abertos e Fechados (HD/4K)\n✅ Filmes e Séries atualizados\n✅ Esportes e Conteúdo Infantil\n✅ Atualizações Frequentes & Alta Qualidade\n\n🔑 *Chave PIX para Assinatura/Renovação*: \`${pixKey}\`\n\n_Oferecemos um teste gratuito de 3 horas, para que você conheça nosso sistema antes de contratar._`;
  }

  // Resposta Padrão baseada no Prompt do Sistema
  return `${clientGreeting} Seja muito bem-vindo(a) à *GN IPTV*! 👋\n\nComo posso te ajudar hoje?\n\n📺 1️⃣ Conhecer nossos planos\n🎁 2️⃣ Solicitar um teste gratuito\n💳 3️⃣ Renovar meu plano\n📅 4️⃣ Consultar vencimento\n🛠️ 5️⃣ Suporte Técnico & Atendente`;
}

module.exports = { generateAiResponse };
