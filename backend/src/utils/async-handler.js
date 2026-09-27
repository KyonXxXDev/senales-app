/**
 * Envuelve controladores y middlewares asíncronos de Express
 * para capturar excepciones automáticamente y enviarlas a next(err).
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export const ah = asyncHandler;

export default asyncHandler;

