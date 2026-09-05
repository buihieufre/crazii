const fs = require('fs');
const path = require('path');

/**
 * Status Codes:
 *  0: ⏳ Đang chạy...
 *  1: ⚡ Đã cán TP1 (Đang gồng TP2)
 *  2: 🎯 FULL TP2 (WIN ĐẬM)
 * -1: 🛑 HIT SL (LOSS)
 * -2: ⚠️ CẮT LỆNH SỚM (Chưa có TP)
 *  3: ⚠️ CẮT SỚM (Đã chốt túi TP1 💸)
 */
const TRADE_STATUS = {
  RUNNING: 0,
  HIT_TP1: 1,
  HIT_TP2: 2,
  HIT_SL: -1,
  CUT_EARLY_LOSS: -2,
  CUT_EARLY_PROFIT: 3
};

const DEFAULT_CONFIG = {
  enabled: false,
  botToken: '',
  chatId: '',
  maxConcurrentTrades: 10,
  defaultSlOffset: 20,
  monitoredSymbols: ['XAUUSD.ca_5', 'BTCUSD_5', 'ETHUSD_15', 'EURUSD_5'],
  enableNotifications: true,
  allowEarlyCut: true,
  autoMoveSlToBreakEven: true
};

class TelegramSignalBot {
  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.activeTrades = new Map(); // id -> Trade object
    this.tradeHistory = []; // list of closed trades (max 100)
    this.processedCandles = new Set(); // prevents duplicate triggers on same candle
    this.dataDir = path.join(process.cwd(), 'data');
    this.configFile = path.join(this.dataDir, 'bot-config.json');
    this.tradesFile = path.join(this.dataDir, 'bot-trades.json');

    this.init();
  }

  init() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      this.loadConfig();
      this.loadTrades();
      console.log(`[Telegram Bot] 🤖 Signal Bot Engine initialized. (Enabled: ${this.config.enabled}, Monitored: [${this.config.monitoredSymbols.join(', ')}])`);
    } catch (e) {
      console.error(`[Telegram Bot] Initialization error:`, e.message);
    }
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configFile)) {
        const raw = fs.readFileSync(this.configFile, 'utf8');
        const parsed = JSON.parse(raw);
        this.config = { ...this.config, ...parsed };
      }
    } catch (e) {
      console.warn(`[Telegram Bot] Failed to load config from file:`, e.message);
    }

    // Load from environment variables (.env) if present
    if (process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN) {
      this.config.botToken = (process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN).trim();
    }
    if (process.env.TELEGRAM_CHAT_ID || process.env.CHAT_ID) {
      this.config.chatId = (process.env.TELEGRAM_CHAT_ID || process.env.CHAT_ID).trim();
    }
  }

  saveConfig(newConfig = {}) {
    this.config = { ...this.config, ...newConfig };
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2), 'utf8');
      console.log(`[Telegram Bot] 💾 Configuration saved successfully.`);
      return true;
    } catch (e) {
      console.error(`[Telegram Bot] Failed to save config:`, e.message);
      return false;
    }
  }

  loadTrades() {
    try {
      if (fs.existsSync(this.tradesFile)) {
        const raw = fs.readFileSync(this.tradesFile, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.activeTrades)) {
          data.activeTrades.forEach(t => {
            if (t && t.id && (t.status === 0 || t.status === 1)) {
              this.activeTrades.set(t.id, t);
            }
          });
        }
        if (Array.isArray(data.tradeHistory)) {
          this.tradeHistory = data.tradeHistory.slice(0, 100);
        }
      }
    } catch (e) {
      console.warn(`[Telegram Bot] Failed to load trades state:`, e.message);
    }
  }

  saveTrades() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      const data = {
        activeTrades: Array.from(this.activeTrades.values()),
        tradeHistory: this.tradeHistory.slice(0, 100),
        lastUpdated: Date.now()
      };
      fs.writeFileSync(this.tradesFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error(`[Telegram Bot] Failed to save trades:`, e.message);
    }
  }

  /**
   * Telegram API: sendMessage
   */
  async sendTelegramMessage(text, options = {}) {
    const botToken = options.botToken || this.config.botToken;
    const chatId = options.chatId || this.config.chatId;

    if (!botToken || !chatId) {
      console.warn(`[Telegram Bot] ⚠️ Missing botToken or chatId. Cannot send message.`);
      return { success: false, message: 'Missing botToken or chatId' };
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: options.parse_mode || 'HTML',
          disable_web_page_preview: true
        })
      });

      const data = await response.json();
      if (data.ok && data.result) {
        return { success: true, messageId: data.result.message_id, result: data.result };
      } else {
        console.warn(`[Telegram Bot] ❌ Send message rejected by Telegram:`, data.description);
        return { success: false, error: data.description };
      }
    } catch (e) {
      console.error(`[Telegram Bot] Fetch error in sendTelegramMessage:`, e.message);
      return { success: false, error: e.message };
    }
  }

  /**
   * Telegram API: editMessageText (Dynamic live in-place update)
   */
  async editTelegramMessage(messageId, text, options = {}) {
    const botToken = options.botToken || this.config.botToken;
    const chatId = options.chatId || this.config.chatId;

    if (!botToken || !chatId || !messageId) {
      return { success: false, message: 'Missing botToken, chatId or messageId' };
    }

    const url = `https://api.telegram.org/bot${botToken}/editMessageText`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text: text,
          parse_mode: options.parse_mode || 'HTML',
          disable_web_page_preview: true
        })
      });

      const data = await response.json();
      if (data.ok) {
        return { success: true, result: data.result };
      } else {
        // Telegram returns "message is not modified" if text is identical - ignore as normal
        if (data.description && data.description.includes('message is not modified')) {
          return { success: true, notModified: true };
        }
        console.warn(`[Telegram Bot] ❌ Edit message rejected by Telegram:`, data.description);
        return { success: false, error: data.description };
      }
    } catch (e) {
      console.error(`[Telegram Bot] Fetch error in editTelegramMessage:`, e.message);
      return { success: false, error: e.message };
    }
  }

  /**
   * Format message text matching exact user template specification
   */
  generateMessageText(trade) {
    const isBuy = trade.dir === 1;
    const dirIcon = isBuy ? '📈' : '📉';
    const dirText = isBuy ? 'SWING BUY' : 'SWING SELL';
    const pairName = (trade.symbol || 'XAUUSD').replace(/\.ca$/i, '').toUpperCase();
    const tfText = (trade.timeframe || '5').toUpperCase().startsWith('M') ? trade.timeframe.toUpperCase() : `M${trade.timeframe}`;

    const decimals = trade.decimals !== undefined ? trade.decimals : (pairName.includes('XAU') || pairName.includes('BTC') ? 2 : 4);
    const entryFormatted = Number(trade.entry).toFixed(decimals);
    const slFormatted = Number(trade.sl).toFixed(decimals);
    const tp1Formatted = Number(trade.tp1).toFixed(decimals);
    const tp2Formatted = Number(trade.tp2).toFixed(decimals);

    let slTag = '';
    let tp1Tag = '';
    let tp2Tag = '';

    if (trade.status === TRADE_STATUS.HIT_SL) {
      slTag = ' <b>[ ❌(Bị Quét) ]</b>';
    } else if (trade.status === TRADE_STATUS.CUT_EARLY_PROFIT && trade.isBreakEven) {
      slTag = ' <b>[ 🛡(Cắn SL Hòa Vốn - Đã Lãi TP1) ]</b>';
    } else if (trade.isBreakEven || trade.status === TRADE_STATUS.HIT_TP1 || trade.status === TRADE_STATUS.HIT_TP2) {
      slTag = ' <b>[ 🛡(Đã Dời Về Hòa Vốn) ]</b>';
    }

    if (trade.status === TRADE_STATUS.HIT_TP1 || trade.status === TRADE_STATUS.HIT_TP2 || trade.status === TRADE_STATUS.CUT_EARLY_PROFIT) {
      tp1Tag = ' <b>[ ⚡(ĐÃ HIT) ]</b>';
    }
    if (trade.status === TRADE_STATUS.HIT_TP2) {
      tp2Tag = ' <b>[ 🎯(ĐÃ HIT) ]</b>';
    }

    // Status checklist with dynamic highlighting
    const statusLines = [
      trade.status === TRADE_STATUS.RUNNING
        ? '👉 <b>0: ⏳ Đang chạy...</b>'
        : '  0: ⏳ Đang chạy...',
      trade.status === TRADE_STATUS.HIT_TP1
        ? '👉 <b>1: ⚡ Đã cán TP1 (Đang gồng TP2)</b>'
        : '  1: ⚡ Đã cán TP1 (Đang gồng TP2)',
      trade.status === TRADE_STATUS.HIT_TP2
        ? '👉 <b>2: 🎯 FULL TP2 (WIN ĐẬM) 🔥</b>'
        : '  2: 🎯 FULL TP2 (WIN ĐẬM)',
      trade.status === TRADE_STATUS.HIT_SL
        ? '👉 <b>-1: 🛑 HIT SL (LOSS)</b>'
        : '  -1: 🛑 HIT SL (LOSS)',
      trade.status === TRADE_STATUS.CUT_EARLY_LOSS
        ? '👉 <b>-2: ⚠️ CẮT LỆNH SỚM (Chưa có TP)</b>'
        : '  -2: ⚠️ CẮT LỆNH SỚM (Chưa có TP)',
      trade.status === TRADE_STATUS.CUT_EARLY_PROFIT
        ? '👉 <b>3: ⚠️ CẮT SỚM (Đã chốt túi TP1 💸)</b>'
        : '  3: ⚠️ CẮT SỚM (Đã chốt túi TP1 💸)'
    ];

    const text = 
`${dirIcon} [${dirText}] #${trade.id}
<b>Cặp:</b> ${pairName} (${tfText})

🏷 <b>Giá vào:</b> ${entryFormatted}
🛑 <b>SL:</b> ${slFormatted}${slTag}
✅ <b>TP1:</b> ${tp1Formatted}${tp1Tag}
✅ <b>TP2:</b> ${tp2Formatted}${tp2Tag}

📊 <b>TRẠNG THÁI:</b>
${statusLines.join('\n')}`;

    return text;
  }

  /**
   * Process full Candle CSV data event from Crazii WebSocket
   */
  async processDataEvent(csvData) {
    if (!csvData) return;
    const rawStr = typeof csvData === 'string' ? csvData : (csvData.rawData || csvData.data || '');
    if (!rawStr) return;

    const parts = rawStr.split(',');
    if (parts.length < 15) return;

    const symbol = parts[2]?.trim();
    const timeframe = parts[3]?.trim();
    const timestampStr = parts[4]?.trim();
    const twbOpen = parseFloat(parts[5]);
    const twbClose = parseFloat(parts[8]);
    const currentPrice = parseFloat(parts[12]);
    const pivotsBuy = parseFloat(parts[13]);
    const pivotsSell = parseFloat(parts[14]);
    const tp1Level = parts.length > 27 ? parseFloat(parts[27]) : NaN;
    const tp2Level = parts.length > 29 ? parseFloat(parts[29]) : NaN;

    if (!symbol || isNaN(currentPrice) || isNaN(twbOpen) || isNaN(twbClose)) return;

    const codeKey = `${symbol}_${timeframe}`;
    const candleKey = `${symbol}_${timeframe}_${timestampStr}`;

    const isYellow = twbClose > twbOpen;
    const isRed = twbClose < twbOpen;

    // 1. Check & Update Existing Active Trades for this Symbol & Timeframe
    await this.evaluateActiveTrades(symbol, timeframe, currentPrice, isYellow, isRed);

    // 2. Check if Signal Triggering is Enabled and symbol is monitored
    if (!this.config.enabled) return;
    if (!this.isSymbolMonitored(codeKey, symbol)) return;

    // 3. Prevent duplicate signal on same candle
    if (this.processedCandles.has(candleKey)) return;

    // 4. Max concurrent trades guard
    if (this.activeTrades.size >= (this.config.maxConcurrentTrades || 10)) {
      return;
    }

    // Check if there is already an open trade for this exact symbol & timeframe
    const existingOpen = Array.from(this.activeTrades.values()).find(
      t => (t.symbol === symbol || t.symbol?.replace(/\.ca$/i, '') === symbol?.replace(/\.ca$/i, '')) &&
           t.timeframe === timeframe && (t.status === 0 || t.status === 1)
    );
    if (existingOpen) return;

    // 5. Evaluate Signal Conditions
    let signalDir = 0; // 1: Buy, -1: Sell
    if (!isNaN(pivotsBuy) && pivotsBuy > 0 && isYellow) {
      signalDir = 1;
    } else if (!isNaN(pivotsSell) && pivotsSell > 0 && isRed) {
      signalDir = -1;
    }

    if (signalDir === 0) return;

    // 6. Calculate Entry, SL, TP1, TP2
    const cleanSym = symbol.replace(/\.ca$/i, '').toUpperCase();
    const slOffset = this.getSlOffsetForSymbol(cleanSym, currentPrice);

    let entry = currentPrice;
    let sl = signalDir === 1 ? entry - slOffset : entry + slOffset;
    let tp1 = !isNaN(tp1Level) && tp1Level > 0 ? tp1Level : (signalDir === 1 ? entry + slOffset * 1.5 : entry - slOffset * 1.5);
    let tp2 = !isNaN(tp2Level) && tp2Level > 0 ? tp2Level : (signalDir === 1 ? entry + slOffset * 3.0 : entry - slOffset * 3.0);

    // Ensure TP ordering is mathematically correct
    if (signalDir === 1) {
      if (tp1 <= entry) tp1 = entry + slOffset * 1.5;
      if (tp2 <= tp1) tp2 = tp1 + slOffset * 1.5;
    } else {
      if (tp1 >= entry) tp1 = entry - slOffset * 1.5;
      if (tp2 >= tp1) tp2 = tp1 - slOffset * 1.5;
    }

    const tradeId = `${cleanSym}_M${timeframe}_${Date.now().toString().slice(-6)}`;
    const newTrade = {
      id: tradeId,
      symbol: symbol,
      cleanSymbol: cleanSym,
      timeframe: timeframe,
      dir: signalDir,
      entry: entry,
      sl: sl,
      tp1: tp1,
      tp2: tp2,
      msg_id: null,
      status: TRADE_STATUS.RUNNING,
      candleTimestamp: timestampStr,
      openedAt: Date.now(),
      updatedAt: Date.now(),
      closedAt: null,
      pnl: 0,
      decimals: cleanSym.includes('XAU') || cleanSym.includes('BTC') ? 2 : 4
    };

    this.processedCandles.add(candleKey);

    // 7. Send Telegram Message
    const msgText = this.generateMessageText(newTrade);
    console.log(`[Telegram Bot] 🚀 TRIGGERED ${signalDir === 1 ? 'BUY' : 'SELL'} SIGNAL for ${cleanSym} (${timeframe}) at ${entry}`);

    const sendRes = await this.sendTelegramMessage(msgText);
    if (sendRes.success && sendRes.messageId) {
      newTrade.msg_id = sendRes.messageId;
      console.log(`[Telegram Bot] ✉️ Telegram message sent (Msg ID: ${sendRes.messageId})`);
    }

    this.activeTrades.set(tradeId, newTrade);
    this.saveTrades();
  }

  /**
   * Process Real-time sub-second Tick Price event
   */
  async processTickEvent(sym, priceVal) {
    if (!sym || priceVal === undefined) return;
    const numPrice = parseFloat(priceVal);
    if (isNaN(numPrice) || numPrice <= 0) return;

    const cleanSym = String(sym).replace(/\.ca$/i, '').trim().toUpperCase();

    // Iterate through active trades matching this symbol
    for (const trade of this.activeTrades.values()) {
      if (trade.status !== TRADE_STATUS.RUNNING && trade.status !== TRADE_STATUS.HIT_TP1) continue;

      const tradeClean = trade.cleanSymbol || trade.symbol?.replace(/\.ca$/i, '').toUpperCase();
      if (tradeClean !== cleanSym) continue;

      await this.evaluateTradePrice(trade, numPrice);
    }
  }

  /**
   * Evaluate Active Trades on candle close or CSV update
   */
  async evaluateActiveTrades(symbol, timeframe, currentPrice, isYellow, isRed) {
    const cleanSym = symbol.replace(/\.ca$/i, '').toUpperCase();

    for (const trade of this.activeTrades.values()) {
      if (trade.status !== TRADE_STATUS.RUNNING && trade.status !== TRADE_STATUS.HIT_TP1) continue;

      const tradeClean = trade.cleanSymbol || trade.symbol?.replace(/\.ca$/i, '').toUpperCase();
      if (tradeClean !== cleanSym || trade.timeframe !== timeframe) continue;

      // 1. Check TP / SL with current price
      const priceHit = await this.evaluateTradePrice(trade, currentPrice);
      if (priceHit) continue; // Trade already transitioned

      // 2. Check Early Cut (Candle Reversal)
      if (this.config.allowEarlyCut) {
        let isReversal = false;
        if (trade.dir === 1 && isRed) {
          isReversal = true; // BUY flipped to Bearish Red
        } else if (trade.dir === -1 && isYellow) {
          isReversal = true; // SELL flipped to Bullish Yellow
        }

        if (isReversal) {
          const newStatus = trade.status === TRADE_STATUS.HIT_TP1 ? TRADE_STATUS.CUT_EARLY_PROFIT : TRADE_STATUS.CUT_EARLY_LOSS;
          await this.transitionTradeStatus(trade, newStatus, `Reversal detected (Candle flipped color)`);
        }
      }
    }
  }

  /**
   * Evaluate price against TP1, TP2, and SL
   */
  async evaluateTradePrice(trade, currentPrice) {
    let newStatus = null;

    if (trade.dir === 1) {
      // BUY Trade
      if (currentPrice >= trade.tp2) {
        newStatus = TRADE_STATUS.HIT_TP2;
      } else if (currentPrice >= trade.tp1 && trade.status === TRADE_STATUS.RUNNING) {
        newStatus = TRADE_STATUS.HIT_TP1;
      } else if (currentPrice <= trade.sl) {
        if (trade.status === TRADE_STATUS.HIT_TP1 || trade.isBreakEven) {
          newStatus = TRADE_STATUS.CUT_EARLY_PROFIT; // Hit SL at Break-Even after locking TP1 profit
        } else {
          newStatus = TRADE_STATUS.HIT_SL;
        }
      }
    } else {
      // SELL Trade
      if (currentPrice <= trade.tp2) {
        newStatus = TRADE_STATUS.HIT_TP2;
      } else if (currentPrice <= trade.tp1 && trade.status === TRADE_STATUS.RUNNING) {
        newStatus = TRADE_STATUS.HIT_TP1;
      } else if (currentPrice >= trade.sl) {
        if (trade.status === TRADE_STATUS.HIT_TP1 || trade.isBreakEven) {
          newStatus = TRADE_STATUS.CUT_EARLY_PROFIT; // Hit SL at Break-Even after locking TP1 profit
        } else {
          newStatus = TRADE_STATUS.HIT_SL;
        }
      }
    }

    if (newStatus !== null && newStatus !== trade.status) {
      await this.transitionTradeStatus(trade, newStatus, `Price reached ${currentPrice}`);
      return true;
    }
    return false;
  }

  /**
   * Transition trade status and dynamically edit existing Telegram message
   */
  async transitionTradeStatus(trade, newStatus, reason = '') {
    const oldStatus = trade.status;
    trade.status = newStatus;
    trade.updatedAt = Date.now();

    // 🛡 Bổ sung Dời SL về Hòa Vốn (Entry) ngay khi cán TP1
    if (newStatus === TRADE_STATUS.HIT_TP1) {
      if (this.config.autoMoveSlToBreakEven !== false) {
        if (trade.original_sl === undefined) {
          trade.original_sl = trade.sl;
        }
        trade.sl = trade.entry; // Move SL to Entry (Break-Even)
        trade.isBreakEven = true;
        console.log(`[Telegram Bot] 🛡 Trade #${trade.id} Hit TP1 -> Automatically moved SL to Break-Even (${trade.entry})`);
      }
    }

    console.log(`[Telegram Bot] 🔄 Trade #${trade.id} status changed: [${oldStatus} -> ${newStatus}] (${reason})`);

    // Dynamic Edit Telegram Message
    if (trade.msg_id) {
      const updatedText = this.generateMessageText(trade);
      const editRes = await this.editTelegramMessage(trade.msg_id, updatedText);
      if (editRes.success) {
        console.log(`[Telegram Bot] ✏️ Successfully edited Telegram message #${trade.msg_id} for trade #${trade.id}`);
      }
    }

    // If trade reached terminal state (Hit TP2, Hit SL, or Cut Early), move to history
    if (newStatus === TRADE_STATUS.HIT_TP2 || newStatus === TRADE_STATUS.HIT_SL || newStatus === TRADE_STATUS.CUT_EARLY_LOSS || newStatus === TRADE_STATUS.CUT_EARLY_PROFIT) {
      trade.closedAt = Date.now();
      this.activeTrades.delete(trade.id);
      this.tradeHistory.unshift(trade);
      if (this.tradeHistory.length > 100) {
        this.tradeHistory.pop();
      }
    }

    this.saveTrades();
  }

  /**
   * Manual / Interactive Close for UI
   */
  async manualCloseTrade(tradeId, closeStatus = TRADE_STATUS.CUT_EARLY_PROFIT) {
    const trade = this.activeTrades.get(tradeId);
    if (!trade) return { success: false, message: 'Trade not found' };

    await this.transitionTradeStatus(trade, closeStatus, 'Manually closed from Bot Dashboard');
    return { success: true, trade };
  }

  /**
   * Helper to trigger a demo test trade signal (interactive simulator)
   */
  async triggerTestSignal(params = {}) {
    const symbol = params.symbol || 'XAUUSD.ca_5';
    const cleanSym = symbol.replace(/\.ca$/i, '').toUpperCase();
    const timeframe = params.timeframe || '5';
    const dir = params.dir !== undefined ? Number(params.dir) : 1;
    const entry = params.entry ? parseFloat(params.entry) : (cleanSym.includes('XAU') ? 2915.50 : 64500.00);

    const slOffset = this.getSlOffsetForSymbol(cleanSym, entry);
    const sl = dir === 1 ? entry - slOffset : entry + slOffset;
    const tp1 = dir === 1 ? entry + slOffset * 1.5 : entry - slOffset * 1.5;
    const tp2 = dir === 1 ? entry + slOffset * 3.0 : entry - slOffset * 3.0;

    const tradeId = `DEMO_${cleanSym}_M${timeframe}_${Date.now().toString().slice(-4)}`;
    const testTrade = {
      id: tradeId,
      symbol: symbol,
      cleanSymbol: cleanSym,
      timeframe: timeframe,
      dir: dir,
      entry: entry,
      sl: sl,
      tp1: tp1,
      tp2: tp2,
      msg_id: null,
      status: TRADE_STATUS.RUNNING,
      openedAt: Date.now(),
      updatedAt: Date.now(),
      closedAt: null,
      decimals: cleanSym.includes('XAU') || cleanSym.includes('BTC') ? 2 : 4
    };

    const msgText = this.generateMessageText(testTrade);
    const sendRes = await this.sendTelegramMessage(msgText);
    if (sendRes.success && sendRes.messageId) {
      testTrade.msg_id = sendRes.messageId;
    }

    this.activeTrades.set(tradeId, testTrade);
    this.saveTrades();

    return {
      success: true,
      trade: testTrade,
      telegramResult: sendRes
    };
  }

  isSymbolMonitored(codeKey, symbol) {
    if (!this.config.monitoredSymbols || this.config.monitoredSymbols.length === 0) return true;
    const cleanCode = codeKey.replace(/\.ca/i, '').toLowerCase();
    const cleanSym = symbol.replace(/\.ca/i, '').toLowerCase();

    return this.config.monitoredSymbols.some(s => {
      const cs = s.replace(/\.ca/i, '').toLowerCase();
      return cs === cleanCode || cs === cleanSym || cleanCode.startsWith(cs);
    });
  }

  getSlOffsetForSymbol(symbol, price) {
    if (this.config.defaultSlOffset && this.config.defaultSlOffset > 0) {
      return Number(this.config.defaultSlOffset);
    }
    if (symbol.includes('XAU')) return 20.0;
    if (symbol.includes('BTC')) return 450.0;
    if (symbol.includes('ETH')) return 35.0;
    return price * 0.005; // 0.5% default
  }

  getStatusPayload() {
    const safeConfig = { ...this.config };
    delete safeConfig.botToken;
    
    return {
      config: {
        ...safeConfig,
        hasBotToken: Boolean(this.config.botToken),
        botTokenPreview: this.config.botToken ? `${this.config.botToken.slice(0, 6)}...${this.config.botToken.slice(-4)}` : ''
      },
      activeTrades: Array.from(this.activeTrades.values()),
      tradeHistory: this.tradeHistory.slice(0, 50),
      stats: {
        totalTrades: this.activeTrades.size + this.tradeHistory.length,
        activeCount: this.activeTrades.size,
        historyCount: this.tradeHistory.length,
        winCount: this.tradeHistory.filter(t => t.status === TRADE_STATUS.HIT_TP1 || t.status === TRADE_STATUS.HIT_TP2 || t.status === TRADE_STATUS.CUT_EARLY_PROFIT).length,
        lossCount: this.tradeHistory.filter(t => t.status === TRADE_STATUS.HIT_SL || t.status === TRADE_STATUS.CUT_EARLY_LOSS).length
      }
    };
  }
}

// Singleton Instance
const telegramSignalBot = new TelegramSignalBot();

module.exports = {
  telegramSignalBot,
  TRADE_STATUS
};
