const express = require('express');
const router = express.Router();
const {
    checkRole,
    verifyToken
} = require('../auth/auth.middleware');

const {
    getCreateAccounts,
    getEditAccount,
    postRegister,
    postEditAccount,
    postDeleteAccount
} = require('./user.controller');

router.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

router.get('/createAccounts', verifyToken, checkRole([1, 13]), getCreateAccounts);
router.get('/editAccounts/:id', verifyToken, checkRole([1]), getEditAccount);
router.post('/api/register', verifyToken, checkRole([1]), postRegister);
router.post('/auth/edit/:id', verifyToken, checkRole([1]), postEditAccount);
router.post('/auth/delete/:id', verifyToken, checkRole([1]), postDeleteAccount);

module.exports = router;