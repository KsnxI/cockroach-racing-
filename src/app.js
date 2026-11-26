require('./config');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const errorHandler = require('./middleware/errorHandler');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ success: true, data: { status: 'ok' } }));

app.use((req, res) => res.status(404).json({ success: false, error: { message: 'Not found' } }));
app.use(errorHandler);

module.exports = app;
