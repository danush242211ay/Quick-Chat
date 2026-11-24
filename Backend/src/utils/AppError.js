// An error whose message is safe to show to the client.
class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}
module.exports = AppError;
