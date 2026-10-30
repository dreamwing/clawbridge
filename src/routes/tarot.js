/**
 * 璇璣塔羅 · ClawBridge 整合版
 * 路徑：POST /api/tarot
 * 用途：接收 ClawBridge 轉發的占卜請求
 */
const express = require('express');
const router = express.Router();
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const MINIMAX_KEY = process.env.MINIMAX_API_KEY || '';
const CHAT_ID = '8508766428';

const SCRIPT_DIR = path.join(__dirname, '../..');
const IMG_DIR = path.join(SCRIPT_DIR, 'public/mingli-master/tarot/images/rws');
const DECK_FILE = path.join(SCRIPT_DIR, 'public/mingli-master/tarot/data/tarot-deck.json');
const SPREADS_FILE = path.join(SCRIPT_DIR, 'public/mingli-master/tarot/data/spreads.json');

// ── Telegram API ──────────────────────────────────────────────────────
function tg(method, data = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const opts = {
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── 抽牌 ───────────────────────────────────────────────────────────────
function drawCards(count) {
  const deck = JSON.parse(fs.readFileSync(DECK_FILE, 'utf-8'));
  const shuffled = [...Array(78).keys()];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count).map(id => {
    const card = deck[id];
    const reversed = Math.random() < 0.5;
    return { id, card, reversed };
  });
}

function getImagePath(card) {
  if (card.arcana === 'major') {
    // 大阿爾納斯：00_Fool.jpg ~ 21_World.jpg
    const enMap = {
      0:'00_Fool', 1:'01_Magician', 2:'02_High_Priestess', 3:'03_Empress',
      4:'04_Emperor', 5:'05_Hierophant', 6:'06_Lovers', 7:'07_Chariot',
      8:'08_Strength', 9:'09_Hermit', 10:'10_Wheel_of_Fortune', 11:'11_Justice',
      12:'12_Hanged_Man', 13:'13_Death', 14:'14_Temperance', 15:'15_Devil',
      16:'16_Tower', 17:'17_Star', 18:'18_Moon', 19:'19_Sun',
      20:'20_Judgement', 21:'21_World'
    };
    const fname = enMap[card.id] || `${String(card.id).padStart(2,'0')}_${card.name_en}`;
    return path.join(IMG_DIR, `${fname}.jpg`);
  } else {
    // 小阿爾納斯：Cups01.jpg ~ Cups14.jpg 等
    const suitMap = { wands:'Wands', cups:'Cups', swords:'Swords', pentacles:'Pents' };
    const suit = suitMap[card.suit] || card.suit;
    const valueStr = card.name_en.split(' of ')[0].trim();
    const valueMap = {
      'Ace':'01','One':'01','Two':'02','Three':'03','Four':'04','Five':'05',
      'Six':'06','Seven':'07','Eight':'08','Nine':'09','Ten':'10',
      'Page':'11','Knight':'12','Queen':'13','King':'14'
    };
    const num = valueMap[valueStr] || '01';
    return path.join(IMG_DIR, `${suit}${num}.jpg`);
  }
}

async function sendCardImage(chatId, card, position, positionName, spreadName) {
  const imgPath = getImagePath(card);
  if (!fs.existsSync(imgPath)) {
    console.log(`⚠️ 找不到圖片: ${imgPath}`);
    return;
  }
  const meaning = card.reversed ? card.reversed : card.upright;
  const caption = `🔮 *第 ${position} 張：${positionName}*\n${card.name} ${card.arcana === 'major' ? '✨' : '⚔️'} ${card.reversed ? '逆位 ↺' : '正位'}\n\n💬 *${meaning}*`;
  const stat = fs.statSync(imgPath);
  const photoData = fs.readFileSync(imgPath);
  const formData = `--tarotBoundary\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n--tarotBoundary\r\nContent-Disposition: form-data; name="photo"; filename="${path.basename(imgPath)}"\r\nContent-Type: image/jpeg\r\n\r\n`;
  const endData = `\r\n--tarotBoundary\r\nContent-Disposition: form-data; name="caption"\r\nContent-Type: text/plain\r\n\r\n${caption}\r\n--tarotBoundary\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nMarkdown\r\n--tarotBoundary--`;
  const body = Buffer.concat([
    Buffer.from(formData, 'utf8'), photoData, Buffer.from(endData, 'utf8')
  ]);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendPhoto`,
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=tarotBoundary', 'Content-Length': body.length }
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } }); });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

function callMinimax(systemPrompt, userMessage, maxTokens = 1200) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'MiniMax-M2.7',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    });
    const req = https.request({
      hostname: 'api.minimax.io',
      path: '/anthropic/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MINIMAX_KEY}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const p = JSON.parse(d);
          const textBlock = p.content?.find(b => b.type === 'text');
          resolve(textBlock?.text || p.message || d);
        } catch { resolve(d); }
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

// ── 占卜核心 ─────────────────────────────────────────────────────────
async function performDivination(chatId, question, spreadId = 'three') {
  const deckData = JSON.parse(fs.readFileSync(DECK_FILE, 'utf-8'));
  const spreadsData = JSON.parse(fs.readFileSync(SPREADS_FILE, 'utf-8'));
  const spread = spreadsData.spreads.find(s => s.id === spreadId) || spreadsData.spreads[1];

  await tg('sendMessage', {
    chat_id: chatId,
    text: `🔮 *璇璣塔羅 · ${spread.name}*\n━━━━━━━━━━━━━━━━\n📋 ${question}\n\n正在為您抽牌...`,
    parse_mode: 'Markdown'
  });
  await sleep(1500);

  const drawn = drawCards(spread.cards);
  const positions = spread.positions || Array.from({ length: spread.cards }, (_, i) => `第${i + 1}張`);

  for (let i = 0; i < drawn.length; i++) {
    const { card, reversed } = drawn[i];
    await sendCardImage(chatId, { ...card, reversed }, i + 1, positions[i], spread.name);
    await sleep(800);
  }

  await tg('sendMessage', {
    chat_id: chatId,
    text: '🔮 *璇璣正在解讀中...*\n━━━━━━━━━━━━━━━━',
    parse_mode: 'Markdown'
  });

  const cardDescriptions = drawn.map(({ card, reversed }, i) =>
    `第 ${i + 1} 張【${positions[i]}】：${card.name} ${reversed ? '(逆位)' : '(正位)'}\n含義：${reversed ? card.reversed : card.upright}`
  ).join('\n\n');

  const systemPrompt = `你是璇璣塔羅占卜師，專精塔羅牌解讀，融合西方神秘學與東方哲學。`;

  const interpretation = await callMinimax(systemPrompt,
    `請解讀這個塔羅占卜結果：\n\n問題：${question}\n牌陣：${spread.name}\n\n抽到的牌：\n${cardDescriptions}\n\n請給出深入、有意義的解讀，結合東西方智慧。`
  );

  await tg('sendMessage', {
    chat_id: chatId,
    text: `🔮 *解牌師璇璣曰：*\n━━━━━━━━━━━━━━━━\n${interpretation}`,
    parse_mode: 'Markdown'
  });

  await tg('sendMessage', {
    chat_id: chatId,
    text: '━━━━━━━━━━━━━━━━\n\n🔙 要再占一次，請說「占卜」～',
    parse_mode: 'Markdown'
  });
}

// ── 歡迎訊息 ─────────────────────────────────────────────────────────
async function sendWelcome(chatId) {
  await tg('sendMessage', {
    chat_id: chatId,
    text: `🙏 親愛的，我在呢！\n\n🔮 *璇璣塔羅 · 命理大師*\n━━━━━━━━━━━━━━━━\n我是小怡，笑語盈盈的命理大師。\n\n🍀 說「占卜」即可開始塔羅占卜\n🍀 說「易經」擲筊卜卦\n🍀 說「牌陣」查看可用牌陣\n\n有什麼想問的嗎？`,
    parse_mode: 'Markdown'
  });
}

// ── POST /api/tarot — ClawBridge 轉發的占卜請求 ─────────────────────
router.post('/', async (req, res) => {
  try {
    const { text, chat_id, message_id } = req.body;
    if (!text || !chat_id) { res.json({ ok: false }); return; }
    const chatId = String(chat_id);
    if (chatId !== CHAT_ID) { res.json({ ok: false }); return; }

    console.log(`🌙 [tarot] 收到：${text}`);

    if (text.includes('小怡') || text === '/start' || text === '/help') {
      await sendWelcome(chatId);
      res.json({ ok: true });
      return;
    }

    if (text === '牌陣') {
      const spreadsData = JSON.parse(fs.readFileSync(SPREADS_FILE, 'utf-8'));
      const list = spreadsData.spreads.map(s => `• *${s.name}*（${s.cards}張）— ${s.description || ''}`).join('\n');
      await tg('sendMessage', {
        chat_id: chatId,
        text: `📋 *可用牌陣*\n━━━━━━━━━━━━━━━━\n${list}\n\n預設：三張牌陣\n指定：如「占卜 感情 single」`,
        parse_mode: 'Markdown'
      });
      res.json({ ok: true });
      return;
    }

    if (text.startsWith('占卜') || text.startsWith('/tarot')) {
      const parts = text.replace('/tarot', '').trim().split(/\s+/);
      const question = parts[0] ? parts.slice(1).join(' ') : '一般占卜';
      const spreadId = parts.length > 1 ? parts[0] : 'three';
      console.log(`🌙 占卜請求：${question}，牌陣：${spreadId}`);
      // 非同步執行，不等完成
      performDivination(chatId, question, spreadId).catch(e => console.error('占卜錯誤:', e.message));
      res.json({ ok: true });
      return;
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('tarot route error:', e.message);
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /api/tarot — 網頁直接占卜介面 ────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { question, spread } = req.query;
    if (!question) {
      res.json({ ok: false, error: '缺少 question 參數' });
      return;
    }

    const spreadId = spread || 'three';
    console.log(`🌙 [GET tarot] 問題：${question}，牌陣：${spreadId}`);

    // 直接執行占卜並發送到 Telegram
    await performDivination(CHAT_ID, question, spreadId);
    res.json({ ok: true, message: '占卜請求已發送' });
  } catch (e) {
    console.error('tarot GET error:', e.message);
    res.json({ ok: false, error: e.message });
  }
});

module.exports = router;
