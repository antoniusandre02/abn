const pool = require('../../db');

// =================== GET LIST ===================
exports.getKaryawan = async (req, res) => {
    try {
        const {
            search = '', filterDateStart = '', filterDateEnd = '', page = 1
        } = req.query;
        const limit = 100;
        const offset = (parseInt(page) - 1) * limit;
        const role = req.user?.role;
        const searchPattern = `%${search.trim()}%`;

        let filters = [];
        let values = [];

        if (search.trim()) {
            filters.push(`(
                k.nama_karyawan ILIKE $${values.length + 1} OR
                k.nomor_hp ILIKE $${values.length + 1} OR
                CAST(k.employee_id AS TEXT) ILIKE $${values.length + 1} OR
                k.email_karyawan ILIKE $${values.length + 1} OR
                dep.department_name ILIKE $${values.length + 1} OR
                d.name_division ILIKE $${values.length + 1}
            )`);
            values.push(searchPattern);
        }

        if (filterDateStart && filterDateEnd) {
            filters.push(`k.created_at BETWEEN $${values.length + 1} AND $${values.length + 2}`);
            values.push(filterDateStart, filterDateEnd);
        }

        const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

        const countRes = await pool.query(
            `SELECT COUNT(*) FROM karyawan k
            JOIN department dep ON dep.id_department = k.departemen_karyawan
            JOIN division d ON d.id_division = k.divisi_karyawan
            ${whereClause}`, values
        );

        const totalRows = parseInt(countRes.rows[0].count);
        const totalPages = Math.ceil(totalRows / limit);

        const dataRes = await pool.query(
            `SELECT * FROM karyawan k
            JOIN department dep ON dep.id_department = k.departemen_karyawan
            JOIN division d ON d.id_division = k.divisi_karyawan
            ${whereClause}
            ORDER BY k.id_karyawan DESC
            LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
                    [...values, limit, offset]
        );

        const optionDepartment = await pool.query('SELECT id_department, department_name FROM department');
        const optionDivision = await pool.query('SELECT id_division, name_division FROM division WHERE id_division BETWEEN 16 AND 23');

        res.render('karyawan', {
            data: dataRes.rows,
            role,
            optionDepartment: optionDepartment.rows,
            optionDivision: optionDivision.rows,
            currentPage: parseInt(page),
            totalPages,
            searchKeyword: search.trim(),
            filterDateStart,
            filterDateEnd
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Gagal mengambil data dari database');
    }
};

// =================== FORM EDIT ===================
exports.getKaryawanEdit = async (req, res) => {
    try {
        const id = req.params.id;
        const result = await pool.query(`
            SELECT * FROM karyawan k
            JOIN department dep ON k.departemen_karyawan = dep.id_department
            JOIN division d ON k.divisi_karyawan = d.id_division
            WHERE id_karyawan = $1`, [id]
        );

        if (!result.rows.length) return res.status(404).send('Data tidak ditemukan');

        const divisi = await pool.query('SELECT * FROM division');
        const departemen = await pool.query('SELECT * FROM department');
        const role = req.user?.role;

        res.render('karyawanEdit', {
            item: result.rows[0],
            role,
            divisi: divisi.rows,
            departemen: departemen.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Gagal mengambil data dari database');
    }
};

// =================== CREATE ===================
exports.createKaryawan = async (req, res) => {
    const {
        employee_id,
        nama_karyawan,
        nomor_hp,
        email_karyawan,
        divisi_karyawan,
        departemen_karyawan
    } = req.body;

    const user_id = req.session.user?.user_id;
    if (!user_id) {
        req.flash('errorMessage', 'Session user tidak ditemukan.');
        return res.redirect('/karyawan');
    }

    try {
        const cek = await pool.query('SELECT * FROM karyawan WHERE employee_id = $1', [employee_id]);
        if (cek.rows.length > 0) {
            req.flash('errorMessage', 'Karyawan sudah ada.');
            return res.redirect('/karyawan');
        }

        await pool.query(`
            INSERT INTO karyawan (
                nama_karyawan, is_resign, created_at, user_id,
                nomor_hp, email_karyawan, divisi_karyawan,
                departemen_karyawan, employee_id
            ) VALUES ($1, false, NOW(), $2, $3, $4, $5, $6, $7)
        `, [nama_karyawan, user_id, nomor_hp, email_karyawan, divisi_karyawan, departemen_karyawan, employee_id]);

        req.flash('successMessage', 'Karyawan berhasil ditambahkan.');
        res.redirect('/karyawan');
    } catch (err) {
        console.error(err);
        req.flash('errorMessage', 'Gagal tambah karyawan.');
        res.redirect('/karyawan');
    }
};

// =================== UPDATE ===================
exports.updateKaryawan = async (req, res) => {
    const {
        id
    } = req.params;
    const {
        employee_id,
        nama_karyawan,
        nomor_hp,
        email_karyawan,
        divisi_karyawan,
        departemen_karyawan,
        is_resign
    } = req.body;

    const user_id = req.session.user?.user_id;

    try {
        await pool.query(`
            UPDATE karyawan SET
                employee_id = $1,
                nama_karyawan = $2,
                nomor_hp = $3,
                email_karyawan = $4,
                divisi_karyawan = $5,
                departemen_karyawan = $6,
                user_id = $7,
                is_resign = $8,
                updated_at = NOW()
            WHERE id_karyawan = $9
            `, [employee_id, nama_karyawan, nomor_hp, email_karyawan,
                    divisi_karyawan, departemen_karyawan, user_id, is_resign, id
        ]);

        req.flash('successMessage', 'Data Karyawan berhasil diperbarui.');
        res.redirect('/karyawan');
    } catch (err) {
        console.error(err);
        req.flash('errorMessage', 'Gagal update data karyawan.');
        res.redirect('/karyawan');
    }
};