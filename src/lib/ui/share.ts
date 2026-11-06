// Botón de compartir en fichas públicas. Fuente única del patrón:
// usa la Web Share API en móvil y copia el enlace en escritorio.
import { ui } from '@/lib/ui/design';
import { iconEl } from '@/lib/ui/icons';
import { toast } from '@/lib/ui/toast';

interface ShareOptions {
  title: string;
  text?: string;
  url?: string;
  label?: string;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function shareLinkButton({ title, text, url, label = 'Compartir' }: ShareOptions): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `${ui.badge} ${ui.badgeMd} bg-brand-800/60 border-brand-600/30 text-brand-200 hover:bg-brand-800/90 hover:border-brand-500/50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 cursor-pointer`;
  btn.setAttribute('aria-label', `${label} esta ficha`);
  btn.title = `${label} esta ficha`;
  btn.appendChild(iconEl('compartir', { size: 'xs' }));
  btn.appendChild(document.createTextNode(label));

  btn.addEventListener('click', async () => {
    const link = url ?? window.location.href;
    const data = { title, text: text ?? title, url: link };
    if (typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share(data);
        return;
      } catch {
        // El usuario canceló o el navegador no completó: se intenta copiar.
      }
    }
    const copied = await copyText(link);
    if (copied) {
      toast.success('Enlace copiado', 'Puedes pegarlo en Discord o donde quieras compartirlo.');
      btn.setAttribute('aria-live', 'polite');
    } else {
      // Fallback sin API de portapapeles: el usuario puede copiar el enlace.
      window.prompt('Copia el enlace para compartirlo:', link);
    }
  });

  return btn;
}
