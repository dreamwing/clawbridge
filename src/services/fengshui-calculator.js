/**
 * Feng Shui Calculator — 三元玄空飛星、八宅明鏡核心計算
 * 
 * 參考：fengshui.skill/references/
 */

// ===== 九宮格方位映射 =====
const PALACE_DIRECTION = {
  1: '北',   // 坎
  2: '西南', // 坤
  3: '東',   // 震
  4: '東南', // 巽
  5: '中',
  6: '西北', // 乾
  7: '西',   // 兌
  8: '東北', // 艮
  9: '南'    // 離
};

const DIRECTION_GUA = {
  '北': 1, '坎': 1,
  '西南': 2, '坤': 2,
  '東': 3, '震': 3,
  '東南': 4, '巽': 4,
  '中': 5,
  '西北': 6, '乾': 6,
  '西': 7, '兌': 7,
  '東北': 8, '艮': 8,
  '南': 9, '離': 9
};

// 東四宅/西四宅
const EAST_FOUR = [1, 3, 4, 9]; // 坎、震、巽、離
const WEST_FOUR = [2, 6, 7, 8]; // 坤、乾、兌、艮

// 洛書軌跡（順飛）
const LUOSHU_ORDER = [5, 6, 7, 8, 9, 1, 2, 3, 4];
const LUOSHU_REVERSE = [5, 4, 3, 2, 1, 9, 8, 7, 6];

// ===== 陰陽山向判斷 =====
const YANG_MOUNTAINS = ['子', '寅', '辰', '午', '申', '戌'];
const YIN_MOUNTAINS = ['丑', '卯', '巳', '未', '酉', '亥'];

function isYangMountain(zi) {
  return YANG_MOUNTAINS.includes(zi);
}

// ===== 元運計算 =====
function getYunPeriod(year) {
  if (year >= 2024) return 9;
  if (year >= 2004) return 8;
  if (year >= 1984) return 7;
  if (year >= 1964) return 6;
  if (year >= 1944) return 5;
  if (year >= 1924) return 4;
  if (year >= 1904) return 3;
  if (year >= 1884) return 2;
  if (year >= 1864) return 1;
  return 9; // default to 九運
}

// ===== 流年星計算 =====
function getYearStar(year) {
  // 以 2024 為九運入中（4）
  // 2024: 4, 2025: 3, 2026: 2, ...
  const offset = 2024 - year;
  let star = 9 + offset;
  while (star <= 0) star += 9;
  while (star > 9) star -= 9;
  return star;
}

// ===== 九宮飛星排布 =====
/**
 * 排布運盤
 * @param {number} centerStar - 中宮星（入中之星）
 * @param {boolean} reverse - 是否逆飛
 */
function buildYunPan(centerStar, reverse = false) {
  const order = reverse ? LUOSHU_REVERSE : LUOSHU_ORDER;
  const palaces = {};
  
  // 找到入中之星在 order 中的位置
  const startIdx = order.indexOf(centerStar);
  
  // 依洛書軌跡填充九宮
  const positions = [
    [1, 0, 2, 1, 3], // 宮位對應 order 索引
    [4, 5, 6, 7, 8]
  ];
  
  // 洛書口訣：一六八三
  // 洛書九宮位置（中宮固定）：
  //   4 9 2
  //   3 5 7
  //   8 1 6
  
  let current = centerStar;
  const sequence = [current];
  
  for (let i = 1; i < 9; i++) {
    current = current + 1;
    if (current > 9) current = 1;
    sequence.push(current);
  }
  
  // 九宮對應 sequence 索引（順飛起點不同）
  // 中宮固定為 centerStar
  // 洛書九宮：
  //   巽(4) 離(9) 坤(2)
  //   震(3) 中(5) 兌(7)
  //   艮(8) 坎(1) 乾(6)
  
  if (reverse) {
    // 逆飛：5→4→3→2→1→9→8→7→6
    palaces['中'] = sequence[0];
    palaces['東南'] = sequence[1];
    palaces['南'] = sequence[2];
    palaces['西南'] = sequence[3];
    palaces['西'] = sequence[4];
    palaces['西北'] = sequence[5];
    palaces['北'] = sequence[6];
    palaces['東北'] = sequence[7];
    palaces['東'] = sequence[8];
  } else {
    // 順飛：5→6→7→8→9→1→2→3→4
    palaces['中'] = sequence[0];
    palaces['西北'] = sequence[1];
    palaces['西'] = sequence[2];
    palaces['東北'] = sequence[3];
    palaces['南'] = sequence[4];
    palaces['北'] = sequence[5];
    palaces['西南'] = sequence[6];
    palaces['東'] = sequence[7];
    palaces['東南'] = sequence[8];
  }
  
  return palaces;
}

/**
 * 計算向首（坐向）
 * @param {string} direction - 方向名（北、南、東、西等）
 */
function parseDirection(direction) {
  const d = DIRECTION_GUA[direction] || DIRECTION_GUA[direction + '向'] || null;
  return d;
}

// ===== 八宅命卦計算 =====
function calculateMingGua(gender, birthYear) {
  const lastTwo = birthYear % 100;
  const sum = Math.floor(lastTwo / 10) + (lastTwo % 10);
  let num = sum;
  while (num > 9) {
    num = Math.floor(num / 10) + (num % 10);
  }
  
  if (gender === '男') {
    const mingGua = (10 - num) % 9;
    return mingGua === 0 ? 9 : mingGua;
  } else {
    let result = (num + 5) % 9;
    if (result === 0) result = 9;
    if (num === 5) result = 2; // 女命 5 歲坤
    return result;
  }
}

function getMingGuaName(num) {
  const names = { 1: '坎', 2: '坤', 3: '震', 4: '巽', 5: '坤', 6: '乾', 7: '兌', 8: '艮', 9: '離' };
  return names[num] || '未知';
}

function isEastFourHouse(num) {
  return EAST_FOUR.includes(num);
}

function isWestFourHouse(num) {
  return WEST_FOUR.includes(num);
}

// ===== 八宅游年變卦 =====
const YOU_NIAN = {
  坎: { 生氣: '東南', 延年: '南', 天醫: '東', 伏位: '北', 禍害: '西', 六煞: '東北', 五鬼: '西南', 絕命: '西北' },
  離: { 生氣: '東', 延年: '北', 天醫: '東南', 伏位: '南', 禍害: '西北', 六煞: '西', 五鬼: '東北', 絕命: '西南' },
  震: { 生氣: '南', 延年: '東南', 天醫: '北', 伏位: '東', 禍害: '東北', 六煞: '西南', 五鬼: '西北', 絕命: '西' },
  巽: { 生氣: '北', 延年: '東', 天醫: '南', 伏位: '東南', 禍害: '西南', 六煞: '西北', 五鬼: '西', 絕命: '東北' },
  乾: { 生氣: '西南', 延年: '東北', 天醫: '西', 伏位: '西北', 禍害: '東南', 六煞: '北', 五鬼: '南', 絕命: '東' },
  坤: { 生氣: '西北', 延年: '西', 天醫: '東北', 伏位: '西南', 禍害: '東', 六煞: '南', 五鬼: '北', 絕命: '東南' },
  艮: { 生氣: '西', 延年: '西南', 天醫: '西北', 伏位: '東北', 禍害: '南', 六煞: '東', 五鬼: '東南', 絕命: '北' },
  兌: { 生氣: '東北', 延年: '西北', 天醫: '西南', 伏位: '西', 禍害: '北', 六煞: '東南', 五鬼: '東', 絕命: '南' }
};

// ===== 飛星盤計算（簡化版）====
/**
 * 排飛星盤
 * @param {string} facing - 朝向（如「南」、「東南」）
 * @param {string} sitting - 坐山（如「北」、「西北」）
 * @param {number} year - 入住/建造年份
 */
function calculateFlyingStars(facing, sitting, year) {
  const yun = getYunPeriod(year);
  const facingNum = parseDirection(facing) || 9;
  const sittingNum = parseDirection(sitting) || 3;
  
  const facingIsYang = facingNum % 2 === 1;
  const sittingIsYang = sittingNum % 2 === 1;
  
  // 山星逆飛/順飛
  const shanReverse = facingIsYang && sittingIsYang; // 陽山陽向 → 逆
  // 向星順飛/逆飛
  const xiangReverse = facingIsYang && sittingIsYang ? false : (facingIsYang === sittingIsYang ? true : false);
  
  // 運盤（中宮固定）
  const yunPan = buildYunPan(yun, false);
  
  // 山星盤
  const shanPan = buildYunPan(yun, shanReverse);
  
  // 向星盤
  const xiangPan = buildYunPan(yun, xiangReverse);
  
  // 流年星
  const yearStar = getYearStar(new Date().getFullYear());
  const yearPan = buildYunPan(yearStar, false);
  
  return {
    yun,
    year,
    currentYear: new Date().getFullYear(),
    facing,
    sitting,
    yunPan,
    shanPan,
    xiangPan,
    yearPan,
    yearStar,
    shanReverse,
    xiangReverse
  };
}

// ===== 格局判斷 =====
function analyzePattern(fs) {
  const { yunPan, shanPan, xiangPan } = fs;
  
  // 找出旺星（當令）
  const wangStar = fs.yun; // 九運為9
  
  // 旺星在山、向
  const shanWang = Object.entries(shanPan).find(([dir, star]) => star === wangStar)?.[0];
  const xiangWang = Object.entries(xiangPan).find(([dir, star]) => star === wangStar)?.[0];
  
  let pattern = '一般格局';
  let quality = '平';
  
  // 旺山旺向
  if (shanWang === fs.sitting && xiangWang === fs.facing) {
    pattern = '旺山旺向';
    quality = '大吉';
  }
  // 雙星到向
  else if (xiangWang === fs.facing) {
    pattern = '雙星到向';
    quality = '旺財';
  }
  // 雙星到坐
  else if (shanWang === fs.sitting) {
    pattern = '雙星到坐';
    quality = '旺丁';
  }
  // 上山下水
  else {
    pattern = '上山下水';
    quality = '凶';
  }
  
  // 五黃位置
  const wuhuang = Object.entries(yunPan).find(([dir, star]) => star === 5)?.[0];
  
  // 二黑位置
  const erhei = Object.entries(yunPan).find(([dir, star]) => star === 2)?.[0];
  
  return {
    pattern,
    quality,
    wangStar,
    shanWang,
    xiangWang,
    wuhuang,
    erhei,
    recommendation: getRecommendation(pattern, fs)
  };
}

function getRecommendation(pattern, fs) {
  const recs = {
    '旺山旺向': '最佳格局，坐山、向首都得旺氣。財丁皆旺。',
    '雙星到向': '財運佳，宜在向首（前方）見水（如道路、停車場）則大旺財。',
    '雙星到坐': '人丁旺，坐山（後方）宜有實山。財運稍弱。',
    '上山下水': '山向皆凶，宜通過室內布局化解。向首不宜見水，山位不宜空曠。'
  };
  return recs[pattern] || '需根據實際情況調整布局。';
}

// ===== 煞氣列表 =====
const SHAPES = [
  {
    id: 'road-impact',
    name: '路沖煞（弓箭煞）',
    description: '道路直沖大門，氣流快速沖入',
    severity: '重',
    directions: ['正沖', '斜衝'],
    solutions: ['泰山石敢當', '凸面鏡', '屏風', '種植闊葉植物']
  },
  {
    id: 'tianzhan',
    name: '天斬煞',
    description: '兩樓之間縫隙正對窗戶',
    severity: '重',
    solutions: ['懸掛銅葫蘆', '銅貔貅朝外', '種植大型盆栽']
  },
  {
    id: 'bidao',
    name: '壁刀煞',
    description: '鄰樓牆角切向本宅',
    severity: '中',
    solutions: ['凸面鏡', '懸掛八卦鏡']
  },
  {
    id: 'fan-gong',
    name: '反弓煞',
    description: '彎道弓背對宅，氣流分散',
    severity: '中',
    solutions: ['高牆遮擋', '種植高大的樹', '搬離']
  },
  {
    id: 'kai-kou',
    name: '開口煞',
    description: '停車場出入口正對住宅',
    severity: '中',
    solutions: ['屏風', '假山', '大型盆栽遮擋']
  },
  {
    id: 'ku-shu',
    name: '枯樹煞',
    description: '門前或窗前有枯死樹木',
    severity: '輕',
    solutions: ['移除枯樹', '種新樹覆蓋', '擺放塑膠樹遮擋']
  },
  {
    id: 'jian-jiao',
    name: '尖角煞',
    description: '鄰建築尖角沖射',
    severity: '中',
    solutions: ['凸面鏡', '化煞符', '懸掛山海鎮']
  },
  {
    id: 'chuan-tang',
    name: '穿堂風',
    description: '大門正對後門或窗，財氣直出不聚',
    severity: '重',
    solutions: ['設置玄關', '屏風', '書櫃遮擋']
  },
  {
    id: 'wc-toilet',
    name: '廁所沖財位',
    description: '財位（向星旺位）設廁所',
    severity: '中',
    solutions: ['保持廁所潔淨', '多通風', '減少使用頻率']
  },
  {
    id: 'heng-liang',
    name: '橫梁壓床',
    description: '橫梁正壓床頭或睡眠區',
    severity: '中',
    solutions: ['更換床位', '做假天花遮蓋', '用假花纏繞修飾']
  },
  {
    id: 'mirror-bed',
    name: '鏡對床',
    description: '鏡子正對睡床',
    severity: '輕',
    solutions: ['移開鏡子', '夜間用布遮蓋', '更換鏡子方向']
  }
];

// ===== 方位吉凶 =====
function getDirectionAnalysis(direction, mingGua = null) {
  const dirNum = parseDirection(direction);
  if (!dirNum) return null;
  
  const isEast4 = mingGua ? EAST_FOUR.includes(mingGua) : null;
  
  const result = {
    direction,
    gua: PALACE_DIRECTION[dirNum],
    star: null, // 待計算
    wuxing: getWuxingByGua(dirNum),
    nature: dirNum % 2 === 1 ? '陽' : '陰'
  };
  
  // 根據方向給出基本建議
  const advice = {
    '北': '宜靜不宜動，防水局。睡床靠牆為吉。',
    '南': '光線充足，利名聲。宜設書房或事業位。',
    '東': '利長子，利文昌。宜設書房或兒童房。',
    '西': '利少女，利財。宜設客廳或財位。',
    '東南': '利長女，利文昌財運。宜設書房或財位。',
    '東北': '利少男，利文才。宜設書房或客房。',
    '西南': '利母親，利人際。宜設客廳或長輩房。',
    '西北': '利父親，利貴人。宜設主人房或書房。'
  };
  
  result.advice = advice[direction] || '需根據整體格局判斷。';
  
  return result;
}

function getWuxingByGua(gua) {
  const map = { 1: '水', 2: '土', 3: '木', 4: '木', 5: '土', 6: '金', 7: '金', 8: '土', 9: '火' };
  return map[gua] || '未知';
}

// ===== 輸出格式化 =====
function formatFlyingStarsJSON(fs) {
  const analysis = analyzePattern(fs);
  
  return {
    meta: {
      facing: fs.facing,
      sitting: fs.sitting,
      yun: fs.yun + '運（' + (fs.yun === 9 ? '2024-2043' : fs.yun === 8 ? '2004-2023' : '其他') + '）',
      year: fs.year,
      shanReverse: fs.shanReverse ? '逆飛' : '順飛',
      xiangReverse: fs.xiangReverse ? '逆飛' : '順飛'
    },
    analysis,
    palace: {
      '中': {
        yun: fs.yunPan['中'],
        shan: fs.shanPan['中'],
        xiang: fs.xiangPan['中'],
        year: fs.yearPan['中']
      },
      '北（坎）': {
        yun: fs.yunPan['北'],
        shan: fs.shanPan['北'],
        xiang: fs.xiangPan['北'],
        year: fs.yearPan['北'],
        wuxing: '水'
      },
      '南（離）': {
        yun: fs.yunPan['南'],
        shan: fs.shanPan['南'],
        xiang: fs.xiangPan['南'],
        year: fs.yearPan['南'],
        wuxing: '火'
      },
      '東（震）': {
        yun: fs.yunPan['東'],
        shan: fs.shanPan['東'],
        xiang: fs.xiangPan['東'],
        year: fs.yearPan['東'],
        wuxing: '木'
      },
      '西（兌）': {
        yun: fs.yunPan['西'],
        shan: fs.shanPan['西'],
        xiang: fs.xiangPan['西'],
        year: fs.yearPan['西'],
        wuxing: '金'
      },
      '東南（巽）': {
        yun: fs.yunPan['東南'],
        shan: fs.shanPan['東南'],
        xiang: fs.xiangPan['東南'],
        year: fs.yearPan['東南'],
        wuxing: '木'
      },
      '東北（艮）': {
        yun: fs.yunPan['東北'],
        shan: fs.shanPan['東北'],
        xiang: fs.xiangPan['東北'],
        year: fs.yearPan['東北'],
        wuxing: '土'
      },
      '西南（坤）': {
        yun: fs.yunPan['西南'],
        shan: fs.shanPan['西南'],
        xiang: fs.xiangPan['西南'],
        year: fs.yearPan['西南'],
        wuxing: '土'
      },
      '西北（乾）': {
        yun: fs.yunPan['西北'],
        shan: fs.shanPan['西北'],
        xiang: fs.xiangPan['西北'],
        year: fs.yearPan['西北'],
        wuxing: '金'
      }
    }
  };
}

function formatBaziMingGua(mingGua, gender, birthYear) {
  const guaName = getMingGuaName(mingGua);
  const isE4 = isEastFourHouse(mingGua);
  const youNian = YOU_NIAN[guaName];
  
  return {
    gender,
    birthYear,
    mingGua,
    guaName,
    category: isE4 ? '東四命' : '西四命',
    compatible: isE4 ? '東四宅' : '西四宅',
    youNian: {
      '四吉位': {
        '生氣': youNian?.生氣 || '未知',
        '延年': youNian?.延年 || '未知',
        '天醫': youNian?.天醫 || '未知',
        '伏位': youNian?.伏位 || '未知'
      },
      '四凶位': {
        '絕命': youNian?.絕命 || '未知',
        '五鬼': youNian?.五鬼 || '未知',
        '六煞': youNian?.六煞 || '未知',
        '禍害': youNian?.禍害 || '未知'
      }
    },
    roomAdvice: {
      '生氣位': '旺財催旺，宜設書房、主臥、財位。宜放魚缸或水局。',
      '延年位': '旺婚姻感情，宜設夫妻臥室或催婚桃花。',
      '天醫位': '利健康，宜設老人房、病人靜養室。',
      '伏位位': '平穩，宜設儲物間、次臥。',
      '絕命位': '最凶，忌主臥、忌開大門，宜設廁所或儲物間。',
      '五鬼位': '主火災口舌，忌設廚房或電器集中區。',
      '六煞位': '主爛桃花，忌設主臥。',
      '禍害位': '主小人破財，忌設財位或書房。'
    }
  };
}

// ===== 模組導出 =====
module.exports = {
  // 飛星計算
  calculateFlyingStars,
  formatFlyingStarsJSON,
  analyzePattern,
  
  // 八宅命卦
  calculateMingGua,
  getMingGuaName,
  isEastFourHouse,
  isWestFourHouse,
  formatBaziMingGua,
  YOU_NIAN,
  
  // 煞氣
  SHAPES,
  
  // 方位分析
  getDirectionAnalysis,
  getWuxingByGua,
  
  // 工具
  parseDirection,
  getYunPeriod,
  getYearStar,
  PALACE_DIRECTION,
  EAST_FOUR,
  WEST_FOUR
};
