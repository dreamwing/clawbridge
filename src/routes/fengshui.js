/**
 * Feng Shui Route — 風水 REST API
 * 
 * GET  /api/fengshui/flying-stars?facing=南&sitting=北&year=2018
 * GET  /api/fengshui/ming-gua?gender=男&birthYear=1990
 * GET  /api/fengshui/bazi-ming-gua?gender=男&birthYear=1990
 * GET  /api/fengshui/shapes
 * GET  /api/fengshui/direction?dir=南&mingGua=6
 * GET  /api/fengshui/younian?gua=坎
 * GET  /api/fengshui/analysis?facing=南&sitting=北&year=2018&gender=男&birthYear=1990
 * GET  /api/fengshui/yun-period?year=2024
 */

const router = require('express').Router();
const path = require('path');
const fs = require('fs');

const {
  calculateFlyingStars,
  formatFlyingStarsJSON,
  analyzePattern,
  calculateMingGua,
  getMingGuaName,
  isEastFourHouse,
  formatBaziMingGua,
  SHAPES,
  getDirectionAnalysis,
  YOU_NIAN,
  parseDirection,
  getYunPeriod,
  getYearStar,
  PALACE_DIRECTION
} = require('../services/fengshui-calculator');

const COMPASS_IMAGE = '/mingli-master/fengshui/images/pan.png';

// ============ GET /flying-stars ============
// Query: facing=南&sitting=北&year=2018
router.get('/flying-stars', (req, res) => {
  const { facing, sitting, year } = req.query;

  if (!facing || !sitting) {
    return res.status(400).json({
      error: '缺少必要參數：facing（朝向）、sitting（坐山）',
      example: '/api/fengshui/flying-stars?facing=南&sitting=北&year=2018',
      directions: Object.keys(PALACE_DIRECTION).map(k => `${k}: ${PALACE_DIRECTION[k]}`)
    });
  }

  const y = parseInt(year) || new Date().getFullYear();
  const fsData = calculateFlyingStars(facing, sitting, y);
  const result = formatFlyingStarsJSON(fsData);

  res.json({
    ok: true,
    compass: COMPASS_IMAGE,
    ...result
  });
});

// ============ GET /ming-gua ============
// 命卦計算（簡易版）
router.get('/ming-gua', (req, res) => {
  const { gender, birthYear } = req.query;

  if (!gender || !birthYear) {
    return res.status(400).json({
      error: '缺少必要參數：gender（男/女）、birthYear（出生年）',
      example: '/api/fengshui/ming-gua?gender=男&birthYear=1990'
    });
  }

  if (!['男', '女'].includes(gender)) {
    return res.status(400).json({ error: '性別必須是 男 或 女' });
  }

  const year = parseInt(birthYear);
  if (isNaN(year) || year < 1900 || year > 2030) {
    return res.status(400).json({ error: '出生年格式錯誤' });
  }

  const mingGua = calculateMingGua(gender, year);
  const guaName = getMingGuaName(mingGua);
  const isEast4 = isEastFourHouse(mingGua);

  res.json({
    ok: true,
    gender,
    birthYear: year,
    mingGua,
    guaName,
    category: isEast4 ? '東四命' : '西四命',
    description: isEast4
      ? '東四命：宜住東四宅（坎、震、巽、離）'
      : '西四命：宜住西四宅（乾、坤、艮、兌）',
    compatible: isEast4 ? '東四宅' : '西四宅'
  });
});

// ============ GET /bazi-ming-gua ============
// 命卦計算（完整版，含游年方位）
router.get('/bazi-ming-gua', (req, res) => {
  const { gender, birthYear } = req.query;

  if (!gender || !birthYear) {
    return res.status(400).json({
      error: '缺少必要參數：gender、birthYear'
    });
  }

  const year = parseInt(birthYear);
  const mingGua = calculateMingGua(gender, year);
  const result = formatBaziMingGua(mingGua, gender, year);

  res.json({
    ok: true,
    ...result
  });
});

// ============ GET /younian ============
// 查詢特定卦的游年方位
router.get('/younian', (req, res) => {
  const { gua } = req.query;

  if (!gua) {
    return res.status(400).json({
      error: '缺少必要參數：gua（卦名）',
      examples: Object.keys(YOU_NIAN)
    });
  }

  const yn = YOU_NIAN[gua];
  if (!yn) {
    return res.status(404).json({
      error: `找不到卦名：${gua}`,
      available: Object.keys(YOU_NIAN)
    });
  }

  res.json({
    ok: true,
    gua,
    youNian: {
      '四吉位': {
        '生氣': yn.生氣,
        '延年': yn.延年,
        '天醫': yn.天醫,
        '伏位': yn.伏位
      },
      '四凶位': {
        '絕命': yn.絕命,
        '五鬼': yn.五鬼,
        '六煞': yn.六煞,
        '禍害': yn.禍害
      }
    }
  });
});

// ============ GET /shapes ============
// 煞氣列表
router.get('/shapes', (req, res) => {
  const { category } = req.query;

  let shapes = SHAPES;
  if (category === '內') {
    shapes = SHAPES.filter(s => ['chuan-tang', 'wc-toilet', 'heng-liang', 'mirror-bed'].includes(s.id));
  } else if (category === '外') {
    shapes = SHAPES.filter(s => !['chuan-tang', 'wc-toilet', 'heng-liang', 'mirror-bed'].includes(s.id));
  }

  res.json({
    ok: true,
    total: shapes.length,
    category: category || '全部',
    shapes
  });
});

// ============ GET /direction ============
// 方位分析
router.get('/direction', (req, res) => {
  const { dir, mingGua } = req.query;

  if (!dir) {
    return res.status(400).json({
      error: '缺少必要參數：dir（方位）',
      directions: Object.keys(PALACE_DIRECTION).map(k => `${k}: ${PALACE_DIRECTION[k]}`)
    });
  }

  const analysis = getDirectionAnalysis(dir, mingGua ? parseInt(mingGua) : null);

  if (!analysis) {
    return res.status(400).json({
      error: `無效方位：${dir}`,
      directions: Object.keys(PALACE_DIRECTION)
    });
  }

  res.json({
    ok: true,
    ...analysis
  });
});

// ============ GET /yun-period ============
// 查詢年份所在元運
router.get('/yun-period', (req, res) => {
  const { year } = req.query;

  if (!year) {
    return res.status(400).json({ error: '缺少必要參數：year' });
  }

  const y = parseInt(year);
  if (isNaN(y)) {
    return res.status(400).json({ error: '年份格式錯誤' });
  }

  const yun = getYunPeriod(y);
  const yearStar = getYearStar(y);

  const yunRanges = {
    1: { name: '一運', years: '1864-1883' },
    2: { name: '二運', years: '1884-1903' },
    3: { name: '三運', years: '1904-1923' },
    4: { name: '四運', years: '1924-1943' },
    5: { name: '五運', years: '1944-1963' },
    6: { name: '六運', years: '1964-1983' },
    7: { name: '七運', years: '1984-2003' },
    8: { name: '八運', years: '2004-2023' },
    9: { name: '九運', years: '2024-2043' }
  };

  res.json({
    ok: true,
    year: y,
    yun: yun,
    yunName: yunRanges[yun]?.name || '未知',
    yunYears: yunRanges[yun]?.years || '未知',
    yearStar,
    description: y === 2026
      ? '2026年（丙午）：五黃到中宮，全宅健康需注意'
      : y >= 2024
        ? `九運（當令）旺9（離火）、1（坎水）、8（艮土）`
        : yunRanges[yun]?.description || ''
  });
});

// ============ GET /analysis ============
// 綜合分析（飛星 + 命卦 + 格局）
router.get('/analysis', (req, res) => {
  const { facing, sitting, year, gender, birthYear } = req.query;

  if (!facing || !sitting) {
    return res.status(400).json({ error: '缺少必要參數：facing、sitting' });
  }

  const y = parseInt(year) || new Date().getFullYear();
  const fsData = calculateFlyingStars(facing, sitting, y);
  const flyingStars = formatFlyingStarsJSON(fsData);
  const analysis = analyzePattern(fsData);

  // 命卦分析（可選）
  let mingGuaInfo = null;
  if (gender && birthYear) {
    const mg = calculateMingGua(gender, parseInt(birthYear));
    mingGuaInfo = formatBaziMingGua(mg, gender, parseInt(birthYear));
  }

  res.json({
    ok: true,
    compass: COMPASS_IMAGE,
    flyingStars,
    analysis,
    mingGua: mingGuaInfo,
    disclaimer: '風水為輔，人為主。以上僅供參考，實際布局需結合具體情況。'
  });
});

// ============ GET /rooms ============
// 根據命卦給出房間布局建議
router.get('/rooms', (req, res) => {
  const { gender, birthYear, facing, sitting } = req.query;

  if (!gender || !birthYear) {
    return res.status(400).json({ error: '缺少必要參數：gender、birthYear' });
  }

  const year = parseInt(birthYear);
  const mingGua = calculateMingGua(gender, year);
  const guaName = getMingGuaName(mingGua);
  const isEast4 = isEastFourHouse(mingGua);
  const youNian = YOU_NIAN[guaName];

  const rooms = {
    masterBedroom: {
      recommend: youNian?.生氣 || youNian?.延年 || youNian?.天醫,
      avoid: youNian?.絕命,
      note: '主人房宜設於四吉位，避免四凶位'
    },
    study: {
      recommend: youNian?.天醫 || youNian?.生氣,
      avoid: youNian?.五鬼,
      note: '書房利文昌，設於天醫或生氣位'
    },
    wealth: {
      recommend: youNian?.生氣,
      avoid: youNian?.絕命,
      note: '財位宜設於生氣位，可放魚缸或風水輪'
    },
    kitchen: {
      recommend: youNian?.天醫,
      avoid: youNian?.五鬼,
      note: '廚房忌設於五鬼位，主火災'
    },
    toilet: {
      recommend: youNian?.絕命,
      avoid: '四吉位',
      note: '廁所宜設於絕命位，取其凶氣'
    }
  };

  res.json({
    ok: true,
    mingGua,
    guaName,
    category: isEast4 ? '東四命' : '西四命',
    youNian: {
      吉: { 生氣: youNian?.生氣, 延年: youNian?.延年, 天醫: youNian?.天醫, 伏位: youNian?.伏位 },
      凶: { 絕命: youNian?.絕命, 五鬼: youNian?.五鬼, 六煞: youNian?.六煞, 禍害: youNian?.禍害 }
    },
    rooms,
    facing,
    sitting
  });
});

// ============ GET /compass ============
// 羅盤圖
router.get('/compass', (req, res) => {
  res.json({
    ok: true,
    image: COMPASS_IMAGE,
    images: {
      pan: '/mingli-master/fengshui/images/pan.png',
      panMap: '/mingli-master/fengshui/images/pan-map.png',
      panMapYellow: '/mingli-master/fengshui/images/pan-map-yellow.png'
    },
    description: '羅盤圖用於確認房屋坐向，建議在陽光充足時以羅盤對準大門方向。'
  });
});

module.exports = router;
