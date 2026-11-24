const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { wrapAll } = require('../utils/asyncHandler');
const authController = wrapAll(require('../controllers/auth.controller'));
const { protect } = require('../middleware/auth.middleware');

const router = Router();

// Slow down password guessing / mass sign-ups from one IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT) || 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in a few minutes.' },
});

router.post('/register', authLimiter, authController.userRegister);
router.post('/login', authLimiter, authController.userLogin);
router.post('/logout', authController.userLogout);
router.get('/me', protect, authController.getMe);

module.exports = router;
