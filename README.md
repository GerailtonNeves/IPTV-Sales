# 🚀 Sistema de Vendas & Atendimento IPTV com WhatsApp e IA (100% Gratuito)

Um sistema completo de Gestão de Clientes (CRM), Atendimento Automático com Inteligência Artificial (Google Gemini ou Motor Grátis de Regras), Menu Interativo no WhatsApp, Gerador de Recibos de Renovação (ciclos de 30 dias) e Alertas de Vencimento.

---

## 🎨 Características e Recursos

- 🟢 **Conectividade WhatsApp (100% Grátis)**: Funciona com WhatsApp Normal ou WhatsApp Business via QR Code no próprio painel.
- 🤖 **Atendimento por IA com Prompt Customizável**: Área exclusiva no painel para cadastrar as regras, tabela de preços, testes e respostas do seu robô.
- 📋 **Menu Interativo no WhatsApp**:
  - `1` - Consultar Vencimento & Chave Pix
  - `2` - Solicitar Teste Grátis
  - `3` - Ver Planos e Preços
  - `4` - Tirar Dúvidas com Atendente (IA)
- 👥 **CRM Completo de Clientes**:
  - Cadastro, Edição, Busca por Nome/Telefone, Filtros de Status (Ativos, Próximos do Vencimento, Vencidos).
  - **Botão "Dar Baixa"**: Atualiza a data de vencimento automaticamente para **+30 dias**, gera o recibo e envia uma notificação no WhatsApp do cliente.
- 🧾 **Gerador de Recibos Profissionais**:
  - Geração automática de código de recibo com botão de copiar texto ou enviar direto no WhatsApp.
- 🔔 **Disparador de Promoções & Notificações Automáticas**:
  - Envio de lembretes automáticos de vencimento (3 dias antes, 1 dia antes e no dia).
  - Disparador de mensagens promocionais em massa ou individuais.
- 🎨 **Design Moderno nas Cores Azul Claro e Laranja Brilhante**:
  - Interface moderna, responsiva (celular e PC) e personalizável com o nome da sua empresa.

---

## 🛠️ Como Executar Localmente no seu Computador

### Pré-requisitos
- **Node.js** instalado (versão 18 ou superior).

### Passo a Passo

1. **Instalar as dependências**:
   No terminal ou prompt de comando na pasta do projeto, execute:
   ```bash
   npm install
   ```

2. **Iniciar o Servidor**:
   ```bash
   npm start
   ```

3. **Acessar o Painel no Navegador**:
   Abra seu navegador e acesse:
   `http://localhost:8090`

4. **Conectar o WhatsApp**:
   - Acesse a aba **Conectar WhatsApp** no painel.
   - Abra o WhatsApp no celular &rarr; **Aparelhos Conectados** &rarr; **Conectar um Aparelho** e escaneie o QR Code exibido na tela.

---

## 🌐 Como Hospedar 100% Grátis 24h por Dia (Mesmo com o PC Desligado)

Para que o robô funcione 24h por dia sem depender do seu computador:

### Opção Recomendada: Render.com + UptimeRobot

1. **Subir o projeto para o GitHub**:
   Crie um repositório gratuito no GitHub e envie os arquivos do projeto.

2. **Criar Serviço no Render.com**:
   - Crie uma conta gratuita em [Render.com](https://render.com).
   - Clique em **New +** &rarr; **Web Service**.
   - Conecte seu repositório do GitHub.
   - Selecione o ambiente **Node**.
   - Comando de Build: `npm install`
   - Comando de Start: `node server.js`
   - Clique em **Create Web Service**.

3. **Ativar o UptimeRobot (para manter 24h sem desligar)**:
   - O Render coloca o site para "dormir" se ficar sem acessos.
   - Para evitar isso, acesse [UptimeRobot.com](https://uptimerobot.com) (100% grátis).
   - Cadastre um novo monitor HTTP(s) com a URL do seu sistema: `https://seu-app.onrender.com/ping`.
   - Defina o intervalo de verificação para **5 minutos**.
   - Pronto! O UptimeRobot dará um sinal a cada 5 minutos mantendo o seu robô e WhatsApp ativos 24 horas por dia!

---

## 💡 Estrutura de Arquivos do Projeto

```
iptv-sales-bot/
├── package.json               # Dependências do Node.js
├── server.js                  # Servidor Express, WebSocket e APIs
├── database.js                # Banco SQLite local e queries
├── services/
│   ├── ai.js                  # IA Gemini + Motor Inteligente de Regras
│   └── whatsapp.js            # Módulo Baileys do WhatsApp e Cron Job
└── public/
    ├── index.html             # Painel Web em Tailwind (Azul Claro + Laranja)
    ├── css/
    │   └── style.css          # Estilos customizados
    └── js/
        └── app.js             # Lógica interativa do Dashboard e Recibos
```
