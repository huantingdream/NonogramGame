// 生成 public/guide/ 下的静态攻略页（SEO 内容页）。运行：node scripts/build-guides.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'guide');
mkdirSync(root, { recursive: true });

const GAMES = [
  {
    id: 'tetris', name: '俄罗斯方块', en: 'Tetris', icon: '▟',
    intro: '在 10 × 20 的棋盘中移动、旋转下落的方块，填满整行即可消除。用更少的空洞，争取更高的分数。',
    rules: [
      '点击开始游戏。← → / A D 移动，↑ / W / X 顺时针旋转，Z 逆时针旋转；↓ / S 加速下落，空格直接落到底。手机使用操作按钮，长按方向按钮可连续移动。',
      'C / Shift 暂存方块，每次落定前限用一次。虚线显示落点，右侧显示接下来的三块；每组七块包含全部七种形状。',
      '同时消除 1 / 2 / 3 / 4 行获得 100 / 300 / 500 / 800 × 当前等级的分数。每消除 10 行升一级，下落加快。手动下落每格 1 分，直接落下每格 2 分。',
      'P / Esc 暂停；切换窗口、进入后台或打开弹窗自动暂停，点击继续恢复。新方块无法入场时本局结束，可上传高分榜。'
    ],
    tips: [
      '优先把堆叠表面铺平，避免封住下方空洞。',
      '留出一列竖井，等长条方块一次消除四行。',
      '结合落点虚线和接下来三块的预览，提前安排位置。',
      '不合适的方块先暂存，但记得每块落定前只能暂存一次。',
      '速度变快时先保证消行和生存，不必每次都追求四行。'
    ]
  },
  {
    id: 'nonogram', name: '数织', en: 'Nonogram', icon: '▦',
    intro: '数织（Nonogram，又名数织方块、绘图方块）是一种图形逻辑谜题：根据每行每列的数字线索填涂格子，最终还原出一幅隐藏的像素图案。',
    rules: [
      '每行 / 每列左侧和上方的数字，表示该行（列）中连续填色格的长度。',
      '一组数字对应一段连续色块；多组数字之间至少间隔一个空格。',
      '推理出所有应填的格子并涂色，即可完成题目并看到隐藏图案。'
    ],
    tips: [
      '先找「必满行」：如果一行长度 10，数字是 7，那么中间至少有 4 格必然被填——把数字从两端各推一次，重叠部分就是确定的。',
      '0 或空行意味着整行都是空格，先用 × 标掉，能立刻收窄推理范围。',
      '已填色块的两端若是边界或空格，就能延长或封闭色块，常与「必满行」技巧连锁出大片确定格。',
      '完成一段色块后，立刻在对应数字上做排除标记，避免重复检查。',
      '卡壳时换到垂直方向：行推不动就推列，数织的进展往往在行列之间来回切换中产生。'
    ]
  },
  {
    id: 'sudoku', name: '数独', en: 'Sudoku', icon: '▦',
    intro: '数独是最经典的数字逻辑游戏：在 9×9 的棋盘中填入 1–9，让每行、每列、每个 3×3 宫都不重复。',
    rules: [
      '每行必须恰好包含 1–9 各一次。',
      '每列必须恰好包含 1–9 各一次。',
      '每个粗线 3×3 宫必须恰好包含 1–9 各一次。',
      '灰色为题目给定数字，不能修改。'
    ],
    tips: [
      '先扫「唯一候选」：某格所在的行、列、宫已经排除了 8 个数字时，剩下那个就是答案。',
      '再找「隐性唯一」：某个数字在一宫里只能放在一个位置，即使该格还有其他候选。',
      '从数字出现最多的入手：全盘里出现 6、7 次的数字，往往只差两三格就能填完。',
      '宫与行列交叉排除：某数字在一宫中只能出现在同一行，则该行其他宫可以排除它。',
      '保持耐心，不要猜：本站的数独题目都有唯一解，纯逻辑就能推到底。'
    ]
  },
  {
    id: 'minesweeper', name: '扫雷', en: 'Minesweeper', icon: '▦',
    intro: '扫雷：翻开所有安全格、避开全部地雷。数字告诉你周围 8 格里藏着几颗雷。本站题目经过免猜验证，只靠逻辑就能通关。',
    rules: [
      '翻开的数字表示周围 8 格中地雷的数量。',
      '翻开所有非雷格即获胜；点到雷立即失败。',
      '右键（或插旗模式）循环：插旗 → ? 标记 → 取消；「?」只是备忘，不影响胜负。',
      '第一次点击永远不会踩雷。'
    ],
    tips: [
      '数字等于周围未开格数时，那些格子全是雷，直接全部插旗。',
      '数字等于已插旗数时，周围其余格子都安全，可以一口气点开。',
      '1-2-1 和 1-2-2-1 是最常见的边线定式，记住它们能省下大量推理时间。',
      '减法思维：相邻两个数字的差，往往直接告诉你边缘格是雷还是安全。',
      '先清开阔区域再啃边角：大片展开的区域信息密度最高。'
    ]
  },
  {
    id: '2048', name: '2048', en: '2048', icon: '▣',
    intro: '2048：滑动棋盘让相同数字合并，一路加倍，直到合成 2048。规则一分钟上手，策略深不见底。',
    rules: [
      '每次滑动，所有方块朝该方向移动到底，相同数字相撞合并并加分。',
      '每次有效移动后随机出现一个新的 2 或 4。',
      '合成 2048 即通关；棋盘填满且无法合并时本局结束。'
    ],
    tips: [
      '把最大数字固定在一个角落（比如左下角），全程不要让它离开。',
      '尽量只用三个方向：选了「下」就别轻易按「上」，保持大数沉底。',
      '让数字按大小沿边排列成蛇形，合并机会自然出现。',
      '留出空格比眼前的一次合并更重要：棋盘越空，回旋余地越大。',
      '危急时优先合并出空间，而不是追求高分合并。'
    ]
  },
  {
    id: 'slitherlink', name: '数回', en: 'Slitherlink', icon: '▱',
    intro: '数回（Slitherlink）：在点阵上画线，最终连成唯一一条首尾相接、不分叉的环。数字是它的四条边中有几条属于环线。',
    rules: [
      '在相邻圆点之间画线，所有线段必须组成一个连续的闭环。',
      '数字 = 该格四条边中属于环线的数量。',
      '环不能分叉、不能相交，也不能同时存在多个小环。',
      '可以用 × 标记确定不画线的边。'
    ],
    tips: [
      '0 是最强线索：四条边全部排除，立刻把周围的 3 推向确定解。',
      '相邻的 3 和 3：它们之间的公共边必定画线，外侧两条平行边也必画。',
      '对角相邻的 3 和 0：0 四条边排除后，3 的三条边立即可定。',
      '任何顶点的线要么 0 条要么 2 条——岔出第三条线的地方一定是错的。',
      '记得「只有一个环」：提前把小环首尾相接是常见错误，收尾前先检查是否把整条环提前闭合了。'
    ]
  },
  {
    id: 'hashi', name: '数桥', en: 'Hashiwokakero', icon: '☷',
    intro: '数桥（Hashiwokakero，桥之谜）：在岛屿之间搭单桥或双桥，让每座岛的桥数恰好等于它的数字，且所有岛连成一体。',
    rules: [
      '桥只能水平或垂直连接同一行 / 列的两座相邻岛屿。',
      '每对岛之间最多两座桥，桥不能交叉、不能穿过其他岛。',
      '岛上的数字 = 与它相连的桥的总数（双桥计 2）。',
      '所有岛必须通过桥连成一个整体。'
    ],
    tips: [
      '8 必定四个方向都是双桥；7 必定四个方向都至少有一座桥。',
      '边上的 6 和角落的 4，原理相同：方向少，每个方向都得有桥。',
      '数字只剩一个方向可走时，那个方向至少要补足差额。',
      '每搭一座桥就重新检查相关岛屿的剩余需求，连锁反应很多。',
      '小心「孤岛陷阱」：满足数字还不够，如果提前把一群岛封闭成小圈子，最后无法连成一体。'
    ]
  },
  {
    id: 'watermelon', name: '合成大西瓜', en: 'Suika Game', icon: '▦',
    intro: '合成大西瓜：把水果丢进容器，同级水果相碰会合成更大的下一级，一路合成到大西瓜。水果堆越过警戒线即结束。',
    rules: [
      '移动瞄准线，点击或按空格丢下水果。',
      '两个相同水果碰撞后合成下一级水果并获得分数，共 11 级。',
      '两个大西瓜相撞会湮灭并奖励大量分数。',
      '水果持续堆过顶部警戒线，本局结束。'
    ],
    tips: [
      '同类水果尽量丢在同一侧，形成「合成流水线」，避免大水果被小水果隔开。',
      '大水果放两边、小水果往中间丢，利用滚动自然靠拢。',
      '别小看连锁：一次合成引发的位移常常带出一串后续合成。',
      '警戒线附近别堆高：宁可暂时不合成，也要先把高度压下来。',
      '西瓜之前的二级水果尽量少留两个以上，占位太大容易崩盘。'
    ]
  },
  {
    id: 'reaction', name: '反应测试', en: 'Reaction Test', icon: '▦',
    intro: '反应测试：等屏幕变绿的一刻立刻点击，测 5 次取平均。普通人的平均反应在 200–250 毫秒之间。',
    rules: [
      '屏幕变红后等待，变绿瞬间尽快点击。',
      '抢跑（还没变绿就点）需要重试该次。',
      '完成 5 次后取平均毫秒数作为成绩。'
    ],
    tips: [
      '手指预放在屏幕上、眼睛盯住颜色而不是数字，能减少视觉切换损耗。',
      '保持放松：紧绷的手臂反而更慢。',
      '睡眠不足会明显拖慢反应，状态好时再来刷榜。',
      '显示器刷新率和触控采样率都会影响成绩，同一设备上比较更公平。'
    ]
  },
  {
    id: 'aim', name: '瞄准训练', en: 'Aim Trainer', icon: '▦',
    intro: '瞄准训练：30 秒内尽可能多地点击出现的小球。球越小越难分，统计命中数、准确率与平均命中耗时。',
    rules: [
      '30 秒内点击随机出现的目标球。',
      '命中加分，点空也会计入射击次数并拉低准确率。',
      '大、中、小三种球独立排行，球越小越考验精度。'
    ],
    tips: [
      '先甩大方向再微调：把移动拆成「弹到附近 + 小幅修正」两段会更快。',
      '目光提前移到下一个可能出现球的区域，而不是追着球跑。',
      '宁可慢 50 毫秒也要命中：准确率在同命中数时决定排名。',
      '固定鼠标灵敏度并坚持练习，肌肉记忆比临场反应更可靠。'
    ]
  },
  {
    id: 'netwalk', name: '管道', en: 'Netwalk', icon: '╋',
    intro: '管道（Netwalk）：旋转格子里的管道，让所有管口两两对接、整张棋盘连成一张网。一次旋转一个 90°，连通即胜利。',
    rules: [
      '点击格子，管道顺时针旋转 90°。',
      '每个管口都必须与相邻格子的管口对接，不能有朝外或悬空的接口。',
      '所有格子连成一张连通的网即通关。'
    ],
    tips: [
      '从边缘和角落入手：边格不能有朝外的管口，形状立刻被锁定大半。',
      '直线管在边上只有两种合法朝向，转角管在角落只有一种。',
      '接通后从已确定的区域向外逐格推进，不要跳着想。',
      '末端（只有一个接口的格子）是锚点：它的接口必须指向唯一的邻格。',
      '最后检查「悬空接口」：所有管口都有伴，网自然就通了。'
    ]
  },
  {
    id: 'akari', name: '点灯', en: 'Akari', icon: '💡',
    intro: '点灯（Akari，又名照明）：在白色格放灯照亮整个棋盘。灯照亮同行同列直到黑格，灯与灯不能互相照亮。',
    rules: [
      '灯照亮所在的整行整列，光线被黑格阻挡。',
      '任意两盏灯不能互相照亮（之间必须有黑格）。',
      '数字黑格的上下左右，必须恰好有对应数量的灯。',
      '所有白色格都必须被照亮。'
    ],
    tips: [
      '数字 0 周围四格全部不能放灯，立刻用 · 标记排除。',
      '数字 4 周围四格全是灯；靠墙的数字 3、角落的数字 2 同理——方向不够时每个方向都得有灯。',
      '放了灯之后，顺手把同行同列被照亮的格子标记排除，避免误放。',
      '只剩一格能照亮某个白格时，那格必放灯——这是最主要的推进手段。',
      '数字周围的「最后一盏灯」放下去后，周围其余格子立即排除。'
    ]
  },
  {
    id: 'nurikabe', name: '数墙', en: 'Nurikabe', icon: '▩',
    intro: '数墙（Nurikabe）：把格子涂成连成一片的「海」，留下若干座「岛」。每座岛恰好包含一个数字，岛的大小就等于这个数字。',
    rules: [
      '点击格子在 未定 → 海 → 岛 之间切换；数字格固定属于岛。',
      '所有海格必须连成一片，不能分成几块。',
      '海的任何 2×2 区域不能全是海（不能出现「海块」）。',
      '每片岛必须恰好含一个数字，且岛的格数等于该数字；不同的岛不能相邻。'
    ],
    tips: [
      '数字 1 的岛立刻完成：它周围四格全部涂成海。',
      '相邻或对角的两个数字之间，隔着的格子必是海（岛不能相邻）。',
      '岛的大小不够时，必然要向唯一能扩展的方向生长——把暂时够不到的格子涂成海。',
      '海的连通性是利器：两个海域之间只剩一条窄缝时，缝里的格子必是海。',
      '时刻检查 2×2：任何即将形成的 2×2 海块，最后一格必是岛。'
    ]
  },
  {
    id: 'kenken', name: '聪明格', en: 'KenKen', icon: '⊞',
    intro: '聪明格（KenKen，又名算独）：像数独一样每行每列不重复，同时每个粗线笼里的数字还要满足左上角的算式。',
    rules: [
      'N×N 的棋盘填入 1–N，每行每列数字不重复。',
      '每个粗线笼左上角有算式：笼内数字经该运算得到目标数。',
      '算式为减法或除法时，笼内恰有两格，大数减小数（或除以小数）等于目标数。',
      '单个数字的笼子直接填入该数。'
    ],
    tips: [
      '先填单格笼和「差为 N−1 的减笼」（只能是 1 和 N）这类唯一组合。',
      '乘法笼先分解质因数：12× 在 4×4 里只能是 3×4，在 6×6 里可能是 2×6 或 3×4。',
      '行列和是固定值（1+…+N）：已知部分笼子之和时，剩余格的和可以直接算出来。',
      '同一笼里同行同列的格子数字也不能重复，可以先排除一批组合。',
      '候选数笔记法：把每格可能的数字列出来，行列约束和笼约束轮着排除。'
    ]
  }
];

const SITE = '格间小游戏';

function page({ id, name, en, icon, intro, rules, tips }) {
  const title = `${name}（${en}）怎么玩？规则与技巧 - ${SITE}`;
  const description = `${name}（${en}）规则详解与实用技巧：${intro}`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<meta name="description" content="${description}" />
<link rel="stylesheet" href="./guide.css" />
</head>
<body>
<header class="site-header">
  <a class="brand" href="../#${id}">← 返回 ${SITE}，直接玩${name}</a>
</header>
<main class="guide">
  <p class="kicker">${icon} ${en.toUpperCase()} GUIDE</p>
  <h1>${name}怎么玩？规则与技巧</h1>
  <p class="intro">${intro}</p>

  <h2>基本规则</h2>
  <ol>
    ${rules.map((rule) => `<li>${rule}</li>`).join('\n    ')}
  </ol>

  <h2>实用技巧</h2>
  <ol>
    ${tips.map((tip) => `<li>${tip}</li>`).join('\n    ')}
  </ol>

  <div class="cta">
    <a class="play-button" href="../#${id}">开始玩${name} →</a>
    <a class="more-link" href="./index.html">查看全部游戏攻略</a>
  </div>
</main>
<footer class="site-footer">© ${SITE} · 免费在线益智小游戏合集，无需下载，打开即玩</footer>
</body>
</html>
`;
}

const index = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>游戏攻略与技巧大全 - ${SITE}</title>
<meta name="description" content="${SITE}全部 13 款益智游戏的规则详解与解题技巧：数织、数独、扫雷、2048、数回、数桥、管道、点灯、数墙、聪明格、合成大西瓜、反应测试、瞄准训练。" />
<link rel="stylesheet" href="./guide.css" />
</head>
<body>
<header class="site-header">
  <a class="brand" href="../">← 返回 ${SITE}</a>
</header>
<main class="guide">
  <p class="kicker">GUIDES</p>
  <h1>游戏攻略与技巧大全</h1>
  <p class="intro">每款游戏都有规则详解和高手技巧。挑一款开始，或者直接回到游戏中边玩边学。</p>
  <div class="guide-grid">
    ${GAMES.map((game) => `<a class="guide-card" href="./${game.id}.html"><span class="guide-card-icon">${game.icon}</span><strong>${game.name}</strong><small>${game.en}</small><p>${game.intro}</p></a>`).join('\n    ')}
  </div>
</main>
<footer class="site-footer">© ${SITE} · 免费在线益智小游戏合集，无需下载，打开即玩</footer>
</body>
</html>
`;

const css = `/* 攻略页样式：独立于主站，轻量可读 */
:root {
  --ink: #101a3d; --muted: #69718c; --blue: #2547e4; --lime: #e2ff54;
  --paper: #f6f7fb; --white: #ffffff; --soft-line: #e6e9f2;
}
* { box-sizing: border-box; }
body {
  margin: 0; min-height: 100vh; color: var(--ink);
  background: radial-gradient(circle at 12% 16%, rgba(226,255,84,.4) 0, transparent 320px),
    radial-gradient(circle at 88% 80%, rgba(37,71,228,.14) 0, transparent 400px), var(--paper);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  -webkit-font-smoothing: antialiased; line-height: 1.75;
}
.site-header { max-width: 860px; margin: 0 auto; padding: 20px 24px 0; }
.brand { color: var(--blue); font-weight: 700; text-decoration: none; font-size: .95rem; }
.brand:hover { text-decoration: underline; }
.guide { max-width: 860px; margin: 0 auto; padding: 18px 24px 48px; }
.kicker { color: var(--blue); font-size: .78rem; font-weight: 800; letter-spacing: .18em; margin: 8px 0 4px; }
h1 { font-size: clamp(1.7rem, 4.5vw, 2.5rem); line-height: 1.25; margin: 0 0 14px; letter-spacing: -.01em; }
h2 { font-size: 1.25rem; margin: 30px 0 10px; padding-left: 12px; border-left: 4px solid var(--lime); }
.intro { color: var(--muted); font-size: 1.02rem; }
ol { padding-left: 1.4em; display: grid; gap: 10px; margin: 10px 0; }
li::marker { color: var(--blue); font-weight: 800; }
.cta { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 34px; }
.play-button {
  display: inline-block; padding: 12px 26px; border-radius: 12px;
  background: var(--lime); color: #101a3d; font-weight: 800; text-decoration: none;
  box-shadow: 0 8px 22px rgba(35,48,91,.16);
}
.play-button:hover { transform: translateY(-1px); }
.more-link { color: var(--blue); font-weight: 650; text-decoration: none; }
.more-link:hover { text-decoration: underline; }
.guide-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; margin-top: 22px; }
.guide-card {
  display: grid; gap: 4px; padding: 16px 18px; background: var(--white);
  border: 1px solid var(--soft-line); border-radius: 14px; color: inherit; text-decoration: none;
  transition: border-color .15s ease, transform .15s ease;
}
.guide-card:hover { border-color: var(--blue); transform: translateY(-2px); }
.guide-card-icon { font-size: 1.4rem; }
.guide-card small { color: var(--muted); letter-spacing: .08em; }
.guide-card p { margin: 6px 0 0; color: var(--muted); font-size: .85rem; line-height: 1.6; }
.site-footer { max-width: 860px; margin: 0 auto; padding: 0 24px 30px; color: var(--muted); font-size: .8rem; }
`;

writeFileSync(join(root, 'guide.css'), css);
writeFileSync(join(root, 'index.html'), index);
for (const game of GAMES) {
  writeFileSync(join(root, `${game.id}.html`), page(game));
}
console.log(`已生成 ${GAMES.length} 个攻略页 + 索引页到 public/guide/`);
