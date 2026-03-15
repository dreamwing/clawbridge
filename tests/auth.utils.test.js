'use strict';

const crypto = require('crypto');
const { safeCompare } = require('../src/auth/utils');

describe('safeCompare', () => {
    test('returns true for equal strings', () => {
        expect(safeCompare('secret', 'secret')).toBe(true);
    });

    test('hashes both inputs before comparing', () => {
        const createHashSpy = jest.spyOn(crypto, 'createHash');

        expect(safeCompare('short', 'much-longer')).toBe(false);
        expect(createHashSpy).toHaveBeenCalledTimes(2);

        createHashSpy.mockRestore();
    });
});
