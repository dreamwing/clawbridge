/**
 * Route barrel — mounts all API routers.
 */
const router = require('express').Router();

router.use(require('./status'));
router.use(require('./logs'));
router.use(require('./tokens'));
router.use(require('./memory'));
router.use(require('./cron'));
router.use(require('./process'));
router.use(require('./config'));
router.use(require('./diagnostics'));
router.use(require('./optimize'));
router.use(require('./athena'));
router.use(require('./optimizations'));
router.use('/yoga', require('./yoga'));
router.use('/api/badminton', require('./badminton'));
router.use('/api/assessment', require('./assessment'));
router.use('/api/practice', require('./practice'));
router.use('/api/admin', require('./admin'));
router.use('/api/research', require('./research'));
router.use('/api/growth', require('./growth'));
router.use('/api/vault', require('./vault'));
router.use('/api/courts', require('./courts'));
router.use('/api/tarot', require('./tarot'));
router.use('/api/fengshui', require('./fengshui'));
module.exports = router;
