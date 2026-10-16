// Motor de partículas atmosféricas del portal (canvas 2D, sin dependencias).
//
// Una sola pieza consume TODOS los fondos: cada página monta un <canvas
// data-rd-particles="<variante>"> y aquí vive el contrato de variantes
// (nieve/ventisca del index, motas de clase en personaje, ascuas de banda,
// motas heráldicas de hermandad y esquirlas del 404).
//
// Reglas del motor:
// - requestAnimationFrame con dt real (la pausa por pestaña oculta no salta).
// - DPR-aware + resize con debounce; densidad escalada por ancho.
// - `prefers-reduced-motion: reduce` → ambiente atenuado (35% de velocidad,
//   mitad de densidad, sin ráfagas ni titileo), nunca congelado ni ausente.
// - Pausa en `visibilitychange` (nunca anima en background).
// - Personalización en vivo por el evento `rd:particles` (detalle
//   `{ palette?: string[] }`): las vistas de ficha emiten la paleta de clase
//   o de calidad de ítem al cambiar de pestaña.
// - Sin Browser APIs en SSR: este módulo solo se importa desde scripts de
//   cliente (evita F001).

export type ParticleVariant = 'snow' | 'arcane' | 'ember' | 'banner' | 'frost';

const VARIANTS: ParticleVariant[] = ['snow', 'arcane', 'ember', 'banner', 'frost'];

export function isParticleVariant(value: string | undefined | null): value is ParticleVariant {
  return !!value && (VARIANTS as string[]).includes(value);
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface Particle {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  alpha: number;
  baseAlpha: number;
  phase: number;
  twinkle: number;
  color: RGB;
  angle: number;
  spin: number;
  wind: number;
}

interface VariantConfig {
  // Cantidad base calculada a 1280px de ancho (se escala con el viewport).
  count: number;
  // Opacidad global de la capa (0..1).
  opacity: number;
  // Suben (true) o caen (false).
  rising: boolean;
  // Rango de velocidad vertical en px/s.
  speed: [number, number];
  // Rango de radio en px.
  size: [number, number];
  // Deriva lateral base en px/s.
  drift: number;
  // Viento global (ventisca) en px/s.
  wind: number;
  // Parpadeo por partícula (0 = fijo).
  twinkle: number;
  // Paleta por defecto; el evento rd:particles la puede reemplazar.
  palette: string[];
  // Modo de composición aditivo (ascuas/destellos brillan al superponerse).
  additive: boolean;
  shape: 'dot' | 'flake' | 'shard' | 'ember';
}

const VARIANT_CONFIG: Record<ParticleVariant, VariantConfig> = {
  // Ventisca del índice (Icecrown): copos que caen con ráfagas de viento.
  snow: {
    count: 150,
    opacity: 0.85,
    rising: false,
    speed: [26, 85],
    size: [0.7, 2.4],
    drift: 8,
    wind: 34,
    twinkle: 0.25,
    palette: ['#ffffff', '#e8f4ff', '#cfe6ff'],
    additive: false,
    shape: 'flake',
  },
  // Motas mágicas (ficha de personaje/perfil): deriva lenta con parpadeo.
  arcane: {
    count: 70,
    opacity: 0.7,
    rising: true,
    speed: [8, 26],
    size: [0.8, 2.6],
    drift: 14,
    wind: 0,
    twinkle: 0.8,
    palette: ['#69ccf0', '#a78bfa', '#f5b942'],
    additive: true,
    shape: 'dot',
  },
  // Ascuas de hoguera de raid (ficha de banda): suben rápido y titilan.
  ember: {
    count: 90,
    opacity: 0.8,
    rising: true,
    speed: [28, 90],
    size: [0.6, 2.2],
    drift: 10,
    wind: 6,
    twinkle: 1,
    palette: ['#ff8000', '#f5b942', '#ef4444'],
    additive: true,
    shape: 'ember',
  },
  // Motas heráldicas doradas (portal de hermandad): caen lento y destellan.
  banner: {
    count: 80,
    opacity: 0.65,
    rising: false,
    speed: [10, 30],
    size: [0.8, 2.4],
    drift: 6,
    wind: 8,
    twinkle: 1.2,
    palette: ['#f5b942', '#e6cc80', '#fff3c4'],
    additive: true,
    shape: 'dot',
  },
  // Esquirlas de hielo (404): caen girando suavemente.
  frost: {
    count: 80,
    opacity: 0.7,
    rising: false,
    speed: [20, 60],
    size: [0.9, 2.6],
    drift: 6,
    wind: 14,
    twinkle: 0.3,
    palette: ['#bfe9ff', '#e8f4ff', '#7dd3fc'],
    additive: false,
    shape: 'shard',
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string): RGB {
  const clean = hex.trim().replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = Number.parseInt(full, 16);
  if (!Number.isFinite(num) || full.length !== 6) return { r: 255, g: 255, b: 255 };
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgba(color: RGB, alpha: number): string {
  return `rgba(${color.r},${color.g},${color.b},${alpha})`;
}

function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// Escala de paleta: interpola entre los colores base para dar variedad sin
// multiplicar partículas (el tinte de clase/calidad llega como 1-3 colores).
function buildPalette(hexes: string[]): RGB[] {
  const base = (hexes.length > 0 ? hexes : ['#ffffff']).map(hexToRgb);
  if (base.length === 1) {
    const c = base[0];
    return [c, mixRgb(c, { r: 255, g: 255, b: 255 }, 0.45), mixRgb(c, { r: 0, g: 0, b: 0 }, 0.25)];
  }
  const out: RGB[] = [];
  for (let i = 0; i < base.length; i += 1) {
    out.push(base[i]);
    const next = base[(i + 1) % base.length];
    out.push(mixRgb(base[i], next, 0.5));
  }
  return out;
}

export function mountParticleField(canvas: HTMLCanvasElement): () => void {
  const maybeCtx = canvas.getContext('2d', { alpha: true });
  if (!maybeCtx) return () => undefined;
  // Tipo explícito: el narrowing no cruza a las funciones declaradas.
  const ctx: CanvasRenderingContext2D = maybeCtx;

  const rawVariant = canvas.dataset.variant;
  const variant: ParticleVariant = isParticleVariant(rawVariant) ? rawVariant : 'arcane';
  const config = VARIANT_CONFIG[variant];
  let palette = buildPalette(config.palette);
  let particles: Particle[] = [];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let rafId = 0;
  let running = false;
  let last = 0;
  let elapsed = 0;
  let disposed = false;
  let resizeTimer: number | undefined;

  const reducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // `prefers-reduced-motion` no apaga el ambiente: lo atenúa. El movimiento
  // amplio/brusco (ráfagas, parpadeo) es lo que la preferencia busca evitar,
  // así que con ella se reduce velocidad, densidad y se anulan ráfagas y
  // titileo; sin ella, el efecto completo (decisión 2026-10-16 tras detectar
  // entornos que reportan `reduce` por defecto — p. ej. previews embebidos).
  const motionScale = reducedMotion ? 0.35 : 1;
  const densityScale = reducedMotion ? 0.5 : 1;

  function density(): number {
    // Escala por ancho: viewports chicos reciben menos de la mitad.
    const wide = clamp(width / 1280, 0.4, 1.3);
    const mobile = width < 640 ? 0.55 : 1;
    return config.count * wide * mobile * densityScale;
  }

  function makeParticle(initial: boolean): Particle {
    const size = rand(config.size[0], config.size[1]);
    const speed = rand(config.speed[0], config.speed[1]);
    const baseAlpha = rand(0.35, 1);
    const spawnAbove = !config.rising;
    // initial reparte en todo el alto; si no, nace fuera del borde de entrada.
    const y = initial
      ? Math.random() * height
      : spawnAbove
        ? -10 - Math.random() * 40
        : height + 10 + Math.random() * 40;
    return {
      x: Math.random() * width,
      y,
      r: size,
      vx: 0,
      vy: config.rising ? -speed : speed,
      alpha: baseAlpha,
      baseAlpha,
      phase: Math.random() * Math.PI * 2,
      twinkle: config.twinkle * Math.random(),
      color: palette[Math.floor(Math.random() * palette.length)],
      angle: Math.random() * Math.PI * 2,
      spin: rand(-0.8, 0.8),
      wind: rand(0.5, 1.5),
    };
  }

  function populate(): void {
    const target = Math.max(12, Math.round(density()));
    particles = Array.from({ length: target }, () => makeParticle(true));
  }

  function resize(): void {
    width = canvas.clientWidth || window.innerWidth;
    height = canvas.clientHeight || window.innerHeight;
    dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    populate();
  }

  function wrapX(p: Particle): void {
    if (p.x < -20) p.x = width + 20;
    else if (p.x > width + 20) p.x = -20;
  }

  function drawDot(p: Particle): void {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = rgba(p.color, p.alpha * config.opacity);
    ctx.fill();
  }

  function drawEmber(p: Particle): void {
    const stretch = 1 + p.vx * 0.01;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(stretch, 1.6);
    ctx.beginPath();
    ctx.arc(0, 0, p.r, 0, Math.PI * 2);
    ctx.fillStyle = rgba(p.color, p.alpha * config.opacity);
    ctx.fill();
    ctx.restore();
  }

  function drawFlake(p: Particle): void {
    const a = p.alpha * config.opacity;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = rgba(p.color, a * 0.85);
    ctx.fill();
    // Brazos del copo: solo en los copos grandes (los chicos son puntos).
    if (p.r > 1.5) {
      const arm = p.r * 1.7;
      ctx.strokeStyle = rgba(p.color, a * 0.55);
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(p.x - arm, p.y);
      ctx.lineTo(p.x + arm, p.y);
      ctx.moveTo(p.x, p.y - arm);
      ctx.lineTo(p.x, p.y + arm);
      ctx.stroke();
    }
  }

  function drawShard(p: Particle): void {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.beginPath();
    ctx.moveTo(0, -p.r * 2.1);
    ctx.lineTo(p.r * 0.6, 0);
    ctx.lineTo(0, p.r * 2.1);
    ctx.lineTo(-p.r * 0.6, 0);
    ctx.closePath();
    ctx.fillStyle = rgba(p.color, p.alpha * config.opacity);
    ctx.fill();
    ctx.restore();
  }

  function draw(p: Particle): void {
    switch (config.shape) {
      case 'ember':
        drawEmber(p);
        break;
      case 'flake':
        drawFlake(p);
        break;
      case 'shard':
        drawShard(p);
        break;
      default:
        drawDot(p);
    }
  }

  // Ventisca: dos senos lentos + una ráfaga ocasional (exponente alto) que
  // empuja los copos en diagonal; es lo que da sensación de "blizzard".
  function gustFactor(t: number): number {
    const breeze = 0.45 + 0.55 * Math.sin(t * 0.32) * Math.sin(t * 0.11 + 1.7);
    const burst = Math.pow(Math.max(0, Math.sin(t * 0.09 - 1.2)), 5);
    return breeze + burst * 2.6;
  }

  function step(dt: number): void {
    const gust = config.wind > 0 && !reducedMotion ? gustFactor(elapsed) : 0;
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = config.additive ? 'lighter' : 'source-over';

    for (const p of particles) {
      p.x +=
        (p.vx + Math.sin(elapsed * 0.6 + p.phase) * config.drift + gust * config.wind * p.wind * 0.35) *
        dt *
        motionScale;
      p.y += p.vy * dt * motionScale;
      p.angle += p.spin * dt * motionScale;

      if (config.twinkle > 0 && !reducedMotion) {
        p.alpha = clamp(
          p.baseAlpha * (0.65 + 0.35 * Math.sin(elapsed * (1 + p.twinkle) + p.phase)),
          0,
          1,
        );
      }

      const out = config.rising ? p.y < -30 : p.y > height + 30;
      if (out) {
        const fresh = makeParticle(false);
        Object.assign(p, fresh);
      }
      wrapX(p);
      draw(p);
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  function frame(now: number): void {
    if (disposed || !running) return;
    const seconds = now / 1000;
    const dt = last === 0 ? 0 : clamp(seconds - last, 0, 0.05);
    last = seconds;
    elapsed += dt;
    step(dt);
    rafId = window.requestAnimationFrame(frame);
  }

  function start(): void {
    if (running || disposed) return;
    running = true;
    last = 0;
    rafId = window.requestAnimationFrame(frame);
  }

  function stop(): void {
    running = false;
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function onVisibility(): void {
    if (document.hidden) stop();
    else start();
  }

  function onResize(): void {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      resize();
    }, 150);
  }

  // Tinte en vivo: las vistas de ficha emiten su paleta (color de clase o de
  // calidad de ítem) al activar cada pestaña.
  function onPalette(event: Event): void {
    const detail = (event as CustomEvent<{ palette?: string[] }>).detail;
    const next = Array.isArray(detail?.palette)
      ? detail.palette.filter((c) => typeof c === 'string' && c.trim().length > 0)
      : [];
    if (next.length === 0) return;
    palette = buildPalette(next);
    particles.forEach((p, i) => {
      p.color = palette[i % palette.length];
    });
  }

  resize();
  start();
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('rd:particles', onPalette);

  return () => {
    disposed = true;
    stop();
    window.clearTimeout(resizeTimer);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('rd:particles', onPalette);
  };
}

// Monta todos los canvas marcados en el documento (una llamada por página).
export function autoMountParticleFields(root: ParentNode = document): () => void {
  const fields = Array.from(root.querySelectorAll<HTMLCanvasElement>('canvas[data-rd-particles]'));
  const disposers = fields.map((canvas) => mountParticleField(canvas));
  return () => disposers.forEach((dispose) => dispose());
}
