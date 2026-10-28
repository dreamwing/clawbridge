/**
 * Auth middleware — 驗證已刻意停用
 *
 * 決策：老闆於 2026-09 確認「無認證是刻意的」，故所有請求直接放行。
 * 保留 middleware 介面（export 一個 function），以維持 app.js 的 app.use(authMiddleware) 呼叫可用。
 * 若日後要重新啟用驗證，請還原 Git 版本：git show HEAD~1:src/auth/middleware.js
 */
function authMiddleware(req, res, next) {
    return next();
}

module.exports = authMiddleware;
