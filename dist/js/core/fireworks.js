// Celebration effects never own game state. Fired by showVictory(), silenced by closeVictory().
import { motionEnabled } from './motion.js';

const PALETTE = ['#ffd166', '#ef476f', '#06d6a0', '#4ea8ff', '#b388ff', '#ff9f6e', '#f8f7ff'];
const LAUNCHES = 7;        // rockets fired per celebration
const LAUNCH_GAP = 340;    // ms between launches
const CONFETTI = 90;       // falling confetti pieces

let canvas = null;
let context = null;
let raf = 0;
let running = false;
let rockets = [];
let sparks = [];
let confetti = [];
let launchTimer = 0;
let launchesLeft = 0;

function sizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function pickColor() { return PALETTE[(Math.random() * PALETTE.length) | 0]; }

function launchRocket() {
  rockets.push({
    x: window.innerWidth * (0.15 + Math.random() * 0.7),
    y: window.innerHeight + 10,
    vx: (Math.random() - 0.5) * 1.2,
    vy: -(8.5 + Math.random() * 3.5),
    targetY: window.innerHeight * (0.18 + Math.random() * 0.3),
    color: pickColor()
  });
}

function explode(rocket) {
  const count = 60 + (Math.random() * 30 | 0);
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.12;
    const speed = 1.2 + Math.random() * 3.8;
    sparks.push({
      x: rocket.x, y: rocket.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.011 + Math.random() * 0.01,
      color: Math.random() < 0.25 ? pickColor() : rocket.color
    });
  }
}

function dropConfetti() {
  for (let i = 0; i < CONFETTI; i++) {
    confetti.push({
      x: Math.random() * window.innerWidth,
      y: -20 - Math.random() * window.innerHeight * 0.4,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      vy: 1.6 + Math.random() * 2.2,
      vx: (Math.random() - 0.5) * 1.4,
      spin: Math.random() * Math.PI * 2,
      spinSpeed: (Math.random() - 0.5) * 0.22,
      color: pickColor(),
      life: 1,
      decay: 0.0035 + Math.random() * 0.003
    });
  }
}

function frame() {
  if (!running) return;
  context.clearRect(0, 0, window.innerWidth, window.innerHeight);

  // Rockets: rising streaks that burst near their target height.
  rockets = rockets.filter(rocket => {
    rocket.x += rocket.vx; rocket.y += rocket.vy; rocket.vy += 0.09;
    context.globalAlpha = 0.9;
    context.strokeStyle = rocket.color;
    context.lineWidth = 2.4;
    context.beginPath();
    context.moveTo(rocket.x, rocket.y);
    context.lineTo(rocket.x - rocket.vx * 3, rocket.y - rocket.vy * 3);
    context.stroke();
    if (rocket.vy >= -1 || rocket.y <= rocket.targetY) { explode(rocket); return false; }
    return true;
  });

  // Sparks: gravity-pulled fading dots.
  sparks = sparks.filter(spark => {
    spark.x += spark.vx; spark.y += spark.vy;
    spark.vx *= 0.985; spark.vy = spark.vy * 0.985 + 0.05;
    spark.life -= spark.decay;
    if (spark.life <= 0) return false;
    context.globalAlpha = spark.life;
    context.fillStyle = spark.color;
    context.beginPath();
    context.arc(spark.x, spark.y, 1.8 + spark.life * 1.4, 0, Math.PI * 2);
    context.fill();
    return true;
  });

  // Confetti: slowly tumbling rectangles.
  confetti = confetti.filter(piece => {
    piece.x += piece.vx + Math.sin(piece.spin * 2) * 0.5;
    piece.y += piece.vy;
    piece.spin += piece.spinSpeed;
    piece.life -= piece.decay;
    if (piece.life <= 0 || piece.y > window.innerHeight + 20) return false;
    context.globalAlpha = Math.min(1, piece.life * 1.6);
    context.save();
    context.translate(piece.x, piece.y);
    context.rotate(piece.spin);
    context.fillStyle = piece.color;
    context.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h * Math.abs(Math.cos(piece.spin * 1.7)) + 1);
    context.restore();
    return true;
  });

  context.globalAlpha = 1;

  if (launchesLeft > 0 && performance.now() >= launchTimer) {
    launchRocket();
    launchesLeft--;
    launchTimer = performance.now() + LAUNCH_GAP;
  }

  if (rockets.length || sparks.length || confetti.length || launchesLeft > 0) {
    raf = requestAnimationFrame(frame);
  } else {
    stopFireworks();
  }
}

export function celebrate() {
  if (!motionEnabled()) return;
  stopFireworks();
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:60;';
    document.body.append(canvas);
    context = canvas.getContext('2d');
  }
  sizeCanvas();
  running = true;
  launchesLeft = LAUNCHES;
  launchTimer = 0;
  dropConfetti();
  window.addEventListener('resize', sizeCanvas);
  raf = requestAnimationFrame(frame);
}

export function stopFireworks() {
  running = false;
  launchesLeft = 0;
  rockets = []; sparks = []; confetti = [];
  cancelAnimationFrame(raf); raf = 0;
  window.removeEventListener('resize', sizeCanvas);
  if (canvas && context) context.clearRect(0, 0, window.innerWidth, window.innerHeight);
}
