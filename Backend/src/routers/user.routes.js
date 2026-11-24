const { Router } = require('express');
const { wrapAll } = require('../utils/asyncHandler');
const userController = wrapAll(require('../controllers/user.controller'));
const { protect } = require('../middleware/auth.middleware');

const router = Router();

router.get('/', protect, userController.listUsers);

module.exports = router;
