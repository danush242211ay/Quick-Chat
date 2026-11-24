// Strict check for a 24-char hex MongoDB ObjectId string.
const isId = (value) => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
module.exports = { isId };
