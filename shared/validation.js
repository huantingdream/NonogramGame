import { z } from 'zod';
import { gameMetrics } from './score.js';
export const configurations = {
  nonogram: [5,10,15], sudoku: [9], minesweeper: [81,256,480], '2048': [16],
  slitherlink: [105,107], hashi: [207,209], reaction: [305], aim: [330], watermelon: [450],
  netwalk: [505,507], akari: [607,610], nurikabe: [707,710], kenken: [804,806]
};
export const filterSchema = z.object({
  game: z.enum(Object.keys(configurations)), size: z.number().int(), difficulty: z.enum(['easy','normal','hard'])
}).strict().refine(v => configurations[v.game].includes(v.size), '游戏规格无效');
const metrics = { averageMs: z.number().int().optional(), hits: z.number().int().optional(), shots: z.number().int().optional(), points: z.number().int().optional() };
export const scoreSchema = z.object({
  game: z.enum(Object.keys(configurations)), size: z.number().int(), difficulty: z.enum(['easy','normal','hard']),
  elapsedSeconds: z.number().int().min(1).max(86400), puzzleId: z.number().int().min(0).max(9999),
  puzzleSeed: z.number().int().min(0).max(4294967295), ...metrics
}).strict().superRefine((s, ctx) => {
  const fail = message => ctx.addIssue({ code: 'custom', message });
  if (!configurations[s.game].includes(s.size)) fail('游戏规格无效');
  if (['2048','reaction','watermelon'].includes(s.game) && s.difficulty !== 'normal') fail('游戏难度无效');
  if (['slitherlink','hashi','netwalk','akari','nurikabe','kenken'].includes(s.game) && s.difficulty !== (s.size === configurations[s.game][0] ? 'easy' : 'normal')) fail('难度与规格不匹配');
  if (s.game === 'aim' && s.elapsedSeconds !== 30) fail('训练时间无效');
  try {
    const expected = gameMetrics(s);
    if (Object.keys(metrics).some(key => s[key] !== undefined && !(key in expected))) fail('不支持的成绩字段');
  } catch(error) { fail(error.message); }
});
const email = z.string().trim().toLowerCase().email().max(254);
export const loginSchema = z.object({ email, password: z.string().min(1).max(128), nickname: z.string().optional() }).strict();
export const registerSchema = z.object({ email, password: z.string().min(8).max(128), nickname: z.string().trim().min(1).max(20) }).strict();
