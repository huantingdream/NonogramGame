import test from 'node:test';
import assert from 'node:assert/strict';
import { move2048, canMove2048, generateLoop, checkLoop, loopEdges, generateBridges, checkBridges, crosses } from '../dist/js/games/puzzle-logic.js';
import { makeSeededRandom } from '../dist/js/core/utils.js';
const row = values => [...values, ...Array(12).fill(0)];
test('2048: each tile merges once; move is pure and scores correctly', () => {
  const board = row([2,2,2,2]);
  assert.deepEqual(move2048(board,'left'),{board:row([4,4,0,0]),score:8,changed:true});
  assert.deepEqual(board,row([2,2,2,2]));
  assert.deepEqual(move2048(row([2,2,4,0]),'left').board,row([4,4,0,0]));
  assert.deepEqual(move2048(row([4,4,8,8]),'right').board,row([0,0,8,16]));
  assert.equal(move2048(row([2,0,0,0]),'left').changed,false);
});
test('2048: vertical moves and loss detection', () => {
  const board = [2,0,0,0,2,0,0,0,4,0,0,0,4,0,0,0];
  assert.deepEqual(move2048(board,'up').board,[4,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0]);
  assert.deepEqual(move2048(board,'down').board,[0,0,0,0,0,0,0,0,4,0,0,0,8,0,0,0]);
  assert.equal(canMove2048([2,4,2,4,4,2,4,2,2,4,2,4,4,2,4,2]),false);
  assert.equal(canMove2048([2,4,2,4,4,2,4,2,2,4,2,4,4,2,4,4]),true);
});
test('generated loop and bridge puzzles have valid reproducible solutions across 200 seeds per size', () => {
  for (const [generate,check,sizes] of [[generateLoop,checkLoop,[5,7]],[generateBridges,checkBridges,[7,9]]]) {
    for (const n of sizes) for (let seed=1;seed<=200;seed++) {
      const puzzle=generate(n,makeSeededRandom(seed));
      assert.equal(check(puzzle,puzzle.solution),true,`size ${n} seed ${seed}`);
      assert.equal(check(puzzle,puzzle.solution.map(()=>0)),false);
      assert.deepEqual(puzzle,generate(n,makeSeededRandom(seed)));
      const broken=puzzle.solution.slice();broken[broken.findIndex(v=>v>0)]=0;
      assert.equal(check(puzzle,broken),false);
    }
  }
});
test('loop rejects disjoint loops even when all clues match',()=>{
  const edges=loopEdges(3);
  const values=edges.map(e=>Number(e.cells.includes(0)||e.cells.includes(8)));
  const clues=Array.from({length:9},(_,i)=>edges.reduce((s,e,k)=>s+(e.cells.includes(i)?values[k]:0),0));
  assert.equal(checkLoop({edges,clues},values),false);
});
test('bridges reject disconnected satisfied islands, crossings, and more than two bridges',()=>{
  const islands=[{x:0,y:0,clue:1},{x:2,y:0,clue:1},{x:0,y:2,clue:1},{x:2,y:2,clue:1}];
  assert.equal(checkBridges({islands,edges:[{a:0,b:1},{a:2,b:3}]},[1,1]),false);
  assert.equal(crosses({a:0,b:1},{a:2,b:3},[{x:0,y:1},{x:2,y:1},{x:1,y:0},{x:1,y:2}]),true);
  assert.equal(checkBridges({islands:islands.slice(0,2),edges:[{a:0,b:1}]},[3]),false);
});

test('2048 animation tracks preserve every tile and point to the computed destinations', async () => {
  const { trace2048 } = await import('../dist/js/games/puzzle-logic.js');
  const input = [2,2,2,2,4,0,4,8,0,2,0,2,8,8,16,0];
  for (const direction of ['left','right','up','down']) {
    const result = trace2048(input,direction);
    assert.deepEqual(result.movements.map(m=>m.from).sort((a,b)=>a-b),input.map((v,i)=>v?i:-1).filter(i=>i>=0));
    const destinationTotals=Array(16).fill(0);
    result.movements.forEach(m=>{assert.equal(m.value,input[m.from]);destinationTotals[m.to]+=m.value;});
    assert.deepEqual(destinationTotals,result.board);
    assert.equal(result.merges.reduce((sum,i)=>sum+result.board[i],0),result.score);
  }
});
