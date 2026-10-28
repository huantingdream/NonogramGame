import { z } from 'zod';
import { gameMetrics } from './score.js';
export const configurations = {
  nonogram: [5,10,15], sudoku: [9], minesweeper: [81,256,480], '2048': [16], tetris: [200],
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
  if (['2048','reaction','watermelon','tetris'].includes(s.game) && s.difficulty !== 'normal') fail('游戏难度无效');
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

// Personal history includes failed/zero-second rounds and old browser records without puzzle seeds.
export const playSchema = z.object({
  id: z.string().uuid(), game: z.enum(Object.keys(configurations)), size: z.number().int(),
  difficulty: z.enum(['easy','normal','hard']), elapsedSeconds: z.number().int().min(0).max(86400),
  gameOver: z.boolean(), ts: z.number().int().min(946684800000).max(8640000000000000),
  averageMs: z.number().int().nullable().default(null), hits: z.number().int().nullable().default(null),
  shots: z.number().int().nullable().default(null), points: z.number().int().nullable().default(null)
}).strict().superRefine((play, ctx) => {
  const candidate = { game: play.game, size: play.size, difficulty: play.difficulty,
    elapsedSeconds: Math.max(1, play.elapsedSeconds), puzzleId: 0, puzzleSeed: 0 };
  for (const key of ['averageMs','hits','shots','points']) if (play[key] !== null) candidate[key] = play[key];
  if (!scoreSchema.safeParse(candidate).success) ctx.addIssue({code: 'custom', message: '战绩数据无效'});
  if (play.ts > Date.now() + 86400000) ctx.addIssue({code: 'custom', message: '战绩时间无效'});
});
export const playBatchSchema = z.object({
  accountId: z.string().min(1).max(128), plays: z.array(playSchema).min(1).max(20)
}).strict();
