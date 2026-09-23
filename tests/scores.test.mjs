import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreOrder, scoreLabel, scoreDetail, gameMetrics } from '../dist/js/core/score.js';

test('rank by milliseconds for reaction, hits then fewer shots for aim, points for 2048, seconds for puzzles', () => {
  assert.deepEqual(scoreOrder('reaction'), [['averageMs','asc'],['createdAt','asc']]);
  assert.deepEqual(scoreOrder('aim'), [['hits','desc'],['shots','asc'],['createdAt','asc']]);
  assert.deepEqual(scoreOrder('2048'), [['points','desc'],['elapsedSeconds','asc'],['createdAt','asc']]);
  for (const game of ['nonogram','sudoku','minesweeper','slitherlink','hashi']) {
    assert.deepEqual(scoreOrder(game), [['elapsedSeconds','asc'],['createdAt','asc']]);
    assert.equal(scoreLabel({game,elapsedSeconds:65}), '01:05');
    assert.deepEqual(gameMetrics({game,averageMs:123}), {});
  }
  assert.equal(scoreLabel({game:'2048',points:1234}), '1234 分');
  assert.equal(scoreDetail({game:'2048',elapsedSeconds:65}), '用时 01:05');
  assert.equal(scoreLabel({game:'reaction',averageMs:237}), '237 ms');
  assert.equal(scoreLabel({game:'aim',hits:36}), '36 命中');
  assert.equal(scoreDetail({game:'aim',hits:36,shots:40}), '准确率 90%');
  assert.equal(scoreDetail({game:'aim',hits:0,shots:0}), '准确率 0%');
});
test('training payloads preserve integer metrics and reject corrupt data', () => {
  assert.deepEqual(gameMetrics({game:'reaction',averageMs:237}), {averageMs:237});
  assert.deepEqual(gameMetrics({game:'aim',hits:0,shots:0,averageMs:0}), {hits:0,shots:0,averageMs:0});
  assert.deepEqual(gameMetrics({game:'aim',hits:1,shots:2,averageMs:200}), {hits:1,shots:2,averageMs:200});
  assert.deepEqual(gameMetrics({game:'2048',points:0}), {points:0});
  assert.deepEqual(gameMetrics({game:'2048',points:123456}), {points:123456});
  for (const averageMs of [0,-1,2.5,'237',NaN,Infinity]) assert.throws(()=>gameMetrics({game:'reaction',averageMs}));
  for (const metrics of [{hits:3,shots:2,averageMs:100},{hits:1,shots:1,averageMs:0},{hits:0,shots:0,averageMs:1},{hits:1,shots:10001,averageMs:300},{hits:1,shots:1,averageMs:30001}]) assert.throws(()=>gameMetrics({game:'aim',...metrics}));
  for (const points of [-1,2.5,'100',NaN,Infinity,1000000001]) assert.throws(()=>gameMetrics({game:'2048',points}));
});
