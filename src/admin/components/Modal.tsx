import { type ComponentChildren, type JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import './Modal.css';

interface Props {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  wide?: boolean;
}

export function Modal({ title, onClose, children, wide }: Props): JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, []);

  // Закрываем только если mousedown И mouseup произошли на backdrop —
  // защита от ложных срабатываний при выделении текста с движением мыши за пределы модалки.
  const mouseDownOnBackdropRef = useRef(false);
  return (
    <div
      class="modal-backdrop"
      onMouseDown={(e) => {
        mouseDownOnBackdropRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (mouseDownOnBackdropRef.current && e.target === e.currentTarget) onClose();
        mouseDownOnBackdropRef.current = false;
      }}
    >
      <div
        ref={dialogRef}
        class={`modal${wide ? ' modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div class="modal__header">
          <h2 class="modal__title">{title}</h2>
          <button class="modal__close" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>
        <div class="modal__body">{children}</div>
      </div>
    </div>
  );
}
