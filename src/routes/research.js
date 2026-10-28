/**
 * Research Tool API — 論文搜尋路由
 */
const router = require('express').Router();

function setCORS(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

router.options('/', (req, res) => { setCORS(res); res.sendStatus(204); });

// GET /api/research/search?q=xxx — 搜尋論文
router.get('/search', async (req, res) => {
    setCORS(res);
    const { q, limit = 15, offset = 0 } = req.query;
    
    if (!q || q.trim().length < 2) {
        return res.status(400).json({ error: '搜尋關鍵字至少 2 個字' });
    }
    
    try {
        // Semantic Scholar API
        const apiUrl = `https://api.semanticscholar.org/graph/v1/paper/search?` +
            `query=${encodeURIComponent(q)}` +
            `&limit=${limit}` +
            `&offset=${offset}` +
            `&fields=title,authors,year,abstract,citationCount,venue,openAccessPdf,url`;
        
        const response = await fetch(apiUrl, {
            headers: { 'Accept': 'application/json' }
        });
        
        if (!response.ok) {
            throw new Error(`Semantic Scholar API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // 格式化結果
        const papers = (data.data || []).map(p => ({
            id: p.paperId,
            title: p.title,
            authors: (p.authors || []).slice(0, 5).map(a => a.name).join(', '),
            year: p.year,
            abstract: p.abstract ? p.abstract.substring(0, 500) + (p.abstract.length > 500 ? '...' : '') : null,
            citations: p.citationCount || 0,
            venue: p.venue || 'Unknown',
            url: p.url || `https://www.semanticscholar.org/paper/${p.paperId}`,
            pdfUrl: p.openAccessPdf ? p.openAccessPdf.url : null
        }));
        
        res.json({
            papers,
            total: data.total || 0,
            offset: parseInt(offset),
            limit: parseInt(limit)
        });
        
    } catch (e) {
        console.error('Search error:', e);
        res.status(500).json({ error: '搜尋失敗：' + e.message });
    }
});

// GET /api/research/paper/:id — 取得單篇論文詳情
router.get('/paper/:id', async (req, res) => {
    setCORS(res);
    const { id } = req.params;
    
    try {
        const apiUrl = `https://api.semanticscholar.org/graph/v1/paper/${id}?` +
            `fields=title,authors,year,abstract,citationCount,venue,openAccessPdf,url,references.title,references.authors,references.year`;
        
        const response = await fetch(apiUrl, {
            headers: { 'Accept': 'application/json' }
        });
        
        if (!response.ok) {
            throw new Error(`Semantic Scholar API error: ${response.status}`);
        }
        
        const p = await response.json();
        
        res.json({
            id: p.paperId,
            title: p.title,
            authors: (p.authors || []).map(a => a.name).join(', '),
            year: p.year,
            abstract: p.abstract,
            citations: p.citationCount || 0,
            venue: p.venue || 'Unknown',
            url: p.url,
            pdfUrl: p.openAccessPdf ? p.openAccessPdf.url : null,
            references: (p.references || []).slice(0, 10).map(r => ({
                title: r.paperId,
                title: r.title,
                authors: (r.authors || []).slice(0, 3).map(a => a.name).join(', '),
                year: r.year
            }))
        });
        
    } catch (e) {
        console.error('Paper detail error:', e);
        res.status(500).json({ error: '取得論文失敗：' + e.message });
    }
});

module.exports = router;
