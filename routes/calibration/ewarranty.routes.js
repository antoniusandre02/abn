// File: routes/monitorings/soDo.routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const {
    checkRole,
    verifyToken
} = require('../auth/auth.middleware');
const ewarrantyController = require('./ewarranty.controller');

// GET Pages
router.get('/', verifyToken, checkRole([1, 15]), ewarrantyController.getCertificateListPage, async (req, res) => {
    try {
        const data = await pool.query('SELECT * FROM ewarranty');

        res.render('eWarrantyList', {
            data: data.rows,
            toastSuccess: req.flash('toastSuccess')[0],
            toastError: req.flash('toastError')[0]
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});
router.get('/registerAdmin', verifyToken, checkRole([1, 15]), ewarrantyController.getEwarrantyRegisterView);
router.get('/templateAdmin', verifyToken, checkRole([1, 15]), ewarrantyController.getEwarrantyTemplateView);
router.get('/register/:jwt/:encoded', ewarrantyController.verifyLink);
router.get('/editEwarrantyView/:id', verifyToken, checkRole([1, 15]), ewarrantyController.getEditEwarrantyPage);
router.get('/approveEwarrantyView/:id', verifyToken, checkRole([1, 15]), ewarrantyController.getApproveEwarrantyPage);
router.get('/view-receipt/:filename', verifyToken, checkRole([1, 15]), ewarrantyController.viewReceiptFile);
router.get('/print/:id', verifyToken, checkRole([1, 15]), ewarrantyController.printPDF);

//POST Pages
router.post('/createEwarranty', ewarrantyController.createEwarranty);
router.post('/approveEwarranty/:id', verifyToken, checkRole([1, 15]), ewarrantyController.approveEwarranty);
router.post('/editEwarranty/:id', verifyToken, checkRole([1, 15]), ewarrantyController.editEWarranty);

module.exports = router;