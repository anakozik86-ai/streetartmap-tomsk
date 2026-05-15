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
         "default_zoom": 12,
         "bounds": {
           "sw": { "lat": 54.9, "lng": 82.7 },
           "ne": { "lat": 55.1, "lng": 83.2 }
         }
       },
       "site": {
         "title": "streetartmap — Новосибирск",
         "description": "Карта стрит-арта Новосибирска",
         "default_locale": "ru"
       },
       "features": {
         "show_lost_works_default": false,
         "max_visible_collection_colors": 4
       }
     }
     ```
   - `data/categories.json` — оставьте как есть (8 фиксированных) или
     адаптируйте под местные реалии.
   - `data/collections.json`, `data/authors.json`, `data/points.json`,
     `data/routes.json` — приведите к пустым массивам `[]`.
   - `images/` — удалите содержимое.

3. **Обновите `package.json`** — поменяйте `name` на `streetartmap-<city>`.

4. **Обновите README.md** — название города в заголовке и описании.

5. **Обновите base path в `.github/workflows/deploy.yml`:**

   ```yaml
   env:
     VITE_BASE_PATH: /streetartmap-<city>/
   ```

   или, если будете использовать кастомный домен — пустую строку.

6. **Создайте `.env.production` в корне репо:**

   ```
   VITE_GITHUB_OWNER=<ваш-github-login>
   VITE_GITHUB_REPO=streetartmap-<city>
   ```

   Эти переменные нужны админке для записи в правильный репо через GitHub
   Contents API. `.env.example` есть в репо как ориентир.

7. **Включите GitHub Pages** в настройках репо: Settings → Pages → Source:
   GitHub Actions.

8. **Назначьте редакторов** через Settings → Collaborators. У каждого редактора
   должен быть Classic PAT со scope `repo` для записи в репо.

## Возможные изменения по ходу масштабирования

При наполнении проекта 1000+ точек или нескольких городов в одном репозитории
имеет смысл:

- мигрировать фото на Cloudinary или другое CDN — текущая загрузка ведёт через
  GitHub Contents API в `images/`;
- добавить серверную сторону для тяжёлых поисков;
- завести агрегатор `streetartmap.ru` с картой всех городов.

Эти решения — за пределами v1, но архитектура их не блокирует.
