import test from 'node:test';
import assert from 'node:assert/strict';
import { inputTime } from '../dist/js/core/input-time.js';

test('input time excludes handler queue delay and retains submillisecond precision', () => {
  assert.equal(inputTime({ timeStamp: 1200.25 }, 1500, 1700000000000), 1200.25);
});

test('legacy epoch event timestamps are normalized to the monotonic time origin', () => {
  assert.equal(inputTime({ timeStamp: 1700000001200.25 }, 1500, 1700000000000), 1200.25);
});

test('invalid or incompatible timestamps are rejected, not replaced by handler time', () => {
  for (const timeStamp of [undefined, NaN, Infinity, 0, -1, '1200', 1600, 1700000001600]) {
    assert.equal(inputTime({ timeStamp }, 1500, 1700000000000), null);
  }
  assert.equal(inputTime({ timeStamp: 1500.5 }, 1500, 1700000000000), 1500.5);
});
