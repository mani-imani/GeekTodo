// Draws the "pen stroke" through a task's text. Works on wrapped (multi-line) text:
// one stroke per line box, drawn one after another like a real pen.
import { settings } from './store.js';
import { reducedMotion } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const rand = (a, b) => a + Math.random() * (b - a);

function linePath(x0, x1, y, style) {
  // x0 → x1 is the drawing direction (may go right-to-left)
  if (style === 'straight') return `M${x0} ${y} L${x1} ${y}`;
  if (style === 'marker') return `M${x0} ${y} L${x1} ${y + rand(-1, 1)}`;
  // pen: slightly slanted, slightly wobbly, small overshoot
  const dir = Math.sign(x1 - x0) || 1;
  const w = Math.abs(x1 - x0);
  const sx = x0 - dir * rand(2, 6), ex = x1 + dir * rand(2, 8);
  const sy = y + rand(-1.2, 1.8), ey = y + rand(-2.5, 0.5);
  const c1x = sx + dir * w * rand(0.25, 0.4), c1y = y + rand(-2.2, 2.2);
  const c2x = sx + dir * w * rand(0.6, 0.8), c2y = y + rand(-2.2, 2.2);
  return `M${sx.toFixed(1)} ${sy.toFixed(1)} C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
}

/**
 * Create a strike controller for a text element.
 * @param {HTMLElement} textEl  element holding the task text
 * @param {HTMLElement} host    positioned ancestor the SVG is placed in
 * @param {'rtl'|'ltr'} direction  which way the pen travels on screen
 */
export function createStrike(textEl, host, direction = 'rtl') {
  const style = settings().strike;
  const hostRect = host.getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(textEl);
  // merge client rects into visual lines
  const lines = [];
  for (const r of range.getClientRects()) {
    if (r.width < 1) continue;
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.top - r.top) < r.height / 2) {
      last.left = Math.min(last.left, r.left); last.right = Math.max(last.right, r.right);
    } else lines.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height });
  }
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', `strike strike-${style}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', hostRect.width);
  svg.setAttribute('height', hostRect.height);
  host.append(svg);

  const paths = [];
  let total = 0;
  for (const ln of lines) {
    const y = (ln.top + ln.bottom) / 2 - hostRect.top + (style === 'marker' ? 0 : ln.height * 0.04);
    const l = ln.left - hostRect.left, r = ln.right - hostRect.left;
    const [x0, x1] = direction === 'rtl' ? [r, l] : [l, r];
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', linePath(x0, x1, y, style));
    if (style === 'marker') p.style.strokeWidth = Math.max(8, ln.height * 0.62) + 'px';
    svg.append(p);
    const len = p.getTotalLength();
    p.style.strokeDasharray = `${len} ${len}`;
    p.style.strokeDashoffset = len;
    paths.push({ p, len, start: total });
    total += len;
  }

  let progress = 0;
  function set(v) {
    progress = Math.max(0, Math.min(1, v));
    const drawn = progress * total;
    for (const { p, len, start } of paths) {
      const local = Math.max(0, Math.min(len, drawn - start));
      p.style.strokeDashoffset = len - local;
    }
    host.style.setProperty('--strike', progress.toFixed(3));
  }
  function animateTo(target, ms) {
    return new Promise((resolve) => {
      if (reducedMotion() || ms <= 0) { set(target); resolve(); return; }
      const from = progress, t0 = performance.now();
      const ease = (t) => (target > from ? 1 - Math.pow(1 - t, 2.2) : t * t);
      const step = (t) => {
        const k = Math.min(1, (t - t0) / ms);
        set(from + (target - from) * ease(k));
        if (k < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
  }
  return {
    set, animateTo,
    get progress() { return progress; },
    /** recommended duration for a full stroke — longer text takes a bit longer */
    duration: Math.min(620, 260 + total * 0.9),
    remove() { svg.remove(); host.style.removeProperty('--strike'); },
  };
}
