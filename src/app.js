require('./config');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const errorHandler = require('./middleware/errorHandler');
const { ApiError } = require('./utils/errors');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ success: true, data: { status: 'ok' } }));

app.use('/auth', require('./routes/auth'));

app.use((req, res, next) => next(new ApiError(404, 'Route not found')));
app.use(errorHandler);

module.exports = app;