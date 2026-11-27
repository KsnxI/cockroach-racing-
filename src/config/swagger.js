const ref = (n) => ({ $ref: `#/components/schemas/${n}` });
const body = (schema) => ({ required: true, content: { 'application/json': { schema } } });
const json = (schema) => ({ content: { 'application/json': { schema } } });
const response = (description, schema) => ({ description, ...(schema ? json(schema) : {}) });
const errRef = (n) => ({ $ref: `#/components/responses/${n}` });

const envelope = (data) => ({
  type: 'object',
  properties: { success: { type: 'boolean', example: true }, data },
});
const listOf = (item) => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: { type: 'array', items: item },
    meta: ref('PageMeta'),
  },
});

const idParam = (name = 'id', description = 'UUID ресурса') => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: { type: 'string', format: 'uuid' },
});
const page = { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } };
const limit = { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 } };
const q = (name, schema, description) => ({ name, in: 'query', description, schema });

const noAuth = { security: [] };

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Cockroach Racing API',
    version: '1.0.0',
    description:
      'Тараканьи бега: игроки покупают и тренируют тараканов, букмекер создаёт заезды и ставит коэффициенты, ' +
      'игроки делают ставки. Результат заезда считается на сидированном ГСЧ, seed раскрывается после финиша ' +
      '(provably fair).\n\nАвторизация: получите `accessToken` через `/auth/login` и вставьте его в кнопке **Authorize** (без слова Bearer).\n\n' +
      'Демо-аккаунты: `bookie@race.com` / `bookmaker123` (BOOKMAKER), `player@race.com` / `password123` (PLAYER).',
  },
  servers: [{ url: '/', description: 'Текущий сервер' }],
  tags: [
    { name: 'Health' },
    { name: 'Auth', description: 'Регистрация и токены' },
    { name: 'Racers', description: 'Тараканы (CRUD, только владелец)' },
    { name: 'Races', description: 'Заезды (CRUD только для BOOKMAKER)' },
    { name: 'Bets', description: 'Ставки игроков' },
    { name: 'Me', description: 'История операций' },
  ],
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Проверка работы сервера',
        ...noAuth,
        responses: { 200: response('Сервер работает', envelope({ type: 'object', properties: { status: { type: 'string', example: 'ok' } } })) },
      },
    },

    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Регистрация (роль всегда PLAYER, бонус на баланс)',
        ...noAuth,
        requestBody: body(ref('RegisterRequest')),
        responses: {
          201: response('Пользователь создан', envelope(ref('AuthResult'))),
          400: errRef('ValidationError'),
          409: errRef('Conflict'),
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Вход, выдаёт access и refresh токены',
        ...noAuth,
        requestBody: body(ref('LoginRequest')),
        responses: {
          200: response('Успешный вход', envelope(ref('AuthResult'))),
          400: errRef('ValidationError'),
          401: errRef('Unauthorized'),
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Обновить пару токенов по refresh-токену',
        ...noAuth,
        requestBody: body(ref('RefreshRequest')),
        responses: {
          200: response('Новая пара токенов', envelope(ref('Tokens'))),
          400: errRef('ValidationError'),
          401: errRef('Unauthorized'),
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Текущий пользователь и баланс',
        responses: { 200: response('Профиль', envelope(ref('User'))), 401: errRef('Unauthorized') },
      },
    },

    '/racers': {
      get: {
        tags: ['Racers'],
        summary: 'Список тараканов (фильтры, сортировка, пагинация)',
        parameters: [
          page,
          limit,
          q('ownerId', { type: 'string', format: 'uuid' }, 'Только тараканы этого владельца'),
          q('minSpeed', { type: 'integer', minimum: 1, maximum: 100 }, 'Минимальная скорость'),
          q('search', { type: 'string', maxLength: 30 }, 'Поиск по имени'),
          q('sort', { type: 'string', enum: ['createdAt', 'speed', 'wins'], default: 'createdAt' }),
          q('order', { type: 'string', enum: ['asc', 'desc'], default: 'desc' }),
        ],
        responses: { 200: response('Список', listOf(ref('Racer'))), 400: errRef('ValidationError'), 401: errRef('Unauthorized') },
      },
      post: {
        tags: ['Racers'],
        summary: 'Купить таракана (списывается 100 с баланса)',
        requestBody: body(ref('RacerName')),
        responses: {
          201: response('Таракан создан', envelope(ref('Racer'))),
          400: errRef('ValidationError'),
          401: errRef('Unauthorized'),
          422: errRef('NotEnoughBalance'),
        },
      },
    },
    '/racers/{id}': {
      parameters: [idParam()],
      get: {
        tags: ['Racers'],
        summary: 'Один таракан',
        responses: { 200: response('Таракан', envelope(ref('Racer'))), 401: errRef('Unauthorized'), 404: errRef('NotFound') },
      },
      patch: {
        tags: ['Racers'],
        summary: 'Переименовать (только владелец)',
        requestBody: body(ref('RacerName')),
        responses: {
          200: response('Обновлён', envelope(ref('Racer'))),
          400: errRef('ValidationError'),
          401: errRef('Unauthorized'),
          403: errRef('Forbidden'),
          404: errRef('NotFound'),
        },
      },
      delete: {
        tags: ['Racers'],
        summary: 'Удалить (только владелец, если не участвовал в заездах)',
        responses: {
          204: { description: 'Удалён' },
          401: errRef('Unauthorized'),
          403: errRef('Forbidden'),
          404: errRef('NotFound'),
          409: errRef('Conflict'),
        },
      },
    },
    '/racers/{id}/train': {
      post: {
        tags: ['Racers'],
        summary: 'Тренировка (50 с баланса, -20 энергии, +1 к характеристике)',
        parameters: [idParam()],
        requestBody: body(ref('TrainRequest')),
        responses: {
          200: response('Таракан после тренировки', envelope(ref('Racer'))),
          400: errRef('ValidationError'),
          401: errRef('Unauthorized'),
          403: errRef('Forbidden'),
          404: errRef('NotFound'),
          409: errRef('Conflict'),
          422: errRef('NotEnoughBalance'),
        },
      },
    },

    '/races': {
      get: {
        tags: ['Races'],
        summary: 'Список заездов (фильтры по статусу и датам, пагинация)',
        parameters: [
          page,
          limit,
          q('status', { type: 'string', enum: ['SCHEDULED', 'BETTING_OPEN', 'RUNNING', 'FINISHED', 'CANCELLED'] }),
          q('from', { type: 'string', format: 'date-time' }, 'Начало не раньше'),
          q('to', { type: 'string', format: 'date-time' }, 'Начало не позже'),
          q('order', { type: 'string', enum: ['asc', 'desc'], default: 'asc' }),
        ],
        responses: { 200: response('Список', listOf(ref('Race'))), 400: errRef('ValidationError'), 401: errRef('Unauthorized') },
      },
      post: {
        tags: ['Races'],
        summary: 'Создать заезд (BOOKMAKER)',
        requestBody: body(ref('RaceCreate')),
        responses: {
          201: response('Заезд создан', envelope(ref('Race'))),
          400: errRef('ValidationError'),
          401: errRef('Unauthorized'),
          403: errRef('Forbidden'),
        },
      },
    },
    '/races/{id}': {
      parameters: [idParam()],
      get: {
        tags: ['Races'],
        summary: 'Заезд с участниками',
        responses: { 200: response('Заезд', envelope(ref('Race'))), 401: errRef('Unauthorized'), 404: errRef('NotFound') },
      },
      patch: {
        tags: ['Races'],
        summary: 'Изменить заезд (создатель, пока статус SCHEDULED)',
        requestBody: body(ref('RaceUpdate')),
        responses: {
          200: response('Обновлён', envelope(ref('Race'))),
          400: errRef('ValidationError'),
          401: errRef('Unauthorized'),
          403: errRef('Forbidden'),
          404: errRef('NotFound'),
          409: errRef('Conflict'),
        },
      },
      delete: {
        tags: ['Races'],
        summary: 'Удалить заезд (создатель, пока статус SCHEDULED)',
        responses: {
          204: { description: 'Удалён' },
          401: errRef('Unauthorized'),
          403: errRef('Forbidden'),
          404: errRef('NotFound'),
          409: errRef('Conflict'),
        },
      },
    },
    '/races/{id}/entries': {
      post: {
        tags: ['Races'],
        summary: 'Заявить своего таракана на заезд',
        parameters: [idParam()],
        requestBody: body(ref('EnterRequest')),
        responses: {
          201: response('Заявка создана', envelope(ref('RaceEntry'))),
          400: errRef('ValidationError'),
          401: errRef('Unauthorized'),
          403: errRef('Forbidden'),
          404: errRef('NotFound'),
          409: errRef('Conflict'),
        },
      },
    },
    '/races/{id}/entries/{entryId}': {
      delete: {
        tags: ['Races'],
        summary: 'Снять таракана с заезда (владелец, пока SCHEDULED)',
        parameters: [idParam(), idParam('entryId', 'UUID заявки')],
        responses: {
          204: { description: 'Заявка удалена' },
          401: errRef('Unauthorized'),
          403: errRef('Forbidden'),
          404: errRef('NotFound'),
          409: errRef('Conflict'),
        },
      },
    },
    '/races/{id}/entries/{entryId}/odds': {
      patch: {
        tags: ['Races'],
        summary: 'Поставить коэффициент (BOOKMAKER, создатель заезда)',
        parameters: [idParam(), idParam('entryId', 'UUID заявки')],
        requestBody: body(ref('OddsRequest')),
        responses: {
          200: response('Коэффициент обновлён', envelope(ref('RaceEntry'))),
          400: errRef('ValidationError'),
          401: errRef('Unauthorized'),
          403: errRef('Forbidden'),
          404: errRef('NotFound'),
          409: errRef('Conflict'),
        },
      },
    },
    '/races/{id}/open-betting': {
      post: {
        tags: ['Races'],
        summary: 'Открыть приём ставок: создаётся seed, публикуется только его хеш (BOOKMAKER)',
        parameters: [idParam()],
        responses: {
          200: response('Приём ставок открыт', envelope(ref('Race'))),
          401: errRef('Unauthorized'),
          403: errRef('Forbidden'),
          404: errRef('NotFound'),
          409: errRef('Conflict'),
        },
      },
    },
    '/races/{id}/run': {
      post: {
        tags: ['Races'],
        summary: 'Запустить заезд, рассчитать ставки и выплаты (BOOKMAKER)',
        parameters: [idParam()],
        responses: {
          200: response('Результат заезда', envelope(ref('RaceResult'))),
          401: errRef('Unauthorized'),
          403: errRef('Forbidden'),
          404: errRef('NotFound'),
          409: errRef('Conflict'),
        },
      },
    },
    '/races/{id}/result': {
      get: {
        tags: ['Races'],
        summary: 'Результат: позиции, комментарий, раскрытый seed и проверка честности',
        parameters: [idParam()],
        responses: {
          200: response('Результат', envelope(ref('RaceResult'))),
          401: errRef('Unauthorized'),
          404: errRef('NotFound'),
          409: errRef('Conflict'),
        },
      },
    },

    '/bets': {
      get: {
        tags: ['Bets'],
        summary: 'Мои ставки (фильтры, пагинация)',
        parameters: [
          page,
          limit,
          q('status', { type: 'string', enum: ['PENDING', 'WON', 'LOST', 'REFUNDED'] }),
          q('raceId', { type: 'string', format: 'uuid' }),
        ],
        responses: { 200: response('Список', listOf(ref('Bet'))), 400: errRef('ValidationError'), 401: errRef('Unauthorized') },
      },
      post: {
        tags: ['Bets'],
        summary: 'Сделать ставку (PLAYER). Коэффициент фиксируется на момент ставки',
        requestBody: body(ref('BetCreate')),
        responses: {
          201: response('Ставка принята', envelope({ type: 'object', properties: { bet: ref('Bet'), balance: { type: 'integer', example: 800 } } })),
          400: errRef('ValidationError'),
          401: errRef('Unauthorized'),
          403: errRef('Forbidden'),
          404: errRef('NotFound'),
          409: errRef('Conflict'),
          422: errRef('NotEnoughBalance'),
        },
      },
    },
    '/bets/{id}': {
      get: {
        tags: ['Bets'],
        summary: 'Одна ставка (только владелец)',
        parameters: [idParam()],
        responses: {
          200: response('Ставка', envelope(ref('Bet'))),
          401: errRef('Unauthorized'),
          403: errRef('Forbidden'),
          404: errRef('NotFound'),
        },
      },
    },

    '/me/transactions': {
      get: {
        tags: ['Me'],
        summary: 'История денежных операций (пагинация, фильтр по типу)',
        parameters: [
          page,
          limit,
          q('type', { type: 'string', enum: ['SIGNUP_BONUS', 'BET', 'BET_WIN', 'REFUND', 'RACER_PURCHASE', 'TRAINING', 'PRIZE'] }),
        ],
        responses: { 200: response('Список', listOf(ref('Transaction'))), 400: errRef('ValidationError'), 401: errRef('Unauthorized') },
      },
    },
  },

  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    responses: {
      ValidationError: { description: 'Ошибка валидации (400)', ...json(ref('Error')) },
      Unauthorized: { description: 'Нет или неверный токен (401)', ...json(ref('Error')) },
      Forbidden: { description: 'Недостаточно прав или чужой ресурс (403)', ...json(ref('Error')) },
      NotFound: { description: 'Не найдено (404)', ...json(ref('Error')) },
      Conflict: { description: 'Конфликт состояния или дубликат (409)', ...json(ref('Error')) },
      NotEnoughBalance: { description: 'Недостаточно средств (422)', ...json(ref('Error')) },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              message: { type: 'string', example: 'Validation error' },
              details: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { field: { type: 'string', example: 'password' }, message: { type: 'string' } },
                },
              },
            },
          },
        },
      },
      PageMeta: {
        type: 'object',
        properties: {
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 10 },
          total: { type: 'integer', example: 42 },
          totalPages: { type: 'integer', example: 5 },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          nickname: { type: 'string' },
          role: { type: 'string', enum: ['PLAYER', 'BOOKMAKER'] },
          balance: { type: 'integer', example: 1000 },
        },
      },
      Tokens: {
        type: 'object',
        properties: { accessToken: { type: 'string' }, refreshToken: { type: 'string' } },
      },
      AuthResult: {
        type: 'object',
        properties: {
          user: ref('User'),
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
        },
      },
      RegisterRequest: {
        type: 'object',
        required: ['email', 'password', 'nickname'],
        properties: {
          email: { type: 'string', format: 'email', example: 'alice@example.com' },
          password: { type: 'string', minLength: 8, maxLength: 72, example: 'password123' },
          nickname: { type: 'string', minLength: 3, maxLength: 20, example: 'alice' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'player@race.com' },
          password: { type: 'string', example: 'password123' },
        },
      },
      RefreshRequest: {
        type: 'object',
        required: ['refreshToken'],
        properties: { refreshToken: { type: 'string' } },
      },
      Racer: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          ownerId: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Усатый Пират' },
          speed: { type: 'integer', example: 5 },
          stamina: { type: 'integer', example: 5 },
          luck: { type: 'integer', example: 5 },
          energy: { type: 'integer', example: 100 },
          wins: { type: 'integer', example: 0 },
          races: { type: 'integer', example: 0 },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      RacerName: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', minLength: 2, maxLength: 30, example: 'Усатый Пират' } },
      },
      TrainRequest: {
        type: 'object',
        required: ['stat'],
        properties: { stat: { type: 'string', enum: ['speed', 'stamina', 'luck'] } },
      },
      Race: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string', example: 'Кубок Крошки' },
          status: { type: 'string', enum: ['SCHEDULED', 'BETTING_OPEN', 'RUNNING', 'FINISHED', 'CANCELLED'] },
          startsAt: { type: 'string', format: 'date-time' },
          seedHash: { type: 'string', nullable: true, description: 'sha256(seed), публикуется до заезда' },
          seed: { type: 'string', description: 'Только у завершённых заездов' },
          createdById: { type: 'string', format: 'uuid' },
          entries: { type: 'array', items: ref('RaceEntry') },
        },
      },
      RaceCreate: {
        type: 'object',
        required: ['title', 'startsAt'],
        properties: {
          title: { type: 'string', minLength: 3, maxLength: 60, example: 'Кубок Крошки' },
          startsAt: { type: 'string', format: 'date-time', description: 'Время в будущем' },
        },
      },
      RaceUpdate: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 3, maxLength: 60 },
          startsAt: { type: 'string', format: 'date-time' },
        },
      },
      RaceEntry: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          raceId: { type: 'string', format: 'uuid' },
          racerId: { type: 'string', format: 'uuid' },
          odds: { type: 'string', example: '2.50', description: 'Коэффициент (Decimal в виде строки)' },
          position: { type: 'integer', nullable: true },
          finishTime: { type: 'integer', nullable: true },
        },
      },
      EnterRequest: {
        type: 'object',
        required: ['racerId'],
        properties: { racerId: { type: 'string', format: 'uuid' } },
      },
      OddsRequest: {
        type: 'object',
        required: ['odds'],
        properties: { odds: { type: 'number', minimum: 1.1, maximum: 50, example: 2.5 } },
      },
      Bet: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          userId: { type: 'string', format: 'uuid' },
          raceId: { type: 'string', format: 'uuid' },
          entryId: { type: 'string', format: 'uuid' },
          amount: { type: 'integer', example: 100 },
          oddsAtBet: { type: 'string', example: '1.80', description: 'Коэффициент на момент ставки' },
          status: { type: 'string', enum: ['PENDING', 'WON', 'LOST', 'REFUNDED'] },
          payout: { type: 'integer', example: 0 },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      BetCreate: {
        type: 'object',
        required: ['entryId', 'amount'],
        properties: {
          entryId: { type: 'string', format: 'uuid', description: 'Заявка таракана, на которого ставим' },
          amount: { type: 'integer', minimum: 10, maximum: 500, example: 100, description: 'Лимиты задаются MIN_BET и MAX_BET' },
        },
      },
      Transaction: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          type: { type: 'string', enum: ['SIGNUP_BONUS', 'BET', 'BET_WIN', 'REFUND', 'RACER_PURCHASE', 'TRAINING', 'PRIZE'] },
          amount: { type: 'integer', example: -100 },
          balanceAfter: { type: 'integer', example: 900 },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      RaceResult: {
        type: 'object',
        properties: {
          raceId: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          seedHash: { type: 'string' },
          seed: { type: 'string' },
          standings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                position: { type: 'integer' },
                entryId: { type: 'string', format: 'uuid' },
                racer: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
                odds: { type: 'string', example: '2.50' },
                finishTime: { type: 'number', example: 61.4 },
              },
            },
          },
          commentary: { type: 'array', items: { type: 'string' }, example: ['Тик 0: Старт!', 'Тик 12: Усатый Пират делает рывок!'] },
          verification: {
            type: 'object',
            properties: {
              seedMatchesHash: { type: 'boolean', description: 'sha256(seed) совпадает с опубликованным seedHash' },
              replayMatches: { type: 'boolean', description: 'Повторная симуляция по seed даёт те же позиции' },
            },
          },
        },
      },
    },
  },
};