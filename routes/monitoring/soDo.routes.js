// File: routes/monitorings/soDo.routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { checkRole, verifyToken } = require('../auth/auth.middleware');
const soDoController = require('./soDo.controller');

// Konfigurasi Multer untuk upload file CSV
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });


// GET Pages
router.get('/soDo', verifyToken, checkRole([1, 8, 10, 11, 12, 14, 16]), soDoController.getListPage);
router.get('/edit/:id', verifyToken, checkRole([1, 8, 10, 11, 12]), soDoController.getEditPage);
router.get('/view/:id', verifyToken, checkRole([1, 8, 10, 11, 12, 14, 16]), soDoController.getViewPage);
router.get('/upload', verifyToken, checkRole([1, 16]), soDoController.getUploadPage);
router.get('/detail/:id', verifyToken, checkRole([1,8]), soDoController.getDetailMonitoring);
router.get('/historyFinance', verifyToken, checkRole([1, 8]), soDoController.getHistoryCheck);
router.get('/soDo/export-csv', checkRole([1, 8, 10, 11, 12]), soDoController.exportCSV);
router.get('/soDo/get-barcode-file/:id', verifyToken, checkRole([1, 10, 11, 12, 16]), soDoController.getBarcodeLink);
router.get('/soDo/get-barcode-ewarranty/:id', verifyToken, checkRole([1, 10, 11, 12, 16]), soDoController.getManageEwarranty);
router.get('/soDo/get-barcodes/:id/:catalog',  verifyToken, checkRole([1, 16]), soDoController.getBarcodesByCatalog);


// POST Actions
router.post('/create', verifyToken, checkRole([1, 8, 10, 11, 12]), soDoController.createSO);
router.post('/update/:id_monitoring_data', verifyToken, checkRole([1, 8, 10, 11, 12]), soDoController.updateSO);
router.post('/upload', verifyToken, checkRole([1, 16]), upload.single('csvFile'), soDoController.uploadSO);
router.post('/invoice-export/:id', verifyToken, checkRole([1, 8]), soDoController.updateInvoicingDate);
router.post('/cancelDelete/:id_monitoring_data', verifyToken, checkRole([1, 8, 10, 11, 12]), soDoController.cancelDelete);
router.post('/soDo/extend-ewarranty/:id', verifyToken, checkRole([1]), soDoController.extendEwarrantyLink);
router.post('/soDo/extend-print', verifyToken, checkRole([1, 16]), soDoController.extendAndPrintBarcode);

module.exports = router;
