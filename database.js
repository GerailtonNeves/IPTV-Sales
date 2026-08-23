const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'data', 'iptv_system.db');

// Garantir que a pasta data existe
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco SQLite:', err.message);
  } else {
    console.log('Conectado ao banco de dados SQLite com sucesso.');
  }
});

// Inicialização de tabelas
db.serialize(() => {
  // Tabela de Clientes
  db.run(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      plan_name TEXT DEFAULT 'Plano IPTV Mensal',
      price REAL DEFAULT 30.00,
      due_date TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_renewed_at TEXT
    )
  `);

  // Tabela de Configurações
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Tabela de Recibos
  db.run(`
    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      client_name TEXT NOT NULL,
      plan_name TEXT NOT NULL,
      price REAL NOT NULL,
      renewed_at TEXT NOT NULL,
      next_due_date TEXT NOT NULL,
      receipt_code TEXT UNIQUE NOT NULL
    )
  `);

  // Tabela de Planos de Canais
  db.run(`
    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      description TEXT,
      color TEXT DEFAULT '#0284c7'
    )
  `);

  // Adicionar colunas de migração se não existirem
  db.run("ALTER TABLE clients ADD COLUMN app_name TEXT DEFAULT ''", () => {});
  db.run("ALTER TABLE clients ADD COLUMN server_name TEXT DEFAULT ''", () => {});
  db.run("ALTER TABLE plans ADD COLUMN color TEXT DEFAULT '#0284c7'", () => {});

  // Limpar prefixo 55 dos telefones já cadastrados para manter formato DDD + número (ex: 11985897774)
  db.run("UPDATE clients SET phone = SUBSTR(phone, 3) WHERE (LENGTH(phone) = 12 OR LENGTH(phone) = 13) AND phone LIKE '55%'", () => {});

  // Inserir planos padrão se tabela estiver vazia
  db.get('SELECT COUNT(*) as count FROM plans', [], (err, row) => {
    if (!err && row && row.count === 0) {
      db.run(`INSERT INTO plans (name, price, description, color) VALUES 
        ('IPTV Premium 1 Tela', 35.00, 'Todos os canais HD/4K + Filmes e Séries', '#0284c7'),
        ('IPTV Premium 2 Telas', 70.00, 'Todos os canais HD/4K para 2 aparelhos simultâneos', '#f97316'),
        ('Plano Trimestral 1 Tela', 80.00, 'Acesso por 90 dias com desconto especial', '#10b981'),
        ('Plano Anual 1 Tela', 280.00, 'Acesso por 365 dias com o melhor custo-benefício', '#8b5cf6')`);
    }
  });

  // Tabela de Aplicativos IPTV
  db.run(`
    CREATE TABLE IF NOT EXISTS apps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT
    )
  `);

  // Inserir apps padrão se vazia
  db.get('SELECT COUNT(*) as count FROM apps', [], (err, row) => {
    if (!err && row && row.count === 0) {
      db.run(`INSERT INTO apps (name, description) VALUES 
        ('XCIPTV Player', 'Aplicativo leve e rápido para Smart TV e Android'),
        ('IBO Player', 'Aplicativo moderno para TVs Samsung, LG e Android'),
        ('Smarters Player Lite', 'Interface clássica e completa de IPTV'),
        ('Smart One IPTV', 'Excelente player para TVs mais novas'),
        ('SSP-TV', 'Player leve com suporte a guia de programação'),
        ('Bob Player', 'Player ágil para TV Box e Firestick'),
        ('TiviMate', 'Melhor player avançado para Android TV'),
        ('Unitv', 'Player para celular e TV Box')`);
    }
  });

  // Tabela de Servidores IPTV
  db.run(`
    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT
    )
  `);

  // Inserir servidores padrão se vazia
  db.get('SELECT COUNT(*) as count FROM servers', [], (err, row) => {
    if (!err && row && row.count === 0) {
      db.run(`INSERT INTO servers (name, description) VALUES 
        ('Servidor Premium Gold', 'Servidor principal com alta estabilidade 4K'),
        ('Servidor Star Ultra', 'Servidor backup e jogos em 60fps'),
        ('Servidor Turbo Play', 'Servidor otimizado para transmissões ao vivo'),
        ('Servidor Matrix 4K', 'Servidor exclusivo para séries e filmes VOD')`);
    }
  });

  // Tabela de Logs de Atendimento
  db.run(`
    CREATE TABLE IF NOT EXISTS bot_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      sender_name TEXT,
      message TEXT NOT NULL,
      response TEXT NOT NULL,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Inserir configurações padrão caso não existam
  const defaultSettings = [
    ['company_name', 'IPTV Premium Digital'],
    ['company_phone', '5511999999999'],
    ['pix_key', 'sua-chave-pix-aqui'],
    ['test_duration', '2 horas'],
    ['auto_reminder_days', '3'],
    ['bot_enabled', 'true'],
    ['gemini_api_key', ''],
    ['system_prompt', `Você é o assistente virtual inteligente de vendas e suporte da nossa empresa de IPTV.
Seu objetivo é ser educado, profissional, atencioso e tirar todas as dúvidas dos clientes sobre nossos planos de canais, filmes e séries.

REGRAS IMPORTANTES:
1. Sempre responda com cordialidade e entusiasmo.
2. Informe que nossos planos possuem mais de 100.000 conteúdos (canais HD/4K, filmes, séries e esportes).
3. Informe que o teste grátis tem duração de 2 horas e pode ser instalado na Smart TV, TV Box, Celular ou Computador.
4. Para renovações, informe nossa Chave PIX e o valor do plano.
5. Quando o cliente solicitar teste grátis, diga que um atendente irá gerar seus dados de acesso em poucos instantes ou envie a lista de testes.
6. Nunca seja rude. Mantenha o foco em fechar vendas e renovar planos.`],
    ['interactive_menu', JSON.stringify({
      title: '🤖 *Atendimento Automático IPTV*',
      options: [
        { key: '1', title: '🗓 Consultar Vencimento & Chave Pix', action: 'check_due' },
        { key: '2', title: '🎁 Solicitar Teste Grátis', action: 'request_test' },
        { key: '3', title: '📺 Ver Planos e Preços', action: 'show_plans' },
        { key: '4', title: '💬 Tirar Dúvidas com Atendente (IA)', action: 'ai_support' }
      ]
    })]
  ];

  const stmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  defaultSettings.forEach(([key, val]) => {
    stmt.run(key, val);
  });
  stmt.finalize();
});

// Funções Helper envelopadas em Promises para facilidade de uso
const dbHelper = {
  // Configurações
  getSettings: () => {
    return new Promise((resolve, reject) => {
      db.all('SELECT key, value FROM settings', [], (err, rows) => {
        if (err) return reject(err);
        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);
        resolve(settings);
      });
    });
  },

  updateSetting: (key, value) => {
    return new Promise((resolve, reject) => {
      db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value], function (err) {
        if (err) return reject(err);
        resolve({ success: true, key, value });
      });
    });
  },

  // Clientes
  getAllClients: () => {
    return new Promise((resolve, reject) => {
      db.all("SELECT *, ('#' || (1000 + id)) as client_code FROM clients ORDER BY due_date ASC", [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  },

  getClientById: (id) => {
    return new Promise((resolve, reject) => {
      db.get("SELECT *, ('#' || (1000 + id)) as client_code FROM clients WHERE id = ?", [id], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  },

  getClientByPhone: (phone) => {
    const cleanPhone = phone.replace(/\D/g, '');
    return new Promise((resolve, reject) => {
      db.get("SELECT *, ('#' || (1000 + id)) as client_code FROM clients WHERE phone LIKE ?", [`%${cleanPhone}%`], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  },

  searchClientSmart: (query) => {
    if (!query) return Promise.resolve({ client: null, ambiguous: false });

    const stopWords = ['meu', 'nome', 'codigo', 'código', 'plano', 'sou', 'qual', 'vencimento', 'consultar', 'para', 'saber', 'ola', 'olá', 'por', 'favor', 'verific', 'verificar', 'dados', 'dados do'];
    const cleanStr = query.toLowerCase().trim();
    const cleanDigits = query.replace(/\D/g, '');

    return new Promise((resolve, reject) => {
      db.all("SELECT *, ('#' || (1000 + id)) as client_code FROM clients", [], (err, rows) => {
        if (err) return reject(err);
        if (!rows || rows.length === 0) return resolve({ client: null, ambiguous: false });

        // 1. Tentar Match Exato de Código de Cliente (ex: 812600, #812600, #1011, 1011, 11)
        if (cleanDigits && cleanDigits.length >= 2) {
          const codeMatch = rows.find(r => {
            const promptCodeMatch = r.notes ? r.notes.match(/#(\d+)/) : null;
            const promptCode = promptCodeMatch ? promptCodeMatch[1] : '';
            const sysCode = (1000 + r.id).toString();
            const rawId = r.id.toString();
            return (promptCode && promptCode === cleanDigits) || 
                   (sysCode === cleanDigits) ||
                   (rawId === cleanDigits) ||
                   (r.notes && r.notes.includes(`#${cleanDigits}`));
          });
          if (codeMatch) {
            return resolve({ client: codeMatch, ambiguous: false });
          }
        }

        // Extrair palavras significativas da busca
        const queryWords = cleanStr.split(/\s+/).filter(w => w.length >= 2 && !stopWords.includes(w));

        if (queryWords.length === 0 && !cleanDigits) {
          return resolve({ client: null, ambiguous: false });
        }

        // 2. Tentar Match Exato de Nome Completo
        const fullQueryStr = queryWords.join(' ');
        const exactNameMatch = rows.find(r => r.name.toLowerCase().trim() === fullQueryStr);
        if (exactNameMatch) {
          return resolve({ client: exactNameMatch, ambiguous: false });
        }

        // 3. Pontuar cada cliente para encontrar a correspondência exata de Nome + Sobrenome
        let scoredClients = rows.map(r => {
          const clientNameLower = r.name.toLowerCase().trim();
          const clientWords = clientNameLower.split(/\s+/);
          let score = 0;

          // Se a frase inteira da busca está contida no nome do cliente (ex: "lucas neves" em "lucas neves")
          if (fullQueryStr && clientNameLower.includes(fullQueryStr)) {
            score += 10;
          }

          // Se o primeiro nome bate exatamente
          if (queryWords.length > 0 && clientWords[0] === queryWords[0]) {
            score += 3;
          }

          // Quantas palavras da busca batem com o nome do cliente
          for (const qWord of queryWords) {
            if (clientWords.includes(qWord)) {
              score += 3;
            } else if (clientWords.some(cw => cw.includes(qWord))) {
              score += 1;
            }
          }

          return { client: r, score };
        }).filter(item => item.score > 0);

        scoredClients.sort((a, b) => b.score - a.score);

        if (scoredClients.length === 0) {
          return resolve({ client: null, ambiguous: false });
        }

        const topScore = scoredClients[0].score;
        const topMatches = scoredClients.filter(item => item.score === topScore);

        if (topMatches.length === 1) {
          return resolve({ client: topMatches[0].client, ambiguous: false });
        } else {
          // Mais de 1 cliente empatado com a mesma pontuação
          return resolve({ client: null, ambiguous: true, matches: topMatches.map(m => m.client) });
        }
      });
    });
  },

  searchClient: async (query) => {
    const res = await dbHelper.searchClientSmart(query);
    return res ? res.client : null;
  },

  addClient: (clientData) => {
    const { name, phone, plan_name, price, due_date, notes, app_name, server_name } = clientData;
    let cleanPhone = phone.replace(/\D/g, '');
    if ((cleanPhone.length === 12 || cleanPhone.length === 13) && cleanPhone.startsWith('55')) {
      cleanPhone = cleanPhone.substring(2);
    }
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO clients (name, phone, plan_name, price, due_date, notes, app_name, server_name, status, last_renewed_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)`,
        [name, cleanPhone, plan_name || 'Plano IPTV Mensal', price || 30.00, due_date, notes || '', app_name || '', server_name || ''],
        function (err) {
          if (err) return reject(err);
          resolve({ id: this.lastID, ...clientData, phone: cleanPhone });
        }
      );
    });
  },

  updateClient: (id, clientData) => {
    const { name, phone, plan_name, price, due_date, status, notes, app_name, server_name } = clientData;
    let cleanPhone = phone.replace(/\D/g, '');
    if ((cleanPhone.length === 12 || cleanPhone.length === 13) && cleanPhone.startsWith('55')) {
      cleanPhone = cleanPhone.substring(2);
    }
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE clients SET name = ?, phone = ?, plan_name = ?, price = ?, due_date = ?, status = ?, notes = ?, app_name = ?, server_name = ? WHERE id = ?`,
        [name, cleanPhone, plan_name, price, due_date, status || 'active', notes || '', app_name || '', server_name || '', id],
        function (err) {
          if (err) return reject(err);
          resolve({ id, ...clientData, phone: cleanPhone });
        }
      );
    });
  },

  deleteClient: (id) => {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM clients WHERE id = ?', [id], function (err) {
        if (err) return reject(err);
        resolve({ success: true, id });
      });
    });
  },

  // Planos de Canais
  getAllPlans: () => {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM plans ORDER BY id ASC', [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  },

  addPlan: (planData) => {
    const { name, price, description, color } = planData;
    return new Promise((resolve, reject) => {
      db.run('INSERT INTO plans (name, price, description, color) VALUES (?, ?, ?, ?)', [name, price || 35.00, description || '', color || '#0284c7'], function(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, ...planData });
      });
    });
  },

  deletePlan: (id) => {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM plans WHERE id = ?', [id], function(err) {
        if (err) return reject(err);
        resolve({ success: true, id });
      });
    });
  },

  // Aplicativos IPTV
  getAllApps: () => {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM apps ORDER BY name ASC', [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  },

  addApp: (appData) => {
    const { name, description } = appData;
    return new Promise((resolve, reject) => {
      db.run('INSERT OR IGNORE INTO apps (name, description) VALUES (?, ?)', [name, description || ''], function(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, ...appData });
      });
    });
  },

  deleteApp: (id) => {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM apps WHERE id = ?', [id], function(err) {
        if (err) return reject(err);
        resolve({ success: true, id });
      });
    });
  },

  // Servidores IPTV
  getAllServers: () => {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM servers ORDER BY name ASC', [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  },

  addServer: (serverData) => {
    const { name, description } = serverData;
    return new Promise((resolve, reject) => {
      db.run('INSERT OR IGNORE INTO servers (name, description) VALUES (?, ?)', [name, description || ''], function(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, ...serverData });
      });
    });
  },

  deleteServer: (id) => {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM servers WHERE id = ?', [id], function(err) {
        if (err) return reject(err);
        resolve({ success: true, id });
      });
    });
  },

  syncPromptToDatabase: async () => {
    try {
      const settings = await dbHelper.getSettings();
      const promptText = settings.system_prompt || '';
      if (!promptText) return;

      // 1. Extrair Chave PIX apenas se não houver nenhuma configurada no banco
      if (!settings.pix_key || settings.pix_key === 'sua-chave-pix-aqui' || settings.pix_key.toLowerCase() === 'banco') {
        const pixMatch = promptText.match(/Chave PIX:\s*\*?([^\n\r]+)\*?/i);
        if (pixMatch && pixMatch[1]) {
          const cleanPix = pixMatch[1].replace(/[*_]/g, '').trim();
          await dbHelper.updateSetting('pix_key', cleanPix);
        }
      }

      // 2. Extrair Clientes do Prompt
      const lines = promptText.split('\n');
      const clientRegex = /Código\s+(\d+)\s*–\s*([^–]+)\s*–\s*([^–]+)\s*–\s*R\$\s*([\d,\.]+)\s*–\s*Vencimento:\s*(\d{2}\/\d{2}\/\d{4})/i;

      for (const line of lines) {
        const match = line.match(clientRegex);
        if (match) {
          const [_, code, name, planName, priceStr, dateStr] = match;
          const cleanCode = code.trim();
          const cleanName = name.trim();
          const cleanPlan = planName.trim();
          const price = parseFloat(priceStr.replace(',', '.'));
          const [d, m, y] = dateStr.split('/');
          const isoDate = `${y}-${m}-${d}`;
          const phone = `119${cleanCode}`;

          // Verificar se o cliente já existe por Código do Prompt ou por Nome
          await new Promise((resolve) => {
            db.get(
              `SELECT id FROM clients WHERE notes LIKE ? OR lower(name) = lower(?)`,
              [`%#${cleanCode}%`, cleanName],
              (err, row) => {
                if (row) {
                  // Atualiza cliente existente preservando o telefone original
                  db.run(
                    `UPDATE clients SET name = ?, plan_name = ?, price = ?, due_date = ?, notes = ? WHERE id = ?`,
                    [cleanName, cleanPlan, price, isoDate, `CÓDIGO PROMPT: #${cleanCode}`, row.id],
                    () => resolve()
                  );
                } else {
                  // Insere novo cliente se não existir
                  db.run(
                    `INSERT INTO clients (name, phone, plan_name, price, due_date, notes, status)
                     VALUES (?, ?, ?, ?, ?, ?, 'active')`,
                    [cleanName, phone, cleanPlan, price, isoDate, `CÓDIGO PROMPT: #${cleanCode}`],
                    () => resolve()
                  );
                }
              }
            );
          });
        }
      }
      console.log('✅ Base de clientes e configurações sincronizadas com o Prompt!');
    } catch (err) {
      console.error('Erro ao sincronizar dados do prompt:', err.message);
    }
  },

  // Dar baixa / Renovar Plano por +30 Dias
  renewClientPlan: (id) => {
    return new Promise(async (resolve, reject) => {
      try {
        db.get('SELECT * FROM clients WHERE id = ?', [id], (err, client) => {
          if (err || !client) return reject(err || new Error('Cliente não encontrado'));

          // Calcular data atual vs data de vencimento anterior
          let baseDate = new Date();
          if (client.due_date) {
            const currentDue = new Date(client.due_date + 'T00:00:00');
            // Se a data de vencimento atual ainda não passou, adiciona +30 dias a partir da data de vencimento original!
            if (currentDue > baseDate) {
              baseDate = currentDue;
            }
          }

          // Adiciona exatamente 30 dias
          baseDate.setDate(baseDate.getDate() + 30);
          const nextDueDateStr = baseDate.toISOString().split('T')[0];
          const nowIsoStr = new Date().toISOString();

          // Atualiza o cliente
          db.run(
            `UPDATE clients SET due_date = ?, status = 'active', last_renewed_at = ? WHERE id = ?`,
            [nextDueDateStr, nowIsoStr, id],
            function (updateErr) {
              if (updateErr) return reject(updateErr);

              // Gerar Recibo no banco
              const receiptCode = 'REC-' + Math.floor(100000 + Math.random() * 900000);
              const todayStr = new Date().toLocaleDateString('pt-BR');

              db.run(
                `INSERT INTO receipts (client_id, client_name, plan_name, price, renewed_at, next_due_date, receipt_code)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [id, client.name, client.plan_name, client.price, todayStr, nextDueDateStr, receiptCode],
                function (recErr) {
                  if (recErr) console.error('Erro ao salvar recibo:', recErr.message);

                  resolve({
                    success: true,
                    client: {
                      ...client,
                      due_date: nextDueDateStr,
                      status: 'active'
                    },
                    receipt: {
                      receipt_code: receiptCode,
                      renewed_at: todayStr,
                      next_due_date: nextDueDateStr,
                      price: client.price,
                      plan_name: client.plan_name
                    }
                  });
                }
              );
            }
          );
        });
      } catch (e) {
        reject(e);
      }
    });
  },

  // Recibos
  getAllReceipts: () => {
    return new Promise((resolve, reject) => {
      db.all('SELECT r.*, c.phone FROM receipts r LEFT JOIN clients c ON r.client_id = c.id ORDER BY r.id DESC LIMIT 100', [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  },

  getReceiptById: (id) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT r.*, c.phone FROM receipts r LEFT JOIN clients c ON r.client_id = c.id WHERE r.id = ?', [id], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  },

  updateReceipt: (id, data) => {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE receipts SET client_name = ?, plan_name = ?, price = ?, renewed_at = ?, next_due_date = ?, receipt_code = ? WHERE id = ?`,
        [data.client_name, data.plan_name, parseFloat(data.price), data.renewed_at, data.next_due_date, data.receipt_code, id],
        function (err) {
          if (err) return reject(err);
          resolve({ success: true });
        }
      );
    });
  },

  deleteReceipt: (id) => {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM receipts WHERE id = ?', [id], function (err) {
        if (err) return reject(err);
        resolve({ success: true });
      });
    });
  },

  // Logs
  addBotLog: (phone, senderName, message, response) => {
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO bot_logs (phone, sender_name, message, response) VALUES (?, ?, ?, ?)',
        [phone, senderName || 'Cliente', message, response],
        function (err) {
          if (err) return reject(err);
          resolve({ id: this.lastID });
        }
      );
    });
  },

  getBotLogs: () => {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM bot_logs ORDER BY id DESC LIMIT 50', [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }
};

module.exports = { db, dbHelper };
