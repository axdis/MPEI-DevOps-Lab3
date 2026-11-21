# Лабораторная работа 3 — Единый поиск по московским событиям

## Вариант 30

Разработан интерфейс единого текстового поиска по четырём типам сущностей:

- события;
- артисты и музыкальные группы;
- площадки;
- серии мероприятий.

Пользователь вводит запрос один раз. Frontend одновременно отправляет четыре GET-запроса к backend и показывает найденные сущности в отдельных разделах с количеством результатов.

## Стек

- Frontend: HTML, CSS, JavaScript;
- Web-сервер и reverse proxy: NGINX;
- Backend: `ghcr.io/nelkor/moscow-events:1.0.0` (FastAPI);
- База данных: PostgreSQL 17 + PostGIS 3.6;
- Оркестрация: Docker Compose.

Backend не копируется в этот репозиторий: используется готовый контейнер из исходного проекта `nelkor/moscow-events`.

## Структура проекта

```text
.
├── compose.yml
├── .env.example
├── .gitignore
├── README.md
└── frontend
    ├── Dockerfile
    ├── nginx.conf
    ├── index.html
    ├── styles.css
    └── app.js
```

## Запуск

Требуется Docker с поддержкой Docker Compose v2.

1. Склонируйте свой репозиторий:

   ```bash
   git clone https://github.com/<ваш-профиль>/<имя-репозитория>.git
   cd <имя-репозитория>
   ```

2. Создайте файл `.env` на основе примера:

   ```bash
   cp .env.example .env
   ```

3. При необходимости измените пароль PostgreSQL в `.env`. Не публикуйте `.env` в GitHub.

4. Соберите и запустите приложение:

   ```bash
   docker compose up -d
   ```

5. Откройте интерфейс:

   [http://localhost:8080](http://localhost:8080)

Первый запуск может занять несколько минут: Docker скачает образы, PostgreSQL инициализирует базу, а backend применит миграцию и заполнит пустую базу демонстрационными данными (`SEED_MODE=sample`).

## Остановка

```bash
docker compose down
```

Для остановки с удалением базы данных и всех сохранённых данных:

```bash
docker compose down -v
```

Команда с `-v` безвозвратно удаляет содержимое тома PostgreSQL.

## Проверка состояния

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f db
```

Проверка backend через NGINX:

- API: `http://localhost:8080/api/v1/meta`
- Swagger UI: `http://localhost:8080/docs`
- OpenAPI JSON: `http://localhost:8080/openapi.json`
- Готовность backend и БД: `http://localhost:8080/health/ready`

## Как устроен поиск

После отправки формы `frontend/app.js` выполняет параллельно следующие запросы:

| Тип результата | Endpoint |
|---|---|
| События | `GET /api/v1/events?q=<запрос>&page=1&page_size=12` |
| Артисты | `GET /api/v1/artists?q=<запрос>&page=1&page_size=12` |
| Площадки | `GET /api/v1/venues?q=<запрос>&page=1&page_size=12` |
| Серии | `GET /api/v1/series?q=<запрос>&page=1&page_size=12` |

Параметр `q` — текстовый поисковый запрос backend. Для каждого каталога отображается собственный список результатов. Если один из запросов завершился ошибкой, остальные категории всё равно показываются.

Запросы выполняются относительно текущего адреса (`/api/v1/...`). Поэтому браузеру не требуется обращаться к backend по отдельному адресу и не требуется отдельная настройка CORS.

## Архитектура Docker Compose

- `db` — PostgreSQL с PostGIS и постоянным именованным томом `postgres_data`;
- `backend` — готовый образ Moscow Events API; подключается к БД по имени сервиса `db`;
- `frontend` — NGINX раздаёт статические файлы и проксирует `/api/`, `/docs`, `/redoc`, `/openapi.json` и `/health` в backend.

Все сервисы находятся во внутренней сети `app-network`. Наружу опубликован только frontend-порт `8080` (можно изменить через `FRONTEND_PORT`).

Backend ожидает переменные `PG_HOST`, `PG_PORT`, `PG_DB_NAME`, `PG_USER_NAME`, `PG_USER_PASSWORD`. Их значения задаются в `compose.yml` из `.env`.

## Источники

- Backend: https://github.com/nelkor/moscow-events
- Документация API: https://nelkor.github.io/moscow-events/
