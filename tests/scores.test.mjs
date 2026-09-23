import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreOrder, scoreLabel, scoreDetail, trainingMetrics } from '../dist/js/core/score.js';

test('rank by milliseconds for reaction, hits then fewer shots for aim, seconds for puzzles', () => {
  assert.deepEqual(scoreOrder('reaction'), [['averageMs','asc'],['createdAt','asc']]);
  assert.deepEqual(scoreOrder('aim'), [['hits','desc'],['shots','asc'],['createdAt','asc']]);
  for (const game of ['nonogram','sudoku','minesweeper','2048','slitherlink','hashi']) {
    assert.deepEqual(scoreOrder(game), [['elapsedSeconds','asc'],['createdAt','asc']]);
    assert.equal(scoreLabel({game,elapsedSeconds:65}), '01:05');
    assert.deepEqual(trainingMetrics({game,averageMs:123}), {});
  }
  assert.equal(scoreLabel({game:'reaction',averageMs:237}), '237 ms');
  assert.equal(scoreLabel({game:'aim',hits:36}), '36 命中');
  assert.equal(scoreDetail({game:'aim',hits:36,shots:40}), '准确率 90%');
  assert.equal(scoreDetail({game:'aim',hits:0,shots:0}), '准确率 0%');
});
test('training payloads preserve integer metrics and reject corrupt data', () => {
  assert.deepEqual(trainingMetrics({game:'reaction',averageMs:237}), {averageMs:237});
  assert.deepEqual(trainingMetrics({game:'aim',hits:0,shots:0,averageMs:0}), {hits:0,shots:0,averageMs:0});
  assert.deepEqual(trainingMetrics({game:'aim',hits:1,shots:2,averageMs:200}), {hits:1,shots:2,averageMs:200});
  for (const averageMs of [0,-1,2.5,'237',NaN,Infinity]) assert.throws(()=>trainingMetrics({game:'reaction',averageMs}));
  for (const metrics of [{hits:3,shots:2,averageMs:100},{hits:1,shots:1,averageMs:0},{hits:0,shots:0,averageMs:1},{hits:1,shots:10001,averageMs:300},{hits:1,shots:1,averageMs:30001}]) assert.throws(()=>trainingMetrics({game:'aim',...metrics}));
});
