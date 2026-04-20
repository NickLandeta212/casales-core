function errorHandler(err, req, res, next) {
  if (err.code === '23505') {
    return res.status(409).json({ message: 'Registro duplicado' });
  }

  if (err.code === '23503') {
    return res.status(400).json({ message: 'Referencia invalida' });
  }

  if (err.code === '22P02') {
    return res.status(400).json({ message: 'Formato de dato invalido' });
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Error interno del servidor';

  if (statusCode >= 500) {
    console.error(err);
  }

  res.status(statusCode).json({ message });
}

module.exports = errorHandler;
