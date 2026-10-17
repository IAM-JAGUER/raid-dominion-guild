// Motor de partículas atmosféricas del portal (canvas 2D, sin dependencias).
//
// Una sola pieza consume TODOS los fondos: cada página monta un <canvas
// data-rd-particles="<variante>"> y aquí vive el contrato de variantes
// (nieve/ventisca del index, motas de clase en personaje, chispas de banda,
// motas heráldicas de hermandad y esquirlas del 404).
//
// Reglas del motor:
// - requestAnimationFrame con dt real (la pausa por pestaña oculta no salta).
// - DPR-aware + resize inmediato (ResizeObserver) que CONSERVA el campo:
//   solo reescala posiciones, sin bitmap estirado ni re-aleatorización.
// - `prefers-reduced-motion: reduce` → ambiente atenuado: la velocidad y la
//   densidad bajan, las ráfagas se suavizan pero SE CONSERVAN (el ritmo es el
//   efecto) y el titileo se apaga. Nunca congelado ni ausente.
// - Pausa en `visibilitychange` (nunca anima en background).
// - Montaje idempotente por canvas: remontar desmonta el campo anterior
//   (HMR/doble ejecución jamás dejan dos bucles dibujando encima).
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
  colorIndex: number;
  // 0 = lejos (chico, lento, tenue), 1 = cerca (grande, rápido, brillante).
  depth: number;
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
  // Fuerza del parallax por profundidad (0 = sin volumen, 1 = máximo):
  // modula tamaño, velocidad, alfa y respuesta al viento de cada partícula.
  parallax: number;
  shape: 'dot' | 'flake' | 'shard' | 'ember';
}

const VARIANT_CONFIG: Record<ParticleVariant, VariantConfig> = {
  // Ventisca del índice (Icecrown): copos con volumen (lejos/medio/cerca) que
  // caen en diagonal empujados por un viento compuesto con ráfagas suaves.
  snow: {
    count: 170,
    opacity: 0.85,
    rising: false,
    speed: [22, 95],
    size: [0.7, 2.4],
    drift: 9,
    wind: 42,
    twinkle: 0,
    palette: ['#ffffff', '#e8f4ff', '#cfe6ff'],
    additive: false,
    parallax: 1,
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
    palette: ['#5CA9E8', '#a78bfa', '#00BFFF'],
    additive: true,
    parallax: 0.7,
    shape: 'dot',
  },
  // Chispas de energía de raid (ficha de banda): suben rápido y titilan.
  ember: {
    count: 90,
    opacity: 0.8,
    rising: true,
    speed: [28, 90],
    size: [0.6, 2.2],
    drift: 10,
    wind: 6,
    twinkle: 1,
    palette: ['#00BFFF', '#5CA9E8', '#B8D7F1'],
    additive: true,
    parallax: 0.75,
    shape: 'ember',
  },
  // Motas heráldicas plateadas (portal de hermandad): caen lento y destellan.
  banner: {
    count: 80,
    opacity: 0.65,
    rising: false,
    speed: [10, 30],
    size: [0.8, 2.4],
    drift: 6,
    wind: 8,
    twinkle: 1.2,
    palette: ['#B8D7F1', '#5CA9E8', '#EEF6FE'],
    additive: true,
    parallax: 0.6,
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
    parallax: 0.8,
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

  // Guarda de idempotencia: un canvas solo puede tener un campo montado. Si
  // algo lo remonta (HMR de Vite, doble ejecución del script), el montaje
  // anterior se desmonta primero — sin esto quedan dos bucles rAF dibujando
  // encima del mismo canvas y el campo "titila" (cada bucle borra y redibuja
  // su propio set en el mismo frame). El disposer vive en el canvas, así la
  // guarda funciona incluso entre instancias distintas del módulo (HMR).
  const host = canvas as HTMLCanvasElement & { __rdParticlesDispose?: () => void };
  host.__rdParticlesDispose?.();

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
  let resizeObserver: ResizeObserver | undefined;

  // Copos difusos (snow): un sprite radial pre-renderizado por color; en cada
  // frame solo se dibuja con drawImage (sin crear gradientes por partícula).
  // Se reconstruye al cambiar la paleta (rd:particles) o el DPR.
  let spriteCache: HTMLCanvasElement[] = [];

  const reducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // `prefers-reduced-motion` no apaga el ambiente: lo atenúa. El movimiento
  // amplio/brusco (parpadeo, velocidad alta) es lo que la preferencia busca
  // evitar; las ráfagas SE CONSERVAN suavizadas porque son el ritmo mismo del
  // efecto (decisión 2026-10-16 tras detectar entornos que reportan `reduce`
  // por defecto — p. ej. previews embebidos — y perdían la ventisca entera).
  const motionScale = reducedMotion ? 0.5 : 1;
  const densityScale = reducedMotion ? 0.7 : 1;
  const windScale = reducedMotion ? 0.45 : 1;

  function density(): number {
    // Escala por ancho: viewports chicos reciben menos de la mitad.
    const wide = clamp(width / 1280, 0.4, 1.3);
    const mobile = width < 640 ? 0.55 : 1;
    return config.count * wide * mobile * densityScale;
  }

  function makeParticle(initial: boolean): Particle {
    // Profundidad: 0 = lejos (chico, lento, tenue), 1 = cerca (grande,
    // rápido, brillante). Es lo que da el volumen de la ventisca.
    const depth = Math.random();
    const size = clamp(
      rand(config.size[0], config.size[1]) * (1 + config.parallax * (depth - 0.5) * 1.2),
      0.4,
      8,
    );
    const speed = rand(config.speed[0], config.speed[1]) * (1 + config.parallax * (depth - 0.5) * 1.3);
    const baseAlpha = clamp(rand(0.35, 1) * (1 - config.parallax * 0.4 * (1 - depth)), 0.1, 1);
    const spawnAbove = !config.rising;
    // initial reparte en todo el alto; si no, nace fuera del borde de entrada.
    const y = initial
      ? Math.random() * height
      : spawnAbove
        ? -10 - Math.random() * 40
        : height + 10 + Math.random() * 40;
    const colorIndex = Math.floor(Math.random() * palette.length);
    return {
      x: Math.random() * width,
      y,
      r: size,
      depth,
      vx: 0,
      vy: config.rising ? -speed : speed,
      alpha: baseAlpha,
      baseAlpha,
      phase: Math.random() * Math.PI * 2,
      twinkle: config.twinkle * Math.random(),
      color: palette[colorIndex],
      colorIndex,
      angle: Math.random() * Math.PI * 2,
      spin: rand(-0.8, 0.8),
      wind: rand(0.5, 1.5) * (0.55 + 0.9 * depth),
    };
  }

  function populate(): void {
    const target = Math.max(12, Math.round(density()));
    particles = Array.from({ length: target }, () => makeParticle(true));
  }

  function buildSprites(): void {
    const radius = Math.max(8, Math.round(24 * dpr));
    spriteCache = palette.map((color) => {
      const sprite = document.createElement('canvas');
      sprite.width = radius * 2;
      sprite.height = radius * 2;
      const sctx = sprite.getContext('2d');
      if (!sctx) return sprite;
      const g = sctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
      g.addColorStop(0, rgba(color, 1));
      g.addColorStop(0.4, rgba(color, 0.5));
      g.addColorStop(1, rgba(color, 0));
      sctx.fillStyle = g;
      sctx.beginPath();
      sctx.arc(radius, radius, radius, 0, Math.PI * 2);
      sctx.fill();
      return sprite;
    });
  }

  function resize(): void {
    const nextW = canvas.clientWidth || window.innerWidth;
    const nextH = canvas.clientHeight || window.innerHeight;
    const nextDpr = clamp(window.devicePixelRatio || 1, 1, 2);
    // El campo se CONSERVA al cambiar de tamaño: las posiciones se reescalan
    // con el lienzo en vez de re-aleatorizar. Antes (resize con debounce +
    // populate) el bitmap quedaba estirado a la nueva caja y luego el campo
    // saltaba — el "reescalado brusco" reportado (frallas.md F018).
    const hadField = particles.length > 0 && width > 0 && height > 0;
    const sx = hadField ? nextW / width : 1;
    const sy = hadField ? nextH / height : 1;
    width = nextW;
    height = nextH;
    canvas.width = Math.round(width * nextDpr);
    canvas.height = Math.round(height * nextDpr);
    if (nextDpr !== dpr || !hadField) {
      dpr = nextDpr;
      buildSprites();
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!hadField) {
      populate();
      return;
    }
    for (const p of particles) {
      p.x *= sx;
      p.y *= sy;
    }
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
    // Un solo lenguaje visual: TODOS los copos son la misma mancha difusa
    // (nieve desenfocada del login). Mezclar blobs suaves con puntos nítidos
    // se percibía como dos efectos distintos superpuestos.
    if (spriteCache.length === 0) return;
    const sprite = spriteCache[p.colorIndex % spriteCache.length];
    const half = Math.max(0.8, p.r * 1.7);
    ctx.globalAlpha = p.alpha * config.opacity;
    ctx.drawImage(sprite, p.x - half, p.y - half, half * 2, half * 2);
    ctx.globalAlpha = 1;
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

  // Viento compuesto: tres senos de períodos inconmensurables (~30 s, ~12 s y
  // ~4.6 s) dan un vaivén que no se siente repetido; encima, una ráfaga con
  // envolvente suave (seno cubicado: entra y sale con facilidad). Nunca es
  // negativo ni corta en seco — el campo "respira" como la ventisca del
  // login, en lugar del pico aislado cada ~70 s de la versión anterior.
  function windAt(t: number): number {
    const swell = 0.5 + 0.5 * Math.sin(t * 0.21);
    const mid = 0.5 + 0.5 * Math.sin(t * 0.53 + 1.1);
    const chop = 0.5 + 0.5 * Math.sin(t * 1.37 + 2.3);
    const base = 0.34 + 0.42 * swell + 0.16 * mid + 0.08 * chop;
    const gust = Math.pow(0.5 + 0.5 * Math.sin(t * 0.13 - 0.7), 3);
    return base + gust * (0.9 + 0.35 * mid);
  }

  function step(dt: number): void {
    const wind = config.wind > 0 ? windAt(elapsed) * config.wind * 0.35 * windScale : 0;
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = config.additive ? 'lighter' : 'source-over';

    for (const p of particles) {
      // Vaivén propio de cada partícula, más amplio en las cercanas.
      const sway = Math.sin(elapsed * 0.6 + p.phase) * config.drift * (0.55 + 0.9 * p.depth);
      p.x += (p.vx + sway + wind * p.wind) * dt * motionScale;
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

  // Resize INMEDIATO vía ResizeObserver (con `window.resize` de respaldo):
  // sin debounce, el bitmap nunca queda estirado a la caja nueva y, como el
  // campo se conserva, no hay saltos al reencuadrar (F018). Se redibuja en el
  // mismo frame para no dejar ni un frame estirado ni el lienzo en blanco.
  function onResize(): void {
    resize();
    if (running) step(0);
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
    buildSprites();
    particles.forEach((p, i) => {
      p.colorIndex = i % palette.length;
      p.color = palette[p.colorIndex];
    });
  }

  resize();
  start();
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(canvas);
  } else {
    window.addEventListener('resize', onResize);
  }
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('rd:particles', onPalette);

  const dispose = (): void => {
    disposed = true;
    stop();
    resizeObserver?.disconnect();
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('rd:particles', onPalette);
    if (host.__rdParticlesDispose === dispose) delete host.__rdParticlesDispose;
  };
  host.__rdParticlesDispose = dispose;
  return dispose;
}

// Monta todos los canvas marcados en el documento (una llamada por página).
export function autoMountParticleFields(root: ParentNode = document): () => void {
  const fields = Array.from(root.querySelectorAll<HTMLCanvasElement>('canvas[data-rd-particles]'));
  const disposers = fields.map((canvas) => mountParticleField(canvas));
  return () => disposers.forEach((dispose) => dispose());
}
