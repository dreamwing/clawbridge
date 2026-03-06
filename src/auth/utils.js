/**
 * Shared auth utilities.
 */
const crypto = require('crypto');

/**
 * Timing-safe key comparison to prevent timing attacks.
 * Handles unequal-length inputs by hashing both to fixed-length digests.
 */
function safeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
        // Hash both to constant-time compare even when lengths differ
        const hashA = crypto.createHash('sha256').update(bufA).digest();
        const hashB = crypto.createHash('sha256').update(bufB).digest();
        return crypto.timingSafeEqual(hashA, hashB);
    }
    return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { safeCompare };
