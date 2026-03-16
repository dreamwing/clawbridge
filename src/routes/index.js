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
router.use(require('./optimizations'));

module.exports = router;
