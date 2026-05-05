const express = require('express');
const router = express.Router();
const guardiansController = require('../controllers/guardians.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { staffOnly, adminOnly } = require('../middleware/role.middleware');

// All routes require authentication
router.use(authenticate);
router.use(staffOnly);

// CRUD operations
router.post('/', adminOnly, guardiansController.create);
router.get('/', guardiansController.list);
router.get('/search/cnic/:cnic', guardiansController.searchByCnic);
router.get('/:id', guardiansController.getById);
router.put('/:id', adminOnly, guardiansController.update);
router.delete('/:id', adminOnly, guardiansController.delete);

module.exports = router;
