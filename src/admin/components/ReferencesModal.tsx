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

/** Русская плюрализация (1 / 2–4 / 5+) с учётом исключения 11–14. */
function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function ReferencesModal({ title, items, onClose }: Props): JSX.Element {
  const n = items.length;
  // Существительное зависит от того, что ссылается: на точку — маршруты,
  // на категорию/коллекцию/автора — точки. Смешанный список — нейтральное «запись».
  const noun = items.every((i) => i.tab === 'routes')
    ? pluralRu(n, 'маршрут', 'маршрута', 'маршрутов')
    : items.every((i) => i.tab === 'points')
      ? pluralRu(n, 'точка', 'точки', 'точек')
      : pluralRu(n, 'запись', 'записи', 'записей');
  const verb = pluralRu(n, 'ссылается', 'ссылаются', 'ссылается');

  return (
    <Modal title={title} onClose={onClose}>
      <p class="ref-modal__text">
        Удаление невозможно — на запись {verb} {n} {noun}. Сначала уберите ссылки.
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
