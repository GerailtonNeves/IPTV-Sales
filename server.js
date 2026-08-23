const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cron = require('node-cron');
const { dbHelper } = require('./database');
let whatsappService;
try {
  whatsappService = require('./whatsapp');
} catch (e1) {
  try {
    whatsappService = require('./services/whatsapp');
  } catch (e2) {
    console.error('Erro ao carregar whatsappService:', e2);
  }
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 8090;
const fs = require('fs');

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Servir o painel web index.html na rota principal (Garante carregamento completo do HTML no Render)
app.get('/', (req, res) => {
  const indexPath = path.resolve(__dirname, 'public', 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('Erro ao servir index.html:', err);
      res.sendFile(path.resolve('public/index.html'));
    }
  });
});

// Rota de Keep-Alive para hospedagem 24h na nuvem (UptimeRobot / Render)
app.get('/ping', (req, res) => {
  res.status(200).send({ status: 'ok', timestamp: new Date().toISOString() });
});

// WebSocket para atualizar QR Code e Status em tempo real no Dashboard
wss.on('connection', (ws) => {
  // Enviar estado inicial
  ws.send(JSON.stringify({ type: 'STATUS_UPDATE', payload: whatsappService.getStatus() }));
});

// Transmitir atualizações para todos os clientes conectados ao WebSocket
whatsappService.onStatusChange((statusData) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'STATUS_UPDATE', payload: statusData }));
    }
  });
});

// === ROTAS DA API ===

// 1. Status do WhatsApp
app.get('/api/whatsapp/status', (req, res) => {
  res.json(whatsappService.getStatus());
});

// Re-inicializar ou forçar reconexão do WhatsApp
app.post('/api/whatsapp/connect', async (req, res) => {
  try {
    whatsappService.initWhatsApp();
    res.json({ success: true, message: 'Iniciando conexão com WhatsApp...' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Clientes (CRM)
app.get('/api/clients', async (req, res) => {
  try {
    const clients = await dbHelper.getAllClients();
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/clients', async (req, res) => {
  try {
    const client = await dbHelper.addClient(req.body);
    res.status(201).json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/clients/:id', async (req, res) => {
  try {
    const client = await dbHelper.updateClient(req.params.id, req.body);
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/clients/:id', async (req, res) => {
  try {
    const result = await dbHelper.deleteClient(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2.1 Planos de Canais
app.get('/api/plans', async (req, res) => {
  try {
    const plans = await dbHelper.getAllPlans();
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/plans', async (req, res) => {
  try {
    const plan = await dbHelper.addPlan(req.body);
    res.status(201).json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/plans/:id', async (req, res) => {
  try {
    const result = await dbHelper.deletePlan(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2.2 Aplicativos IPTV
app.get('/api/apps', async (req, res) => {
  try {
    const apps = await dbHelper.getAllApps();
    res.json(apps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/apps', async (req, res) => {
  try {
    const app = await dbHelper.addApp(req.body);
    res.status(201).json(app);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/apps/:id', async (req, res) => {
  try {
    const result = await dbHelper.deleteApp(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2.3 Servidores IPTV
app.get('/api/servers', async (req, res) => {
  try {
    const servers = await dbHelper.getAllServers();
    res.json(servers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/servers', async (req, res) => {
  try {
    const server = await dbHelper.addServer(req.body);
    res.status(201).json(server);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/servers/:id', async (req, res) => {
  try {
    const result = await dbHelper.deleteServer(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Envio Direto de Mensagem Personalizada via WhatsApp Socket
app.post('/api/whatsapp/send-message', async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: 'Telefone e mensagem são obrigatórios' });
    }
    const result = await whatsappService.sendMessage(phone, message);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Renovar Plano (+30 Dias) e Dar Baixa
app.post('/api/clients/:id/renew', async (req, res) => {
  try {
    const result = await dbHelper.renewClientPlan(req.params.id);
    
    // Tentar enviar notificação automática via WhatsApp
    let notified = false;
    if (result.client && result.receipt) {
      notified = await whatsappService.sendRenewalNotification(result.client, result.receipt);
    }

    res.json({
      ...result,
      whatsapp_notified: notified
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Configurações
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await dbHelper.getSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const { settings } = req.body;
    for (const [key, value] of Object.entries(settings)) {
      await dbHelper.updateSetting(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
    // Sincronizar clientes e PIX do prompt com a base de dados
    await dbHelper.syncPromptToDatabase();
    res.json({ success: true, message: 'Configurações salvas e dados do Prompt sincronizados com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload de Logo da Empresa
app.post('/api/upload-logo', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
    }

    const matches = imageBase64.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Formato de imagem inválido.' });
    }

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const dataBuffer = Buffer.from(matches[2], 'base64');
    const logoFileName = `logo_${Date.now()}.${ext}`;
    const logoPath = path.join(uploadsDir, logoFileName);

    fs.writeFileSync(logoPath, dataBuffer);

    const logoUrl = `/uploads/${logoFileName}`;
    await dbHelper.updateSetting('company_logo', logoUrl);

    res.json({ success: true, logo_url: logoUrl });
  } catch (err) {
    console.error('Erro ao fazer upload da logo:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 5. Recibos
app.get('/api/receipts', async (req, res) => {
  try {
    const receipts = await dbHelper.getAllReceipts();
    res.json(receipts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/receipts/:id', async (req, res) => {
  try {
    const result = await dbHelper.updateReceipt(req.params.id, req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/receipts/:id', async (req, res) => {
  try {
    const result = await dbHelper.deleteReceipt(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Logs de Atendimento
app.get('/api/logs', async (req, res) => {
  try {
    const logs = await dbHelper.getBotLogs();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Disparador de Mensagens Promocionais ou Lembretes
app.post('/api/broadcast', async (req, res) => {
  try {
    const { phone, message, target } = req.body;
    
    if (target === 'single' && phone) {
      await whatsappService.sendMessage(phone, message);
      return res.json({ success: true, count: 1, message: 'Mensagem enviada com sucesso!' });
    }

    if (target === 'all') {
      const clients = await dbHelper.getAllClients();
      let sentCount = 0;
      for (const c of clients) {
        try {
          await whatsappService.sendMessage(c.phone, message);
          sentCount++;
          // Delay de segurança de 2 segundos entre disparos
          await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
          console.error(`Erro ao disparar para ${c.phone}:`, e.message);
        }
      }
      return res.json({ success: true, count: sentCount, message: `Disparo efetuado para ${sentCount} clientes.` });
    }

    res.status(400).json({ error: 'Target inválido ou telefone ausente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cron Job: Executa a checagem de vencimentos diariamente às 09:00 e a cada 6 horas
cron.schedule('0 9 * * *', () => {
  console.log('⏰ Executando checagem automática de vencimentos (Cron Job)...');
  whatsappService.checkExpirationsAndNotify();
});

// Executa também na inicialização
setTimeout(() => {
  whatsappService.checkExpirationsAndNotify();
}, 10000);

// Inicializar WhatsApp e Sincronizar dados do Prompt ao rodar o servidor
(async () => {
  await dbHelper.syncPromptToDatabase();
  whatsappService.initWhatsApp();
})();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🚀 Sistema IPTV Sales Bot rodando com sucesso!`);
  console.log(`🌐 Painel Web: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
