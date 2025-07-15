// routes/assets/asset.routes.js
const express = require('express');
const router = express.Router();
const pengajuanMemoController = require('./pengajuanMemo.controller');
const { checkRole, verifyToken } = require('../auth/auth.middleware');

// GET pages
router.get('/pengajuanMemo', checkRole([1, 13]), pengajuanMemoController.getMemoListPage);
router.get('/pengajuanMemoEdit/:id_memo', checkRole([1, 13]), pengajuanMemoController.getMemoEditForm);
router.get('/pengajuanMemoView/:id_memo', checkRole([1, 13]),  pengajuanMemoController.getMemoView);
router.get('/pengajuanMemo/approve/:id_memo', checkRole([1, 13]), pengajuanMemoController.approveMemo);
router.get('/pengajuanMemo/rejectMemo/:id_memo', checkRole([1, 13]), pengajuanMemoController.getRejectMemo);
router.get('/pengajuanMemo/printApproved/:id_memo', checkRole([1, 13]), pengajuanMemoController.printApprovedMemo);
router.get('/pengajuanMemo/downloadRejected/:id_memo', checkRole([1, 13]), pengajuanMemoController.downloadRejectedMemo);
router.get('/confirmMemo', pengajuanMemoController.getConfirmMemo);
router.get('/validationMemo', pengajuanMemoController.getValidationMemo);

// POST actions
router.post('/createPengajuanMemo', checkRole([1, 13]), pengajuanMemoController.createMemo);
router.post('/pengajuanMemo/update/:id_memo', checkRole([1, 13]), pengajuanMemoController.updateMemo);
router.post('/pengajuanMemo/printAndSend/:id_memo', checkRole([1, 13]), pengajuanMemoController.printAndSend);
router.post('/pengajuanMemo/reject/:id_memo', checkRole([1, 13]), pengajuanMemoController.rejectMemo);

module.exports = router;
