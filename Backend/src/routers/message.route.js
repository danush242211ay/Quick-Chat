const { Router } = require('express');
const { wrapAll } = require('../utils/asyncHandler');
const messageController = wrapAll(require('../controllers/message.controller'));
const { protect } = require('../middleware/auth.middleware');

const router = Router();

// Every message route requires a logged-in user.
router.use(protect);

router.post('/send', messageController.sendMessage);
router.get('/inbox', messageController.getInbox);
router.get('/sent', messageController.getSentMessages);
router.get('/conversations', messageController.getConversations);
router.get('/conversation/:userId', messageController.getConversation);
router.patch('/read/:userId', messageController.markRead);
router.delete('/:messageId', messageController.deleteMessage);

module.exports = router;
