// File: routes/users/users.controller.js
const pool = require('../../db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

exports.getCreateAccounts = async (req, res) => {
    try {
        const optionRoleAccountsResult = await pool.query('SELECT id_role, role_name FROM role_accounts');
        const userAccountsResult = await pool.query('SELECT name, email, password, id, id_role, user_id, created_at, updated_at FROM user_accounts WHERE is_deleted = false');

        const optionRoleAccounts = optionRoleAccountsResult.rows;
        const listUserAccountsRaw = userAccountsResult.rows;

        const listUserAccounts = listUserAccountsRaw.map(user => {
            const role = optionRoleAccounts.find(r => r.id_role === user.id_role);
            return {
                ...user,
                role_name: role ? role.role_name : 'Unknown'
            };
        });

        res.render('createAccounts', {
            user: req.user, // Tambahkan ini agar `user` tersedia di sidebar
            optionRoleAccounts,
            listUserAccounts
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Gagal mengambil data dari database');
    }
};

exports.getEditAccount = async (req, res) => {
    try {
        const {
            id
        } = req.params;

        const optionRoleAccountsResult = await pool.query('SELECT id_role, role_name FROM role_accounts');
        const itemResult = await pool.query(`
            SELECT * FROM user_accounts 
            JOIN role_accounts ON user_accounts.id_role = role_accounts.id_role 
            WHERE user_accounts.id = $1
        `, [id]);

        const item = itemResult.rows[0];
        const optionRoleAccounts = optionRoleAccountsResult.rows;

        res.render('editAccounts', {
            user: req.user, // tambahkan ini
            item,
            optionRoleAccounts
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Gagal mengambil data dari database');
    }
};

exports.postRegister = async (req, res) => {
    const {
        name,
        email,
        password,
        id_role
    } = req.body;
    try {
        const emailCheck = await pool.query("SELECT * FROM user_accounts WHERE email = $1 and is_deleted = false", [email]);

        if (emailCheck.rows.length > 0) {
            return res.status(409).json({
                message: 'Email sudah terdaftar, silakan gunakan email lain.'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const hashedUserId = crypto.randomBytes(16).toString('hex');

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
};

exports.postEditAccount = async (req, res) => {
    const {
        id
    } = req.params;
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
};

exports.postDeleteAccount = async (req, res) => {
    const {
        id
    } = req.params;

    try {
        await pool.query('UPDATE user_accounts SET is_deleted = true WHERE id = $1', [id]);
        req.flash('successMessage', '✅ User berhasil dihapus');
        res.redirect('/createAccounts');
    } catch (err) {
        console.error(err);
        req.flash('errorMessage', '❌ Gagal menghapus user');
        res.redirect('/createAccounts');
    }
};