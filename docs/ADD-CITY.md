# Как развернуть streetartmap для другого города

Каждый город — отдельный репозиторий. Структура одинаковая, отличается только
содержимое `data/` и `data/config.json`.

## Шаги

1. **Форк репо** или создайте новый по этому шаблону. Назовите по принципу
   `streetartmap-<city>`, например `streetartmap-novosibirsk`.

2. **Очистите данные.** Замените содержимое:

   - `data/config.json` — пропишите свой город:
     ```json
     {
       "schema_version": 1,
       "city": {
         "name": "Новосибирск",
         "name_en": "Novosibirsk",
         "center": { "lat": 55.0084, "lng": 82.9357 },
         "default_zoom": 12
       },
       "site": { "title": "streetartmap — Новосибирск", ... }
     }
     ```
   - `data/categories.json` — оставьте как есть (8 фиксированных) или
     адаптируйте под местные реалии.
   - `data/collections.json`, `data/authors.json`, `data/points.json`,
     `data/routes.json` — приведите к пустым массивам `[]`.
   - `images/` — удалите содержимое подпапок `points/`, `authors/`,
     `collections/`, `routes/`.

3. **Обновите `package.json`** — поменяйте `name` на `streetartmap-<city>`.

4. **Обновите README** — название города в заголовке.

5. **Обновите base path в `.github/workflows/deploy.yml`:**

   ```yaml
   VITE_BASE_PATH: /streetartmap-<city>/
   ```

   или, если будете использовать кастомный домен — пустую строку.

6. **Включите GitHub Pages** в настройках репо: Settings → Pages → Source:
   GitHub Actions.

7. **Назначьте редакторов** через Settings → Collaborators.

## Возможные изменения по ходу масштабирования

При наполнении проекта 1000+ точек или нескольких городов в одном репозитории
имеет смысл:

- мигрировать фото на Cloudinary (см. `src/shared/storage` — слой подменяется
  без изменений в `data/`);
- добавить серверную сторону для тяжёлых поисков;
- завести агрегатор `streetartmap.ru` с картой всех городов.

Эти решения — за пределами v1, но архитектура их не блокирует.
