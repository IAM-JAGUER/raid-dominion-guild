// Revelado canónico del contenido async (estilo agendalisto): el contenido
// entra con el fundido de material.css (`.rd-enter` / `.rd-enter-card`) en
// cuanto está disponible, en vez de aparecer de golpe.
//
// Contrato por atributos (opt-in en el markup; el motor es ÚNICO y global —
// lo registra Layout una sola vez):
// - `data-rd-reveal`: al quitarle `hidden`, el bloque entra con fundido.
// - `data-rd-reveal-cards`: al recibir hijos (grillas pintadas por JS), los
//   hijos entran escalonados LA PRIMERA vez; los re-render por filtro o
//   búsqueda no re-animan (teclear no debe parpadear).
// Además, todo `[role="tabpanel"]` que se desoculta entra con fundido: cubre
// dashboard, portal de hermandad, fichas y perfil de jugador sin marcar cada
// pestaña a mano.
//
// Con `prefers-reduced-motion: reduce` el fundido se acorta y el escalonado
// se anula (material.css): el contenido aparece igual, sin coreografía.

const FADE = 'rd-enter';
const CARD_FADE = 'rd-enter-card';
const MAX_STAGGER = 8;

// Reinicia la animación aunque la clase ya esté puesta (re-reveals).
export function revealEl(el: HTMLElement | null): void {
  if (!el) return;
  el.classList.remove(FADE);
  void el.offsetWidth;
  el.classList.add(FADE);
}

// Escalona la entrada de los ítems del contenedor (solo la PRIMERA vez: los
// re-render por filtro/búsqueda no re-animan). El valor del atributo es un
// selector CSS opcional para listas ANIDADAS (p. ej.
// `data-rd-reveal-cards=".rd-card"` cuando los ítems viven dentro de secciones
// por día); sin valor, los ítems son los hijos directos presentes.
export function revealCards(container: HTMLElement | null): void {
  if (!container || container.dataset.rdRevealed === '1') return;
  const selector = (container.getAttribute('data-rd-reveal-cards') ?? '').trim();
  const source: Element[] = selector
    ? Array.from(container.querySelectorAll(selector))
    : Array.from(container.children);
  const elements = source.filter(
    (n): n is HTMLElement =>
      n instanceof HTMLElement &&
      // El bloque de carga vive dentro del contenedor mientras carga: nunca
      // es un ítem del escalonado, y lo ya oculto tampoco se anima.
      !n.hasAttribute('data-rd-list-status') &&
      !n.classList.contains('hidden'),
  );
  if (elements.length === 0) return;
  container.dataset.rdRevealed = '1';
  elements.forEach((el, i) => {
    // El índice vive en una custom property: el escalonado (y su anulación
    // con `reduce`) es CSS puro (material.css).
    el.style.setProperty('--rd-card-i', String(Math.min(i, MAX_STAGGER)));
    el.classList.remove(CARD_FADE);
    void el.offsetWidth;
    el.classList.add(CARD_FADE);
  });
}

function isRevealable(el: HTMLElement): boolean {
  return el.hasAttribute('data-rd-reveal') || el.getAttribute('role') === 'tabpanel';
}

// Motor global idempotente (seguro ante HMR: el observer anterior se
// desmonta antes de registrar el nuevo).
export function observeReveals(root: ParentNode = document): () => void {
  const host = window as Window & { __rdReveals?: () => void };
  host.__rdReveals?.();

  const hadHidden = (rec: MutationRecord): boolean =>
    (rec.oldValue ?? '').split(/\s+/).includes('hidden');

  const observer = new MutationObserver((records) => {
    for (const rec of records) {
      if (rec.type === 'attributes') {
        // Solo transiciones REALES hidden → visible: las clases que añade el
        // propio motor (rd-enter/rd-enter-card) u otros cambios no re-disparan
        // (evita bucles de mutación).
        const el = rec.target as HTMLElement;
        if (!hadHidden(rec) || el.classList.contains('hidden')) continue;
        if (el.hasAttribute('data-rd-reveal-cards')) revealCards(el);
        else if (isRevealable(el)) revealEl(el);
      } else if (rec.addedNodes.length > 0) {
        const el = rec.target as HTMLElement;
        // Los hijos ya insertados en este lote (el observer entrega todas las
        // mutaciones de la tarea juntas): se escalonan los presentes.
        if (!el.classList?.contains('hidden') && el.hasAttribute?.('data-rd-reveal-cards')) {
          revealCards(el);
        }
      }
    }
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class'],
    attributeOldValue: true,
  });

  // Pasada inicial: si una grilla alcanzó a pintarse antes de registrar el
  // observer (fetch cacheado), se revela igual.
  root
    .querySelectorAll<HTMLElement>('[data-rd-reveal-cards]')
    .forEach((el) => {
      if (el.children.length > 0) revealCards(el);
    });

  const dispose = (): void => {
    observer.disconnect();
    if (host.__rdReveals === dispose) delete host.__rdReveals;
  };
  host.__rdReveals = dispose;
  return dispose;
}
