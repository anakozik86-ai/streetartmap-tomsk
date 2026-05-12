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

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        onClose();
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
  }, [onClose]);

  return (
    <div class="modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        class={`modal${wide ? ' modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
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
