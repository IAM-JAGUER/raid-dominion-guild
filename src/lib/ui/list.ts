// Contrato ÚNICO de LISTA ASÍNCRONA del portal (directorios y bandas): el paso
// spinner → contenido → vacío SIEMPRE se hace aquí, con los mismos estados y
// los mismos atributos en todas las páginas.
//
// Markup estándar (atributos auto-descriptivos; los ids siguen siendo el
// contrato particular de cada página):
//   data-rd-list-content  contenedor de ítems (lleva `data-rd-reveal-cards`;
//                         su valor es el selector CSS de los ítems si están
//                         anidados, p. ej. `".rd-card"`). El bloque de carga
//                         vive DENTRO, como único hijo mientras carga: al
//                         asentarse se RETIRA y los ítems ocupan su lugar
//                         (reemplazo in-place, sin salto de layout).
//   data-rd-list-status   bloque de carga (LoadingBlock) dentro del content.
//   data-rd-list-empty    EmptyState: visible SOLO en el estado vacío.
//   data-rd-list-frame    (opcional) marco que acompaña a la lista (p. ej. el
//                         PanelWindow de /bandas): se oculta solo cuando
//                         manda el estado vacío.
//
// El REVELADO (fade del bloque + escalonado de ítems) no vive aquí: lo hace
// el motor `src/lib/ui/reveal.ts` al insertar ítems o desocultar bloques.

export type AsyncListState = 'ready' | 'empty' | 'notice';

export interface AsyncList {
  status: HTMLElement | null;
  content: HTMLElement | null;
  empty: HTMLElement | null;
  frame: HTMLElement | null;
}

// Resuelve las piezas de la lista dentro de `root` (documento por defecto;
// pasar un contenedor si la página tiene más de una lista).
export function resolveAsyncList(root: ParentNode = document): AsyncList {
  return {
    status: root.querySelector<HTMLElement>('[data-rd-list-status]'),
    content: root.querySelector<HTMLElement>('[data-rd-list-content]'),
    empty: root.querySelector<HTMLElement>('[data-rd-list-empty]'),
    frame: root.querySelector<HTMLElement>('[data-rd-list-frame]'),
  };
}

// Vacía los ítems del contenido SIN tocar el bloque de carga (que vive dentro
// y se reutiliza si la lista vuelve a un estado de aviso).
export function clearListItems(list: AsyncList): void {
  const { content, status } = list;
  if (!content) return;
  Array.from(content.children).forEach((child) => {
    if (child !== status) child.remove();
  });
}

// Aplica el estado estándar:
// - `ready`:  se retira el bloque de carga y los ítems (ya insertados) entran
//             fundidos escalonados en su lugar.
// - `empty`:  se retira el bloque de carga y se muestra el EmptyState.
// - `notice`: el bloque de carga queda visible con `message` (errores de red
//             o «sin resultados»), sin spinner.
export function settleAsyncList(list: AsyncList, state: AsyncListState, message?: string): void {
  const { status, content, empty, frame } = list;
  if (status) {
    if (state === 'notice') {
      status.classList.remove('hidden');
      status.textContent = message ?? 'No se pudo cargar el contenido.';
      if (content && status.parentElement !== content) content.prepend(status);
    } else {
      status.remove();
    }
  }
  frame?.classList.toggle('hidden', state === 'empty');
  empty?.classList.toggle('hidden', state !== 'empty');
}
