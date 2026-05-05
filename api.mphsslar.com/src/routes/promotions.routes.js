const express = require('express');
const router = express.Router();
const promotionsController = require('../controllers/promotions.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { staffOnly, adminOnly } = require('../middleware/role.middleware');

router.use(authenticate);
router.use(staffOnly);
router.use(adminOnly);

router.post('/full-school', promotionsController.fullSchoolPromotion);
router.post('/full-college', promotionsController.fullCollegePromotion);
router.post('/class', promotionsController.classPromotion);
router.get('/history', promotionsController.history);
router.post('/:id/undo', promotionsController.undo);
router.get('/ex-classes', promotionsController.listExClasses);
router.get('/ex-classes/:batchId', promotionsController.getExClassBatch);

module.exports = router;
