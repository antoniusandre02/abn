// File: routes/monitorings/soDo.routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const {
    checkRole,
    verifyToken
} = require('../auth/auth.middleware');
const pipetteCalibrationController = require('./pipetteCalibration.controller');

// GET Pages
router.get('/', verifyToken, checkRole([1, 17, 18]), pipetteCalibrationController.getPipetteListPage);
router.get('/calibrationForm', verifyToken, checkRole([1, 17, 18]), pipetteCalibrationController.getPipetteForm);
router.get('/calibrationEdit/:id', verifyToken, checkRole([1, 18]), pipetteCalibrationController.getEditPipettePage);
router.get('/calibrationView/:id', verifyToken, checkRole([1, 17, 18]), pipetteCalibrationController.getViewPipettePage);
router.get('/print/:id', verifyToken, checkRole([1, 17, 18]), pipetteCalibrationController.getPrintPipettePage);

//POST Pages
router.post('/createPipetteCalibration', verifyToken, checkRole([1, 17, 18]), pipetteCalibrationController.createPipetteCalibration);
router.post('/editPipetteCalibration', verifyToken, checkRole([1, 18]), pipetteCalibrationController.editPipetteCalibration);
// router.post('/editEwarranty/:id', verifyToken, checkRole([1, 17]), pipetteCalibrationController.editEWarranty);

module.exports = router;