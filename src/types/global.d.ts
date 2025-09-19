// Extender la interfaz HTMLElement para incluir propiedades personalizadas
declare global {
  interface HTMLElement {
    offsetTop: number;
    offsetHeight: number;
    getBoundingClientRect(): DOMRect;
  }
}

export {}; // Este archivo debe ser un módulo
