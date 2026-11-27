require('./config');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const errorHandler = require('./middleware/errorHandler');
const { ApiError } = require('./utils/errors');

const app = express();

app.use('/api/docs.json', (req, res) => res.json(swaggerSpec));
app.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Cockroach Racing API',
    swaggerOptions: { persistAuthorization: true },
  })
);

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ success: true, data: { status: 'ok' } }));

app.use('/auth', require('./routes/auth'));
app.use('/racers', require('./routes/racers'));
app.use('/races', require('./routes/races'));
app.use('/bets', require('./routes/bets'));
app.use('/me', require('./routes/me'));
app.use('/stats', require('./routes/stats'));

app.use((req, res, next) => next(new ApiError(404, 'Route not found')));
app.use(errorHandler);

module.exports = app;