const fs = require('fs');
let baileysPkg = null;
try {
  baileysPkg = require('@whiskeysockets/baileys');
} catch (e) {
  try {
    baileysPkg = require('baileys');
  } catch (err) {
    console.log('Módulo WhatsApp rodando em modo simulação.');
  }
}

const makeWASocket = baileysPkg ? (baileysPkg.makeWASocket || baileysPkg.default || baileysPkg) : null;
const useMultiFileAuthState = baileysPkg ? baileysPkg.useMultiFileAuthState : null;
const DisconnectReason = baileysPkg ? baileysPkg.DisconnectReason : {};
const fetchLatestBaileysVersion = baileysPkg ? baileysPkg.fetchLatestBaileysVersion : null;
const QRCode = require('qrcode');
const path = require('path');
let dbHelper;
try {
  dbHelper = require('./database').dbHelper;
} catch (e) {
  try {
    dbHelper = require('../database').dbHelper;
  } catch (err) {
    console.error('Erro ao carregar database:', err);
  }
}

let generateAiResponse;
try {
  generateAiResponse = require('./ai').generateAiResponse;
} catch (e) {
  try {
    generateAiResponse = require('./services/ai').generateAiResponse;
  } catch (err) {
    generateAiResponse = async () => 'Atendimento IPTV desativado temporariamente.';
  }
}

let pino;
try {
  pino = require('pino');
} catch (e) {
  pino = () => ({ level: 'silent', child: () => ({ level: 'silent', info: () => {}, error: () => {}, debug: () => {} }), info: () => {}, error: () => {}, debug: () => {} });
}

let sock = null;
let qrCodeDataUrl = null;
let lastRawQr = null;
let connectionStatus = 'disconnected'; // 'disconnected', 'connecting', 'connected'
let listeners = [];

function notifyListeners(data) {
  listeners.forEach(cb => cb(data));
}

function onStatusChange(callback) {
  listeners.push(callback);
}

async function initWhatsApp() {
  if (!makeWASocket || typeof useMultiFileAuthState !== 'function') {
    console.log('📱 Módulo WhatsApp rodando em modo simulação.');
    connectionStatus = 'disconnected';
    notifyListeners({ status: 'disconnected', qr: null });
    return;
  }

  const authDir = path.join(__dirname, 'data', 'baileys_auth');
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    connectionStatus = qrCodeDataUrl ? 'qr_ready' : 'connecting';
    notifyListeners({ status: connectionStatus, qr: qrCodeDataUrl });

    sock = makeWASocket({
      auth: state,
      logger: typeof pino === 'function' ? pino({ level: 'silent' }) : undefined,
      printQRInTerminal: false,
      browser: (baileysPkg && baileysPkg.Browsers ? baileysPkg.Browsers.ubuntu('Chrome') : ['Ubuntu', 'Chrome', '22.04.4'])
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        lastRawQr = qr;
        connectionStatus = 'qr_ready';
        QRCode.toDataURL(qr).then(dataUrl => {
          qrCodeDataUrl = dataUrl;
          connectionStatus = 'qr_ready';
          notifyListeners({ status: 'qr_ready', qr: qrCodeDataUrl });
          console.log('📱 Novo QR Code gerado para o WhatsApp');
        }).catch(err => {
          console.error('Erro ao gerar QRCode dataURL:', err.message);
        });
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = (statusCode !== DisconnectReason.loggedOut && statusCode !== 401);
        console.log('Conexão com WhatsApp fechada. Reconectando:', shouldReconnect, 'Code:', statusCode);
        
        if (connectionStatus === 'connected') {
          if (shouldReconnect) {
            setTimeout(initWhatsApp, 3000);
          }
          return;
        }

        if (connectionStatus === 'qr_ready' || qrCodeDataUrl || lastRawQr) {
          connectionStatus = 'qr_ready';
          if (qrCodeDataUrl) notifyListeners({ status: 'qr_ready', qr: qrCodeDataUrl });
          return;
        }

        if (shouldReconnect) {
          connectionStatus = 'connecting';
          notifyListeners({ status: 'connecting', qr: null });
          setTimeout(initWhatsApp, 3000);
        } else {
          connectionStatus = 'disconnected';
          qrCodeDataUrl = null;
          lastRawQr = null;
          notifyListeners({ status: 'disconnected', qr: null });
          console.log('🧹 Limpando sessão antiga do WhatsApp para gerar novo QR Code...');
          try {
            if (fs.existsSync(authDir)) {
              fs.rmSync(authDir, { recursive: true, force: true });
            }
          } catch (e) {
            console.error('Erro ao limpar pasta auth:', e.message);
          }
          setTimeout(initWhatsApp, 2000);
        }
      } else if (connection === 'open') {
        console.log('✅ WhatsApp Conectado com Sucesso!');
        connectionStatus = 'connected';
        qrCodeDataUrl = null;
        notifyListeners({ status: connectionStatus, qr: null });
        dbHelper.updateSetting('whatsapp_status', 'connected').catch(e => console.error('Erro ao atualizar whatsapp_status no banco:', e.message));
      }
    });

    async function trigger10MinDoubtFollowup(cleanPhone, jid) {
      try {
        if (!sock || connectionStatus !== 'connected') return;

        console.log(`⏳ Passaram-se 10 minutos do atendimento humano com ${cleanPhone}. Enviando mensagem de dúvidas...`);

        const followupText = `Olá! Passando para saber: Ficou alguma dúvida sobre o seu atendimento? 😊`;

        const sent = await sock.sendMessage(jid, { text: followupText });
        if (sent && sent.key && sent.key.id) {
          sentByBotIds.add(sent.key.id);
        }

        doubtFollowupPending.set(cleanPhone, true);
        if (humanTakeovers.has(cleanPhone)) {
          humanTakeovers.get(cleanPhone).paused = false;
        }
      } catch (err) {
        console.error(`Erro ao enviar acompanhamento de 10 min para ${cleanPhone}:`, err.message);
      }
    }

    sock.ev.on('messages.upsert', async (m) => {
      if (m.type !== 'notify') return;

      for (const msg of m.messages) {
        try {
          if (!msg.message) continue;

          const from = msg.key.remoteJid;
          if (!from || from.endsWith('@g.us')) continue; // Ignorar grupos

          const cleanPhone = from.replace(/\D/g, '');
          const msgId = msg.key.id;

          // DETECÇÃO DE MENSAGEM MANUAL DO ATENDENTE HUMANO (ADMIN)
          if (msg.key.fromMe) {
            if (sentByBotIds.has(msgId)) {
              sentByBotIds.delete(msgId);
              continue; // Ignorar mensagens geradas pelo próprio robô
            }

            console.log(`👨‍💼 Atendente Humano respondeu manualmente para ${cleanPhone}. Pausando robô e iniciando timer de 10 minutos...`);

            if (humanTakeovers.has(cleanPhone)) {
              const prev = humanTakeovers.get(cleanPhone);
              if (prev.timer) clearTimeout(prev.timer);
            }

            const timer = setTimeout(async () => {
              await trigger10MinDoubtFollowup(cleanPhone, from);
            }, 10 * 60 * 1000); // 10 minutos

            humanTakeovers.set(cleanPhone, {
              paused: true,
              timer,
              lastHumanTime: Date.now()
            });

            continue;
          }

          const senderName = msg.pushName || 'Cliente';
          const textMessage = msg.message.conversation ||
            msg.message.extendedTextMessage?.text || '';

          if (!textMessage || textMessage.trim() === '') continue;

          // Ignorar mensagens automáticas / de outros bots
          if (
            textMessage.includes('🤖') ||
            textMessage.includes('Atendimento Automático') ||
            textMessage.includes('Escolha uma das opções') ||
            textMessage.includes('http://localhost') ||
            textMessage.includes('RENOVAÇÃO CONFIRMADA') ||
            textMessage.includes('RECIBO DE RENOVAÇÃO')
          ) {
            continue;
          }

          // SE O ATENDENTE HUMANO ESTIVER NA CONVERSA (ROBÔ PAUSADO):
          if (humanTakeovers.has(cleanPhone) && humanTakeovers.get(cleanPhone).paused) {
            console.log(`⏸️ Robô pausado para ${cleanPhone} pois atendente humano assumiu o chat.`);
            continue;
          }

          const msgTrim = textMessage.trim().toLowerCase();

          // SE O CLIENTE ESTIVER RESPONDENDO À PERGUNTA DE 10 MINUTOS ("Ficou alguma dúvida?")
          if (doubtFollowupPending.has(cleanPhone)) {
            doubtFollowupPending.delete(cleanPhone);
            humanTakeovers.delete(cleanPhone);

            const noResponses = ['não', 'nao', 'nao ficou', 'não ficou', 'nenhuma', 'tudo certo', 'obrigado', 'obg', 'vlw', 'tá ok', 'ta ok', 'tudo ok', 'sem duvida', 'sem dúvida', 'nada'];
            const isNoDoubt = noResponses.some(r => msgTrim === r || msgTrim.includes(r));

            if (isNoDoubt) {
              const botResponse = `Perfeito! Agradecemos o contato e estamos sempre à disposição. Desejamos um excelente dia e ótimo entretenimento! 📺🍿`;
              const sent = await sock.sendMessage(from, { text: botResponse });
              if (sent && sent.key && sent.key.id) sentByBotIds.add(sent.key.id);
              await dbHelper.addBotLog(cleanPhone, senderName, textMessage, botResponse);
              console.log(`🤖 Atendimento finalizado para ${cleanPhone} após resposta sem dúvidas.`);
              continue;
            } else {
              const botResponse = `Qual é a sua dúvida? Pode me perguntar por aqui que vou te ajudar a resolver agora mesmo! 😊`;
              const sent = await sock.sendMessage(from, { text: botResponse });
              if (sent && sent.key && sent.key.id) sentByBotIds.add(sent.key.id);
              await dbHelper.addBotLog(cleanPhone, senderName, textMessage, botResponse);
              console.log(`🤖 Pergunta de dúvida enviada para ${cleanPhone}.`);
              continue;
            }
          }

          // Anti-loop temporal: não responder a mesma pessoa em menos de 4 segundos
          const now = Date.now();
          const lastTime = lastResponseTimes.get(cleanPhone) || 0;
          if (now - lastTime < 4000) {
            console.log(`⏳ Ignorando mensagem rápida repetida de ${cleanPhone} (Anti-loop)`);
            continue;
          }

          console.log(`📩 Mensagem recebida de ${senderName} (${cleanPhone}): "${textMessage}"`);

          // Verificar se bot está ativado nas configurações
          const settings = await dbHelper.getSettings();
          const greetings = ['menu', 'opcoes', 'opções', '0', 'inicio', 'iniciar', 'olá', 'ola', 'oi', 'oii', 'oiii', 'boa tarde', 'bom dia', 'boa noite'];
          const isGreeting = greetings.includes(msgTrim);

          // Identificar intenção da mensagem conforme o Prompt Mestre Oficial
          const isPlanQuery = msgTrim === '1' || msgTrim.includes('plano') || msgTrim.includes('planos') || msgTrim.includes('preço') || msgTrim.includes('precos') || msgTrim.includes('valor') || msgTrim.includes('valores') || msgTrim.includes('tabela') || msgTrim.includes('conhecer os planos') || msgTrim.includes('conhecer');
          const isTestQuery = msgTrim === '2' || msgTrim.includes('teste') || msgTrim.includes('testar') || msgTrim.includes('gratis') || msgTrim.includes('grátis');
          const isPixQuery = msgTrim === '3' || msgTrim.includes('pix') || msgTrim.includes('renovar') || msgTrim.includes('pagamento') || msgTrim.includes('pagar') || msgTrim.includes('renovação');
          const isDueDateQuery = msgTrim === '4' || msgTrim.includes('vencimento') || msgTrim.includes('vence') || msgTrim.includes('mensalidade') || msgTrim.includes('consultar meu plano');
          const isSupportQuery = msgTrim === '5' || msgTrim === 'atendente' || msgTrim.includes('suporte') || msgTrim.includes('problema') || msgTrim.includes('não funciona') || msgTrim.includes('cancelamento') || msgTrim.includes('contratar');
          const isAppInstallQuery = msgTrim === '6' || msgTrim.includes('instalei') || msgTrim.includes('já instalei') || msgTrim.includes('aplicativo instalado') || msgTrim.includes('blessed instalado') || msgTrim.includes('instalação');

          // Busca direta de cadastro por código ou nome (NUNCA rodar para cumprimentos como 'Oi' ou 'Olá')
          let searchResult = { client: null, ambiguous: false };
          let activeClient = await dbHelper.getClientByPhone(cleanPhone);

          if (!activeClient && !isGreeting && !isPlanQuery && !isTestQuery && !isPixQuery && !isSupportQuery && !isAppInstallQuery && !isDueDateQuery && textMessage.length >= 2) {
            searchResult = await dbHelper.searchClientSmart(textMessage);
            activeClient = searchResult.client;
          }

          const clientNameGreeting = activeClient ? `Olá, *${activeClient.name}*!` : `Olá!`;

          // Processar Mensagem e Gerar Resposta estritamente conforme o Prompt
          let botResponse = '';

          // 1. Cumprimentos e Saudação Inicial ('Oi', 'Olá', 'Boa noite', 'Menu', '0') -> Apresentar Menu Principal
          if (isGreeting) {
            botResponse = getInteractiveMenuText(settings, activeClient);
          }
          // 2. Ambiguidade (Mais de 1 cliente retornado com mesmo nome)
          else if (searchResult.ambiguous) {
            botResponse = `Encontrei mais de um cliente cadastrado com esse nome.\n\nPor favor, digite seu *nome completo com sobrenome* ou o seu *código de cliente* (ex: 812600) para eu exibir os dados exatos do seu plano.`;
          }
          // 3. Opção 1 - Conhecer Nossos Planos (Texto Exato do Prompt)
          else if (isPlanQuery) {
            const pixKey = settings.pix_key || '11985897774';

            botResponse = `${clientNameGreeting}\n\n📺 *Planos IPTV - GN IPTV*\n\n## Plano Premium\n📺 *1 Tela*: R$ 35,00 por mês\n\n📺 *2 Telas*: R$ 70,00 por mês\n\nTodos os planos incluem:\n✅ Canais Abertos\n✅ Canais Fechados\n✅ Filmes\n✅ Séries\n✅ Esportes\n✅ Conteúdo Infantil\n✅ Atualizações Frequentes\n✅ Excelente qualidade de imagem\n\n🔑 *Chave PIX*: \`${pixKey}\`\n\n_Oferecemos um teste gratuito de 3 horas, para que você conheça nosso sistema antes de contratar._`;

          }
          // 4. Opção 2 - Solicitar Teste Gratuito (Texto Exato do Prompt)
          else if (isTestQuery) {
            botResponse = `${clientNameGreeting} 🎁 *Solicitação de Teste Grátis*\n\nEm qual dispositivo você deseja realizar o teste?\n\n1️⃣ TV Smart\n2️⃣ TV Android\n3️⃣ Roku\n4️⃣ TV Box\n5️⃣ Fire Stick\n6️⃣ Chromecast\n7️⃣ Celular Android\n8️⃣ iPhone\n9️⃣ PC / Notebook\n\n_Oferecemos um teste gratuito de 3 horas!_`;

          }
          // 5. Opção 3 - Renovar Plano / PIX (Texto Exato do Prompt)
          else if (isPixQuery) {
            const nameToUse = activeClient ? activeClient.name : senderName;
            const pixKey = settings.pix_key || '11985897774';
            botResponse = `Perfeito, *${nameToUse}*!\n\nSegue os dados para pagamento via PIX:\n\n*Banco:* CELCOIN\n*Nome:* Gerailton Neves\n*Chave PIX:* \`${pixKey}\`\n\nApós realizar o pagamento, envie o comprovante por aqui para que possamos identificar sua renovação o mais rápido possível.`;

          }
          // 6. Opção 4 - Consultar Vencimento (Texto Exato do Prompt)
          else if (isDueDateQuery || activeClient) {
            if (activeClient) {
              const dueDateFormatted = activeClient.due_date ? activeClient.due_date.split('-').reverse().join('/') : 'Indefinido';
              const promptCodeMatch = activeClient.notes ? activeClient.notes.match(/#(\d+)/) : null;
              const displayCode = promptCodeMatch ? promptCodeMatch[1] : (activeClient.client_code || `${1000 + activeClient.id}`);
              
              botResponse = `Cadastro localizado com sucesso! ✅\n\n*Nome:* ${activeClient.name}\n*Código:* ${displayCode}\n*Plano:* ${activeClient.plan_name}\n*Valor:* R$ ${parseFloat(activeClient.price).toFixed(2)}\n*Vencimento:* ${dueDateFormatted}\n\nDeseja renovar seu plano agora? Posso enviar a chave PIX para pagamento.`;
            } else {
              botResponse = `Claro!\n\nPara localizar seu cadastro, por favor informe *seu nome completo* ou o *código do cliente*.`;
            }

          }
          // 7. Opção 6 - Instalação do Aplicativo (Texto Exato do Prompt)
          else if (isAppInstallQuery) {
            botResponse = `Perfeito!\n\nInstale em seu dispositivo o aplicativo:\n\n📺 *BLESSED PLAYER*\n\nApós instalar, envie uma foto da tela do aplicativo mostrando o código do seu dispositivo.\n\n⚠️ Para agilizar seu atendimento, envie também uma foto da tela de aplicativos da sua TV ou aparelho.\n\nAssim que recebermos o código, realizaremos o cadastro e enviaremos seus dados de acesso.\n\nSe já enviou as fotos, suporte via WhatsApp:\nhttps://wa.me/5511972560991`;

          }
          // 8. Opção 5 - Suporte Técnico & Atendente (Texto Exato do Prompt)
          else if (isSupportQuery) {
            botResponse = `Sem problemas!\n\nVou encaminhar você para nosso atendimento especializado:\n\nhttps://wa.me/5511972560991\n\nNossa equipe terá prazer em ajudar você.`;

          }
          // 9. Fallback Geral com IA usando o System Prompt
          else {
            botResponse = await generateAiResponse({
              userMessage: textMessage,
              client: activeClient,
              settings
            });
          }

          // Enviar resposta no WhatsApp com proteção contra erros

          // Enviar resposta no WhatsApp com proteção contra erros
          if (botResponse && sock && connectionStatus === 'connected') {
            lastResponseTimes.set(cleanPhone, now);
            const sent = await sock.sendMessage(from, { text: botResponse });
            if (sent && sent.key && sent.key.id) sentByBotIds.add(sent.key.id);
            await dbHelper.addBotLog(cleanPhone, senderName, textMessage, botResponse);
            console.log(`🤖 Resposta enviada para ${cleanPhone}`);
          }
        } catch (msgErr) {
          console.error(`Erro ao processar mensagem no WhatsApp:`, msgErr.message);
        }
      }
    });

  } catch (err) {
    console.error('Erro ao inicializar Baileys:', err.message);
    connectionStatus = 'disconnected';
    notifyListeners({ status: connectionStatus, qr: null });
  }
}

function getInteractiveMenuText(settings, client = null) {
  const company = settings.company_name || 'GN IPTV';
  const nameGreeting = client ? `Olá, *${client.name}*!` : `Olá!`;

  return `🤖 *GN IPTV - Secretário Virtual Inteligente*

${nameGreeting} Seja muito bem-vindo(a) à *${company}*! 👋
Meu nome é Assistente Virtual da GN IPTV e será um prazer atender você.

Posso ajudar você com:

📺 1️⃣ *Conhecer nossos planos*
🎁 2️⃣ *Solicitar um teste gratuito*
💳 3️⃣ *Renovar meu plano*
📅 4️⃣ *Consultar vencimento*
🛠️ 5️⃣ *Suporte Técnico & Atendente*
📲 6️⃣ *Instalação do aplicativo*

_Por favor, digite o número da opção desejada:_`;
}

// Enviar mensagem direta para um cliente
async function sendMessage(phone, messageText) {
  if (!sock || connectionStatus !== 'connected') {
    throw new Error('WhatsApp não está conectado no momento.');
  }

  let cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length === 10 || cleanPhone.length === 11) {
    cleanPhone = '55' + cleanPhone;
  }
  const jid = `${cleanPhone}@s.whatsapp.net`;

  try {
    const sent = await sock.sendMessage(jid, { text: messageText });
    if (sent && sent.key && sent.key.id) sentByBotIds.add(sent.key.id);
    return { success: true, phone: cleanPhone };
  } catch (err) {
    console.error(`Erro ao enviar mensagem no WhatsApp para ${cleanPhone}:`, err.message);
    return { success: false, error: err.message };
  }
}

// Enviar Notificação Automática de Renovação para o Cliente
async function sendRenewalNotification(client, receipt) {
  if (!sock || connectionStatus !== 'connected') {
    console.log('WhatsApp desconectado. Notificação de renovação não enviada via WhatsApp.');
    return false;
  }

  const nextDueFormatted = receipt.next_due_date.split('-').reverse().join('/');
  const message = `🎉 *RENOVAÇÃO CONFIRMADA COM SUCESSO!* 🎉\n\nOlá, *${client.name}*!\nConfirmamos o pagamento e a renovação do seu plano *${client.plan_name}*!\n\n🧾 *Código do Recibo*: ${receipt.receipt_code}\n💰 *Valor*: R$ ${parseFloat(client.price).toFixed(2)}\n🗓 *Próximo Vencimento*: *${nextDueFormatted}*\n\nAgradecemos a preferência e desejamos um ótimo entretenimento! 📺🍿`;

  try {
    await sendMessage(client.phone, message);
    return true;
  } catch (e) {
    console.error('Erro ao enviar notificação de renovação:', e.message);
    return false;
  }
}

// Verificar Vencimentos e Enviar Lembretes Automáticos aos Clientes e Administrador
async function checkExpirationsAndNotify() {
  try {
    const clients = await dbHelper.getAllClients();
    const settings = await dbHelper.getSettings();
    const today = new Date().toISOString().split('T')[0];

    for (const client of clients) {
      if (!client.due_date) continue;

      const due = new Date(client.due_date + 'T00:00:00');
      const now = new Date(today + 'T00:00:00');
      const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));

      const dueFormatted = client.due_date.split('-').reverse().join('/');

      // Se vence em 3 dias, 1 dia ou hoje
      if (diffDays === 3 || diffDays === 1 || diffDays === 0) {
        let text = '';
        if (diffDays === 0) {
          text = `⚠️ *AVISO DE VENCIMENTO HOJE!* ⚠️\n\nOlá, *${client.name}*!\nSeu plano *${client.plan_name}* vence *HOJE (${dueFormatted})*.\n\nPara evitar o bloqueio dos seus canais, renove agora via PIX:\n🔑 \`${settings.pix_key || ''}\`\n\nEnvie o comprovante para darmos baixa imediata! 👍`;
        } else {
          text = `⏰ *LEMBRETE DE VENCIMENTO IPTV* ⏰\n\nOlá, *${client.name}*!\nSeu plano *${client.plan_name}* vence em *${diffDays} dia(s)* (${dueFormatted}).\n\nRenove antecipadamente para não ficar sem sinal:\n🔑 Chave PIX: \`${settings.pix_key || ''}\``;
        }

        if (sock && connectionStatus === 'connected') {
          try {
            await sendMessage(client.phone, text);
            console.log(`🔔 Lembrete de vencimento enviado para ${client.name} (${client.phone})`);
          } catch (e) {
            console.error(`Erro ao enviar lembrete para ${client.name}:`, e.message);
          }
        }
      }

      // Atualizar status do cliente para 'expiring' ou 'expired' no banco
      let newStatus = client.status;
      if (diffDays < 0) {
        newStatus = 'expired';
      } else if (diffDays <= 3) {
        newStatus = 'expiring';
      } else {
        newStatus = 'active';
      }

      if (newStatus !== client.status) {
        await dbHelper.updateClient(client.id, {
          ...client,
          status: newStatus
        });
      }
    }
  } catch (err) {
    console.error('Erro na checagem de vencimentos:', err.message);
  }
}

function getStatus() {
  return {
    status: qrCodeDataUrl ? 'qr_ready' : connectionStatus,
    qr: qrCodeDataUrl
  };
}

module.exports = {
  initWhatsApp,
  onStatusChange,
  getStatus,
  sendMessage,
  sendRenewalNotification,
  checkExpirationsAndNotify
};
