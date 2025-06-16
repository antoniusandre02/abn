const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const {
    response
} = require('../app');

// GET Register Page
router.get('/register', async (req, res) => {
    const result = await pool.query("SELECT * FROM public.role_accounts WHERE id_role != 1 ORDER BY id_role");
    res.render('register', {
        roles: result.rows
    });
});

// POST Register
router.post('/api/register', async (req, res) => {
    const {
        name,
        email,
        password,
        id_role
    } = req.body;
    try {
        // Check if email already exists
        const emailCheck = await pool.query(
            "SELECT * FROM user_accounts WHERE email = $1 and is_deleted = false", [email]
        );

        if (emailCheck.rows.length > 0) {
            return res.status(409).json({
                message: 'Email sudah terdaftar, silakan gunakan email lain.'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const hashedUserId = await crypto.randomBytes(16).toString('hex');

        await pool.query(
            "INSERT INTO user_accounts (name, email, password, id_role, created_at, user_id, is_deleted) VALUES ($1, $2, $3, $4, $5, $6, $7)",
            [name, email, hashedPassword, id_role, new Date(), hashedUserId, false]
        );
        req.flash('successMessage', '✅ Akun berhasil dibuat');
        res.redirect('/createAccounts');
    } catch (err) {
        console.error(err);
        req.flash('errorMessage', '❌ Gagal membuat akun');
        res.redirect('/createAccounts');
    }
});

// post login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    const userQuery = `
        SELECT u.*, r.role_name 
        FROM user_accounts u 
        JOIN role_accounts r ON u.id_role = r.id_role 
        WHERE u.email = $1
    `;

    try {
        const userResult = await pool.query(userQuery, [email]);
        if (userResult.rows.length === 0) {
            req.flash('errorMessage', 'User tidak ditemukan');
            return res.redirect('/login');
        }

        const user = userResult.rows[0];

        if (user.is_deleted) {
            req.flash('errorMessage', 'Akun ini sudah tidak aktif. Hubungi admin.');
            return res.redirect('/login');
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            req.flash('errorMessage', 'Password salah');
            return res.redirect('/login');
        }

        req.session.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.id_role,
            role_name: user.role_name,
            user_id: user.user_id,
            is_deleted: user.is_deleted
        };

        try {
        await pool.query(
            `INSERT INTO log_user_login (name, role_name, login_at, user_id)
            VALUES ($1, $2, NOW(), $3)`,
            [user.name, user.role_name, user.user_id]
        );
        console.log(`✅ Login log created for ${user.name}`);
        } catch (logErr) {
        console.error('❌ Gagal menyimpan log login:', logErr);
        }

        // Arahkan ke /karyawan jika role-nya adalah 13 (IT)
        if (req.session.user.role === 13) {
            return res.redirect('/karyawan');
        }
        
        res.redirect('/dashboard');
        
    } catch (error) {
        console.error(error);
        req.flash('errorMessage', 'Terjadi kesalahan saat login');
        res.redirect('/login');
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

router.post('/auth/delete/:id', async (req, res) => {
    const userId = req.params.id;

    try {
        await pool.query('UPDATE user_accounts SET is_deleted = true WHERE id = $1', [userId]);
        req.flash('successMessage', '✅ User berhasil dihapus');
        res.redirect('/createAccounts');
    } catch (err) {
        console.error(err);
        req.flash('errorMessage', '❌ Gagal menghapus user');
        res.redirect('/createAccounts');
    }
});

router.post('/auth/edit/:id', async (req, res) => {
    const { id } = req.params;
    const {
        name,
        email,
        password,
        id_role,
        is_deleted
    } = req.body;

    try {
        let query, values;

        if (password && password.trim() !== '') {
            const hashedPassword = await bcrypt.hash(password, 10);
            query = `
        UPDATE user_accounts 
        SET name = $1, email = $2, password = $3, id_role = $4, is_deleted = $5, updated_at = NOW() 
        WHERE id = $6
        `;
            values = [name, email, hashedPassword, id_role, is_deleted === 'true', id];
        } else {
            query = `
        UPDATE user_accounts 
        SET name = $1, email = $2, id_role = $3, is_deleted = $4, updated_at = NOW() 
        WHERE id = $5
        `;
            values = [name, email, id_role, is_deleted === 'true', id];
        }

        await pool.query(query, values);
        req.flash('successMessage', 'Akun berhasil diperbarui');
        res.redirect('/createAccounts');

    } catch (err) {
        console.error(err);
        req.flash('errorMessage', 'Gagal memperbarui akun');
        res.redirect(`/editAccounts/${id}`);
    }
});


module.exports = router;