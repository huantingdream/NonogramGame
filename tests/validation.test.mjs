import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreSchema, configurations } from '../shared/validation.js';
const base={game:'nonogram',size:5,difficulty:'easy',elapsedSeconds:30,puzzleId:4,puzzleSeed:4};
test('server score schema rejects forged identity, malformed metrics and invalid combinations',()=>{
 for(const value of [{...base,uid:'other'},{...base,nickname:'forged'},{...base,elapsedSeconds:0},{...base,elapsedSeconds:2.5},{...base,size:305},{...base,puzzleSeed:-1},{...base,points:3},{...base,game:'aim',size:330,hits:2,shots:1,averageMs:2}]) assert.equal(scoreSchema.safeParse(value).success,false);
 for(const [game,sizes] of Object.entries(configurations)) for(const size of sizes) {
  const s={...base,game,size,difficulty:['nonogram','sudoku','minesweeper'].includes(game)?'easy':sizes.length===2&&size===sizes[0]?'easy':'normal'};
  if(game==='reaction')s.averageMs=220;
  if(game==='aim')Object.assign(s,{hits:2,shots:3,averageMs:400});
  if(['2048','watermelon'].includes(game))s.points=100;
  assert.equal(scoreSchema.safeParse(s).success,true,JSON.stringify(s));
 }
});
