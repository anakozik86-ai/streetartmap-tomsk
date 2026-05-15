import type { JSX } from 'preact';
import { Modal } from './Modal.tsx';
import { navigate } from '../state/router.ts';

interface ReferenceItem {
  id: string;
  label: string;
  tab: 'points' | 'routes';
}

interface Props {
  title: string;
  items: ReferenceItem[];
  onClose: () => void;
}

export function ReferencesModal({ title, items, onClose }: Props): JSX.Element {
  return (
    <Modal title={title} onClose={onClose}>
      <p class="ref-modal__text">
        Удаление невозможно — на запись ссылается {items.length}{' '}
        {items.length === 1 ? 'точка' : items.length < 5 ? 'точки' : 'точек'}. Сначала уберите
        ссылки.
      </p>
      <ul class="ref-modal__list">
        {items.map((item) => (
          <li key={item.id}>
            <button
              class="ref-modal__link"
              onClick={() => {
                onClose();
                navigate(item.tab, item.id);
              }}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
      <div class="ref-modal__footer">
        <button class="admin-btn admin-btn--ghost" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </Modal>
  );
}
