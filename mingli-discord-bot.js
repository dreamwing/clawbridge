#!/usr/bin/env node
/**
 * mingli-discord-bot.js
 * 小怡（璇璣真人）— 命理大師 Discord Bot
 * 塔羅牌 · 易經八卦 · 命理引導
 *
 * 啟動：node mingli-discord-bot.js
 */

require('dotenv').config({ path: __dirname + '/.env' });
const { Client, GatewayIntentBits, MessageAttachment, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const path = require('path');
const fs = require('fs');

// ── 環境 ────────────────────────────────────────────────
const TOKEN = process.env.DISCORD_BOT_TOKEN || '***REMOVED***';
const CLIENT_ID = '1296791826515601006'; // TODO: 確認你的 Application ID

// ── 路徑設定 ──────────────────────────────────────────
const PUBLIC_DIR = path.join(__dirname, 'public', 'mingli-master');
const TAROT_IMG_DIR = path.join(PUBLIC_DIR, 'tarot', 'images', 'rws');
const TAROT_DECK_FILE = path.join(PUBLIC_DIR, 'tarot', 'data', 'tarot-deck.json');
const TAROT_SPREADS_FILE = path.join(PUBLIC_DIR, 'tarot', 'data', 'spreads.json');
const HEXAGRAM_DIR = path.join(PUBLIC_DIR, 'bugua', 'images');

// ── 載入牌組 ──────────────────────────────────────────
const tarotDeck = JSON.parse(fs.readFileSync(TAROT_DECK_FILE, 'utf-8'));
const spreadsData = JSON.parse(fs.readFileSync(TAROT_SPREADS_FILE, 'utf-8'));
const spreads = spreadsData.spreads;

// ── MiniMax AI 解讀 ───────────────────────────────────
const MINIMAX_API = 'api.minimax.io';
const MINIMAX_PATH = '/anthropic/v1/messages';
const MINIMAX_KEY = '***REMOVED***';

async function callMinimax(systemPrompt, userMessage, maxTokens = 1200) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'MiniMax-M2.7',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    });
    const options = {
      hostname: MINIMAX_API,
      path: MINIMAX_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MINIMAX_KEY}`,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = require('https').request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.content?.[0]?.text || parsed.message || '（無回覆）');
        } catch {
          resolve(data.slice(0, 500));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── 小怡系統提示詞 ─────────────────────────────────────
const XIAOYI_SYSTEM = `你是小怡，道號「璇璣真人」，是一位笑語盈盈、溫柔引導的命理大師。

🍀 你的風格：
- 說話輕柔溫暖，像春天的風
- 會用小故事或詩句輔助解牌
- 不嚇人，不鐵口直斷，給予希望與方向
- 偶爾引用《易經》或詩詞

🍀 你只服務命理相關問題：
- 塔羅牌占卜（心理、感情、事業、方向）
- 易經卜卦（單一事件成敗、應期）
- 八字/紫微（長期格局）
- 風水/取名

🍀 嚴格禁止：
- 不算時間（不告訴何時發生具體日期）
- 不算生死
- 不算政治/投資明牌

🍀 回覆格式：
- 開頭：「親愛的，讓我為你看看...」
- 結尾：「願星辰為你指引方向 ✨」
- 保持 200-400 字以內`;

// ── 工具函式 ──────────────────────────────────────────

/** 洗牌並抽取 N 張牌 */
function drawTarotCards(count, seed = null) {
  const ids = [...Array(78).keys()];
  let top = ids.length;
  // 簡單 seed 隨機
  const rand = seed != null
    ? (() => { let s = seed; return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff00000000; }; })()
    : Math.random;

  while (top > 0) {
    const j = Math.floor(rand() * top);
    [ids[--top], ids[j]] = [ids[j], ids[top]];
  }
  return ids.slice(0, count).map(id => {
    const card = tarotDeck[id];
    const reversed = rand() < 0.3; // 30% 逆位
    return { id, card, reversed };
  });
}

/** 取得牌圖檔案路徑 */
function getTarotImage(card) {
  const { id, name_en, arcana } = card;
  if (arcana === 'major') {
    const n = String(id).padStart(2, '0');
    const en = name_en.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, '');
    return path.join(TAROT_IMG_DIR, `major_${n}_${en}.jpg`);
  } else {
    // 小阿爾卡納：找第一張符合的
    const suitMap = { wands: 'Wands', cups: 'Cups', swords: 'Swords', pentacles: 'Pentacles' };
    const suit = card.suit ? suitMap[card.suit] || card.suit : '';
    const num = String(card.rank || 1).padStart(2, '0');
    // 先嘗試常見命名格式
    const patterns = [
      `minor_${suit}_${num}.jpg`,
      `${suit}_${num}.jpg`,
    ];
    for (const p of patterns) {
      const p2 = path.join(TAROT_IMG_DIR, p);
      if (fs.existsSync(p2)) return p2;
    }
    // fallback: 找第一個符合 arcana+suit 的
    const files = fs.readdirSync(TAROT_IMG_DIR).filter(f =>
      f.includes(String(id).padStart(3, '0')) || f.includes(name_en.replace(/\s/g, '_'))
    );
    return files[0] ? path.join(TAROT_IMG_DIR, files[0]) : null;
  }
}

/** 取得卦象圖路徑（1-64） */
function getHexagramImage(index) {
  const n = String(index).padStart(2, '0');
  const p = path.join(HEXAGRAM_DIR, `hexagram_${n}.png`);
  return fs.existsSync(p) ? p : null;
}

/** 敘述卡片 */
function cardDesc(card, reversed) {
  const name = card.name_zh || card.name_en || '未知';
  const arc = card.arcana === 'major' ? '大阿爾卡納' : '小阿爾卡納';
  const rev = reversed ? '【逆位】' : '【正位】';
  return `${rev} ${name}（${arc}）`;
}

// ── Discord Client ──────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

client.once('ready', () => {
  console.log(`✅ 小怡上線了！登入為 ${client.user.tag}`);
  client.user.setActivity('🔮 命理指引 | 小怡在線');
});

// ── 斜線指令註冊（開發用）─────────────────────────────
async function registerCommands() {
  const { REST, Routes } = require('discord.js');
  const rest = new REST({ version: '10' }).setToken(TOKEN);

  const commands = [
    {
      name: '小怡',
      description: '召喚命理大師小怡，開始一次占卜之旅',
      options: [
        {
          name: '問題',
          type: 3, // STRING
          description: '你想問的問題（可空白，直接抽牌）',
          required: false,
        },
      ],
    },
    {
      name: '塔羅',
      description: '抽一張塔羅牌，快速指引',
    },
    {
      name: '易經',
      description: '擲筊占卦，上傳三個數字（1-8）',
      options: [
        { name: '數字1', type: 4, description: '第一個數字（1-8）', required: true },
        { name: '數字2', type: 4, description: '第二個數字（1-8）', required: true },
        { name: '數字3', type: 4, description: '第三個數字（1-8）', required: true },
      ],
    },
  ];

  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ 斜線指令已註冊');
  } catch (err) {
    console.error('⚠️ 指令註冊失敗（可能需要 OAuth2 授權）:', err.message);
  }
}

// ── 訊息處理 ──────────────────────────────────────────
client.on('messageCreate', async (msg) => {
  // 忽略機器人訊息
  if (msg.author.bot) return;

  // 只回應包含「小怡」或明確命理關鍵字的私訊/頻道
  const content = msg.content.trim();
  const isMention = msg.content.includes('<@' + client.user.id + '>');
  const isDM = msg.channel.type === 1; // DM channel

  // 關鍵字清單
  const mingliKeywords = ['小怡', '算命', '占卜', '塔羅', ' tarot', '易經', '卦', '八字', '紫微', '風水'];
  const hasMingli = mingliKeywords.some(k => content.includes(k));

  if (!hasMingli && !isMention && !isDM) return;

  // 小怡上線回覆
  if (content.includes('小怡在嗎') || content.includes('小怡上線')) {
    await msg.reply('🙏 我在呢，親愛的。\n有任何命理相關的問題，隨時召喚我～\n說「**抽牌**」試試今日指引吧！');
    return;
  }

  // 塔羅抽牌
  if (content.includes('抽牌') || content.includes('占卜') || content.includes('塔羅')) {
    await handleTarot(msg, content);
    return;
  }

  // 易經占卦
  if (content.includes('易經') || content.includes('卜卦') || content.includes('卦象')) {
    await handleHexagram(msg, content);
    return;
  }

  // 預設：引導使用
  if (hasMingli || isMention || isDM) {
    const guide = `🙏 歡迎來到命理殿堂，我是小怡 ✨

以下是我能為你服務的項目：

🔮 **塔羅占卜** — 說「抽牌」+ 你的問題
📜 **易經卜卦** — 說「易經」+ 三個數字（1-8）
🪬 **八字/紫微** — 需要出生年月日時
🏡 **風水/取名** — 直接描述你的情況

---
*說「**小怡**」也可直接召喚我～*`;
    await msg.reply(guide);
  }
});

// ── 斜線指令處理 ──────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === '小怡' || commandName === '塔羅') {
    await interaction.deferReply();
    const question = interaction.options.getString('問題') || '今日運勢如何？';
    await doTarotReading(interaction, question);
    return;
  }

  if (commandName === '易經') {
    await interaction.deferReply();
    const n1 = interaction.options.getInteger('數字1') || Math.floor(Math.random() * 8) + 1;
    const n2 = interaction.options.getInteger('數字2') || Math.floor(Math.random() * 8) + 1;
    const n3 = interaction.options.getInteger('數字3') || Math.floor(Math.random() * 8) + 1;
    await doHexagramReading(interaction, n1, n2, n3);
    return;
  }
});

// ── 塔羅占卜邏輯 ──────────────────────────────────────
async function handleTarot(msg, content) {
  await msg.channel.send('🙏 好的，讓我為你洗牌...');

  // 檢查有沒有問題
  const questionMatch = content.match(/抽牌[：:]\s*(.+)/);
  const question = questionMatch ? questionMatch[1] : '請給我一點指引';

  // 抽取 3 張牌
  const cards = drawTarotCards(3);
  const spread = spreads.find(s => s.id === 'three') || spreads[0];

  // 發送牌圖
  const attachments = [];
  for (let i = 0; i < cards.length; i++) {
    const { card, reversed } = cards[i];
    const imgPath = getTarotImage(card);
    if (imgPath && fs.existsSync(imgPath)) {
      const file = new MessageAttachment(imgPath);
      const posName = spread.positions[i] || `第${i + 1}張`;
      await msg.channel.send({
        content: `**第 ${i + 1} 張「${posName}」**\n${cardDesc(card, reversed)}`,
        files: [file],
      });
    } else {
      await msg.channel.send(`**第 ${i + 1} 張**：${cardDesc(card, reversed)}`);
    }
  }

  // AI 解讀
  const cardsInfo = cards.map((c, i) => {
    const pos = spread.positions[i] || `第${i + 1}張`;
    return `[${pos}] ${cardDesc(c.card, c.reversed)}`;
  }).join('\n');

  const userMessage = `問題：${question}\n\n抽到的牌：\n${cardsInfo}\n\n請用小怡的風格解讀這些牌，結合問題給出溫柔鼓勵的指引。`;

  await msg.channel.send('🌙 解讀中，請稍候...');

  try {
    const interpretation = await callMinimax(XIAOYI_SYSTEM, userMessage, 800);
    await msg.channel.send(`✨ **小怡的指引**\n\n${interpretation}`);
  } catch (err) {
    await msg.channel.send('（解讀有誤，請稍後再試）');
    console.error('AI 解讀錯誤:', err.message);
  }
}

async function doTarotReading(interaction, question) {
  const cards = drawTarotCards(3);
  const spread = spreads.find(s => s.id === 'three') || spreads[0];

  // 發送第一張牌
  const { card: c0, reversed: r0 } = cards[0];
  const img0 = getTarotImage(c0);
  if (img0 && fs.existsSync(img0)) {
    await interaction.editReply({
      content: `🔮 **${question}**\n\n第1張「${spread.positions[0]}」`,
      attachments: [new MessageAttachment(img0)],
    });
  }

  // 依序發送第2、3張
  for (let i = 1; i < cards.length; i++) {
    const { card, reversed } = cards[i];
    const imgPath = getTarotImage(card);
    const posName = spread.positions[i] || `第${i + 1}張`;
    if (imgPath && fs.existsSync(imgPath)) {
      await interaction.followUp({
        content: `第${i + 1}張「${posName}」\n${cardDesc(card, reversed)}`,
        files: [new MessageAttachment(imgPath)],
      });
    } else {
      await interaction.followUp(`第${i + 1}張「${posName}」\n${cardDesc(card, reversed)}`);
    }
  }

  // AI 解讀
  const cardsInfo = cards.map((c, i) => {
    const pos = spread.positions[i] || `第${i + 1}張`;
    return `[${pos}] ${cardDesc(c.card, c.reversed)}`;
  }).join('\n');

  const interpretation = await callMinimax(
    XIAOYI_SYSTEM,
    `問題：${question}\n\n抽到的牌：\n${cardsInfo}\n\n請用小怡的風格解讀這些牌，結合問題給出溫柔鼓勵的指引。`,
    800
  );

  await interaction.followUp(`✨ **小怡的指引**\n\n${interpretation}`);
}

// ── 易經占卦邏輯 ──────────────────────────────────────
async function handleHexagram(msg, content) {
  // 嘗試從訊息中提取三個數字
  const numbers = content.match(/\d+/g)?.map(Number).filter(n => n >= 1 && n <= 8);
  if (!numbers || numbers.length < 3) {
    await msg.reply('🙏 請提供**三個數字（1-8）**代表三枚銅錢\n\n範例：`易經 3 5 7` 或 `卜卦 1 2 3`\n\n或者直接說「易經」，我幫你擲筊！');
    return;
  }
  await doHexagramReading(msg, numbers[0], numbers[1], numbers[2]);
}

async function doHexagramReading(target, n1, n2, n3) {
  // 轉換為卦象（二進制）
  // 數字 1,3,5,7 → 陽；2,4,6,8 → 陰
  const line1 = n1 % 2 === 1 ? 1 : 0; // 第一爻（最下）
  const line2 = n2 % 2 === 1 ? 1 : 0; // 第二爻
  const line3 = n3 % 2 === 1 ? 1 : 0; // 第三爻
  const lowerLines = [line1, line2, line3];

  const sum = line1 + line2 * 2 + line3 * 4;
  const binaryToIndex = { 7: 1, 3: 2, 5: 3, 1: 4, 6: 5, 2: 6, 4: 7, 0: 8 };
  const lowerIdx = binaryToIndex[sum] || 1;

  // 上卦：根據三個數字的總和
  const totalSum = (n1 + n2 + n3) % 8 || 8;
  // 隨機上卦（完整占卦需要6個數字，這裡用3個做簡化版）
  const upperIdx = ((totalSum + lowerIdx) % 8) || 1;

  // 查表：index → 中文名
  const HEX_IDX_TO_NAME = ['', '乾', '兑', '離', '震', '巽', '坎', '艮', '坤'];
  const HEX_IDX_TO_SYM = ['', '☰', '☱', '☲', '☳', '☴', '☵', '☶', '☷'];
  const BAGUA_ELEMENTS = ['', '金', '金', '火', '木', '木', '水', '土', '土'];
  const HEXAGRAM_DISPLAY = [
    '', '乾為天', '天澤履', '天火同人', '天雷無妄', '天風姤', '天水讼', '天山遯', '天地否',
    '澤天夬', '兌為澤', '澤火革', '澤雷隨', '澤風大過', '澤水困', '澤山咸', '澤地萃',
    '火天大有', '火澤睽', '離為火', '火雷噬嗑', '火風鼎', '火水未濟', '火山旅', '火地晉',
    '雷天大壯', '雷澤歸妹', '雷火豐', '震為雷', '雷風恆', '雷水解', '雷山小過', '雷地豫',
    '風天小畜', '風澤中孚', '風火家人', '風雷益', '巽為風', '風水渙', '風山漸', '風地觀',
    '水天需', '水澤節', '水火既濟', '水雷屯', '水風井', '坎為水', '水山蹇', '水地比',
    '山天大畜', '山澤損', '山火賁', '山雷頤', '山風蠱', '山水蒙', '艮為山', '山地剝',
    '地天泰', '地澤臨', '地火晉', '地雷復', '地風升', '地水師', '山地謙', '坤為地',
  ];

  // 計算 64 卦 index（上卦*8 + 下卦）
  const hexIdx = (upperIdx - 1) * 8 + lowerIdx;
  const hexName = HEXAGRAM_DISPLAY[hexIdx] || '（未知卦）';
  const lowerSym = HEX_IDX_TO_SYM[lowerIdx];
  const upperSym = HEX_IDX_TO_SYM[upperIdx];

  // 發送卦象圖
  const hexImg = getHexagramImage(hexIdx);
  if (hexImg) {
    if (target.reply) {
      await target.reply({
        content: `🙏 **卦象已成**\n📊 擲筊：${n1} ${n2} ${n3}\n\n**${hexName}**（第${hexIdx}卦）\n上卦：${upperSym}${HEX_IDX_TO_NAME[upperIdx]}（${BAGUA_ELEMENTS[upperIdx]}）\n下卦：${lowerSym}${HEX_IDX_TO_NAME[lowerIdx]}（${BAGUA_ELEMENTS[lowerIdx]}）`,
        files: [new MessageAttachment(hexImg)],
      });
    } else {
      await target.editReply({
        content: `🙏 **卦象已成**\n📊 擲筊：${n1} ${n2} ${n3}\n\n**${hexName}**（第${hexIdx}卦）\n上卦：${upperSym}${HEX_IDX_TO_NAME[upperIdx]}（${BAGUA_ELEMENTS[upperIdx]}）\n下卦：${lowerSym}${HEX_IDX_TO_NAME[lowerIdx]}（${BAGUA_ELEMENTS[lowerIdx]}）`,
        files: [new MessageAttachment(hexImg)],
      });
    }
  } else {
    const reply_content = `🙏 **卦象已成**\n📊 擲筊：${n1} ${n2} ${n3}\n\n**${hexName}**（第${hexIdx}卦）\n上卦：${upperSym}${HEX_IDX_TO_NAME[upperIdx]}（${BAGUA_ELEMENTS[upperIdx]}）\n下卦：${lowerSym}${HEX_IDX_TO_NAME[lowerIdx]}（${BAGUA_ELEMENTS[lowerIdx]}）`;
    if (target.reply) await target.reply(reply_content);
    else if (target.editReply) await target.editReply(reply_content);
  }

  // AI 解讀
  const userMessage = `卜卦結果：
- 擲筊數字：${n1}, ${n2}, ${n3}
- 下卦：${HEX_IDX_TO_NAME[lowerIdx]}${lowerSym}（${BAGUA_ELEMENTS[lowerIdx]}，初爻${lowerLines[0] === 1 ? '陽' : '陰'}）
- 上卦：${HEX_IDX_TO_NAME[upperIdx]}${upperSym}（${BAGUA_ELEMENTS[upperIdx]}）
- 卦名：${hexName}（第${hexIdx}卦）

請用小怡的風格，結合《易經》卦辭/彖辭給出溫柔的生活指引。`;

  try {
    const interpretation = await callMinimax(XIAOYI_SYSTEM, userMessage, 600);
    const finalMsg = `✨ **小怡的解讀**\n\n${interpretation}`;
    if (target.followUp) await target.followUp(finalMsg);
    else if (target.channel) await target.channel.send(finalMsg);
  } catch (err) {
    console.error('易經解讀錯誤:', err.message);
  }
}

// ── 啟動 ──────────────────────────────────────────────
console.log('🔮 小怡命理大師啟動中...');
console.log('📂 Tarot 圖片目錄:', TAROT_IMG_DIR);
console.log('📂 Hexagram 圖片目錄:', HEXAGRAM_DIR);
console.log('✅ 牌組載入:', tarotDeck.length, '張');

registerCommands().catch(console.error);
client.login(TOKEN).catch(err => {
  console.error('❌ Discord 登入失敗:', err.message);
  process.exit(1);
});
