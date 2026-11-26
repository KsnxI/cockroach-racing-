module.exports = (err, req, res, next) => {
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({
    success: false,
    error: { message: status === 500 ? 'Internal server error' : err.message },
  });
};
