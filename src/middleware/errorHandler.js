module.exports = (err, req, res, next) => {
  let status = err.status || 500;
  let message = err.message;
  let details = err.details;


  if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Invalid JSON';
  }

  if (err.code === 'P2002') {
    status = 409;
    message = 'Resource already exists';
    details = err.meta && err.meta.target;
  }

  if (err.code === 'P2025') {
    status = 404;
    message = 'Resource not found';
  }

  if (status >= 500) {
    console.error(err);
    message = 'Internal server error';
    details = undefined;
  }

  res.status(status).json({ success: false, error: { message, details } });
};