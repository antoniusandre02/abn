const pool = require('../../db');
const jwt = require('jsonwebtoken');

exports.verifyToken = (req, res, next) => {
    console.log("Session:", req.session);
    console.log("User Session:", req.session.user);
    const token = req.cookies.token;
    if (!token) return res.redirect('/login?msg=replaced');

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = req.session.user || decoded;
        next();
    } catch (err) {
        return res.redirect('/login?msg=expired');
    }
};

exports.checkRole = (allowedRoles = []) => {
    return (req, res, next) => {
        console.log("Role user:", req.user?.role);
        if (!req.user) return res.redirect('/login?msg=invalid');
        if (allowedRoles.includes(req.user.role)) return next();
        return res.status(403).render('unauthorized', {
            user: req.user
        });
    };
};


exports.verifySessionToken = async (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.redirect('/login?msg=replaced');

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const result = await pool.query(
            `SELECT session_token FROM user_accounts WHERE user_id = $1`,
            [decoded.user_id]
        );

        const sessionTokenFromDB = result.rows[0]?.session_token;
        const currentSessionToken = req.session?.token;

        if (!req.session || !req.session.user) {
            return res.redirect('/login?msg=replaced'); // ✅ aman
        }

        if (sessionTokenFromDB !== currentSessionToken) {
            console.log('Session mismatch, forcing logout...');
            req.session.destroy(() => {
                res.clearCookie('token');
                res.redirect('/login?msg=replaced'); // ← cek ini muncul di console log & browser
            });
            return;
        }


        req.user = req.session.user;
        next();
    } catch (err) {
        console.error(err);
        return res.redirect('/login?msg=expired');
    }
};