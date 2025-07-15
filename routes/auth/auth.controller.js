const pool = require('../../db');
const bcrypt = require('bcryptjs');
const {
    generateToken
} = require('../../utils/jwt');
const crypto = require('crypto');

exports.login = async (req, res) => {
    const {
        email,
        password
    } = req.body;

    try {
        const result = await pool.query(`
            SELECT u.*, r.role_name 
            FROM user_accounts u 
            JOIN role_accounts r ON u.id_role = r.id_role 
            WHERE u.email = $1
        `, [email]);

        const user = result.rows[0];
        if (!user || user.is_deleted) {
            req.flash('errorMessage', 'User tidak ditemukan atau akun nonaktif.');
            return res.redirect('/login');
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            req.flash('errorMessage', 'Password salah');
            return res.redirect('/login');
        }

        const token = generateToken(user);
        const sessionToken = crypto.randomUUID();

        res.cookie('token', token, {
            httpOnly: true,
            maxAge: 86400000
        });

        req.session.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.id_role,
            role_name: user.role_name,
            user_id: user.user_id,
            is_deleted: user.is_deleted
        };
        req.session.token = sessionToken;

        await pool.query(`
            UPDATE user_accounts
            SET session_token = $1
            WHERE user_id = $2
        `, [sessionToken, user.user_id]);

        await pool.query(`
            INSERT INTO log_user_login (name, role_name, login_at, user_id)
            VALUES ($1, $2, NOW(), $3)
        `, [user.name, user.role_name, user.user_id]);

        if (user.id_role === 13) return res.redirect('/karyawan');
        req.flash('successMessageLogin', 'Berhasil login sebagai ' + user.name);
        return res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        req.flash('errorMessage', 'Login error');
        res.redirect('/login');
    }
};

exports.logout = async (req, res) => {
    const userId = req.session?.user?.user_id;

    if (userId) {
        await pool.query(`UPDATE user_accounts SET session_token = NULL WHERE user_id = $1`, [userId]);
    }

    req.session.destroy(() => {
        res.clearCookie('token');
        res.redirect('/login');
    });
};