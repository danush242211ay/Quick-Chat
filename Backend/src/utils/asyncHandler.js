// Express 4 does not catch errors thrown inside async route handlers (the server would crash
// with an unhandled rejection). This wraps handlers so any error goes to the error middleware.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const wrapAll = (controller) =>
  Object.fromEntries(Object.entries(controller).map(([name, fn]) => [name, wrap(fn)]));

module.exports = { wrap, wrapAll };
