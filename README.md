# Cockroach Racing API 🪳

Backend-проект «Тараканьи бега»: игроки покупают и тренируют тараканов, букмекер создаёт заезды и выставляет коэффициенты, игроки делают ставки на виртуальную валюту. Результат заезда считает сервер на сидированном генераторе случайных чисел, поэтому честность можно проверить (provably fair).

**Публичный API:** https://138-124-18-166.sslip.io
**Swagger UI:** https://138-124-18-166.sslip.io/api/docs

## Стек

Node.js 20, Express 4, Prisma 5, PostgreSQL 16, Redis 7, JWT (access + refresh), Zod, Jest + Supertest, Swagger (OpenAPI 3), Docker Compose, Caddy (HTTPS).

## Возможности

- Регистрация, логин, access/refresh токены, пароли хранятся как bcrypt-хеши.
- Две роли: `PLAYER` и `BOOKMAKER`. Букмекера создаёт только сид-скрипт, через API он не регистрируется.
- Проверка владельца: менять и удалять таракана может только владелец, менять заезд и коэффициенты может только букмекер, создавший заезд, ставки видны только их автору.
- Полный CRUD для тараканов и заездов, фильтры и пагинация во всех списках.
- Ставки в транзакции БД: атомарное списание, коэффициент фиксируется на момент ставки.
- Заезд: симуляция по seed, текстовый комментарий, автоматический расчёт выплат.
- Provably fair: перед заездом публикуется `sha256(seed)`, после финиша раскрывается `seed`, а `GET /races/:id/result` сам проверяет честность.
- Единый формат ответов `{ success, data, meta }` / `{ success: false, error }`, общий обработчик ошибок.

## Модели

`User`, `Racer`, `Race`, `RaceEntry`, `Bet`, `Transaction`.

```
User 1──* Racer 1──* RaceEntry *──1 Race
User 1──* Bet *──1 RaceEntry
Race 1──* Bet
User 1──* Transaction
```

Схема: `prisma/schema.prisma`.

## Запуск через Docker

Нужны Docker и Docker Compose.

```bash
git clone https://github.com/KsnxI/cockroach-racing-.git
cd cockroach-racing-
cp .env.example .env
# в .env замените JWT_ACCESS_SECRET и JWT_REFRESH_SECRET на случайные строки
docker compose up --build
```

Приложение: http://localhost:3000, документация: http://localhost:3000/api/docs.
При старте контейнера автоматически применяются миграции и создаются демо-пользователи.

Демо-аккаунты (после сида):

| Роль | Email | Пароль |
|---|---|---|
| BOOKMAKER | bookie@race.com | bookmaker123 |
| PLAYER | player@race.com | password123 |

## Запуск для разработки

```bash
npm install
cp .env.example .env
docker compose up -d db redis
npx prisma migrate dev
npm run seed
npm run dev
```

## Тесты

Тесты идут в отдельной базе `racing_test`.

```bash
docker compose up -d db redis
docker compose exec db sh -c 'createdb -U $POSTGRES_USER racing_test'
npm test
```

Покрыто: регистрация, логин, refresh, CRUD с аутентификацией, права ролей, проверка владельца, ставки и их ограничения, запуск заезда и расчёт, детерминизм симуляции, Swagger.

## Переменные окружения

См. `.env.example`: параметры БД и Redis, секреты JWT и их время жизни, бонус при регистрации, лимиты ставок, пароль букмекера.

## Деплой

VPS, Docker Compose (`docker-compose.prod.yml`) и Caddy с автоматическим HTTPS:

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

## Эндпоинты

Авторизация: заголовок `Authorization: Bearer <accessToken>`.

| Метод | Путь | Доступ | Описание |
|---|---|---|---|
| GET | /health | все | Проверка сервера |
| POST | /auth/register | все | Регистрация |
| POST | /auth/login | все | Вход, выдача токенов |
| POST | /auth/refresh | все | Обновление токенов |
| GET | /auth/me | авторизованные | Профиль и баланс |
| GET | /racers | авторизованные | Список тараканов (ownerId, minSpeed, search, sort, order, page, limit) |
| POST | /racers | авторизованные | Купить таракана |
| GET | /racers/:id | авторизованные | Один таракан |
| PATCH | /racers/:id | владелец | Переименовать |
| DELETE | /racers/:id | владелец | Удалить |
| POST | /racers/:id/train | владелец | Тренировка |
| GET | /races | авторизованные | Список заездов (status, from, to, order, page, limit) |
| POST | /races | BOOKMAKER | Создать заезд |
| GET | /races/:id | авторизованные | Заезд с участниками |
| PATCH | /races/:id | BOOKMAKER (создатель) | Изменить заезд |
| DELETE | /races/:id | BOOKMAKER (создатель) | Удалить заезд |
| POST | /races/:id/entries | владелец таракана | Заявить таракана |
| DELETE | /races/:id/entries/:entryId | владелец таракана | Снять с заезда |
| PATCH | /races/:id/entries/:entryId/odds | BOOKMAKER (создатель) | Поставить коэффициент |
| POST | /races/:id/open-betting | BOOKMAKER (создатель) | Открыть ставки, опубликовать seedHash |
| POST | /races/:id/run | BOOKMAKER (создатель) | Запустить заезд, рассчитать ставки |
| GET | /races/:id/result | авторизованные | Результат, комментарий, seed, проверка честности |
| POST | /bets | PLAYER | Сделать ставку |
| GET | /bets | авторизованные | Мои ставки (status, raceId, page, limit) |
| GET | /bets/:id | владелец ставки | Одна ставка |
| GET | /me/transactions | авторизованные | История операций (type, page, limit) |

## Структура проекта

```
prisma/        схема, миграции, сид
src/config/    настройки и Swagger-спецификация
src/middleware auth, rbac, validate, errorHandler
src/routes/    маршруты
src/services/  расчёт заезда
src/workers/   симуляция заезда
src/utils/     jwt, rng, ошибки, пагинация
__tests__/     тесты Jest + Supertest
```