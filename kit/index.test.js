import test from 'node:test';
import assert from 'node:assert/strict';
import * as kit from './index.js';

test('the kit entry point loads', () => {
  assert.equal(typeof kit.VERSION, 'string');
});
