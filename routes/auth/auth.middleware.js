const pool = require('../../db');
const jwt = require('jsonwebtoken');

exports.verifyToken = (req, res, next) => {
    const publicPatterns = [
        /^\/ewarranty\/register/i,       // semua URL mulai /ewarranty/register
        /^\/ewarranty\/createEwarranty$/i
    ];

    if (publicPatterns.some(p => p.test(req.originalUrl.toLowerCase()))) {
        return next();
    }

    const token = req.cookies.token;
    
    if (!token) {
        return res.redirect('/login?msg=replaced');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = req.session?.user || decoded;
        next();
    } catch (err) {
        console.error('[verifyToken] JWT Error:', err.message);
        return res.redirect('/login?msg=expired');
    }
};

exports.checkRole = (allowedRoles = []) => {
    return (req, res, next) => {
        if (!req.user) return res.redirect('/login?msg=invalid');
        if (allowedRoles.includes(req.user.role)) return next();
        return res.status(403).render('unauthorized', {
            user: req.user
        });
    };
};

exports.verifySessionToken = async (req, res, next) => {
    const publicPaths = ['/ewarranty/register', '/ewarranty/createEwarranty'];
    const url = req.originalUrl.toLowerCase();

    const isPublic = publicPaths.some(path => url.startsWith(path));
    if (isPublic) return next(); // ✅ lewati jika publik

    const token = req.cookies.token;
    if (!token) return res.redirect('/login?msg=invalid');
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const result = await pool.query(
            `SELECT session_token FROM user_accounts WHERE user_id = $1`,
            [decoded.user_id]
        );

        const sessionTokenFromDB = result.rows[0]?.session_token;
        const currentSessionToken = req.session?.token;

        if (!req.session || !req.session.user) {
            return res.redirect('/login?msg=invalid');
        }

        if (sessionTokenFromDB !== currentSessionToken) {
            console.log('Session mismatch, forcing logout...');
            req.session.destroy(() => {
                res.clearCookie('token');
                res.redirect('/login?msg=replaced');
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