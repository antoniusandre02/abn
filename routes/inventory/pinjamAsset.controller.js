const pool = require('../../db');
const PDFDocument = require('pdfkit');

// ================= GET list peminjaman =================
exports.getPinjamAssetList = async (req, res) => {
    try {
        const {
            search = '', filterDateStart = '', filterDateEnd = '', page = 1
        } = req.query;
        const limit = 100;
        const offset = (parseInt(page) - 1) * limit;
        const role = req.user?.role;

        const searchPattern = `%${search.trim()}%`;
        let filterConditions = [];
        let filterValues = [];

        if (search.trim()) {
            filterConditions.push(`(
                k.nama_karyawan ILIKE $${filterValues.length + 1} OR
                CAST(k.employee_id AS TEXT) ILIKE $${filterValues.length + 1} OR
                a.kode_asset ILIKE $${filterValues.length + 1}
        )`);
            filterValues.push(searchPattern);
        }

        if (filterDateStart && filterDateEnd) {
            filterConditions.push(`pa.created_at BETWEEN $${filterValues.length + 1} AND $${filterValues.length + 2}`);
            filterValues.push(filterDateStart, filterDateEnd);
        }

        const whereClause = filterConditions.length ? `WHERE ${filterConditions.join(' AND ')}` : '';

        const countResult = await pool.query(`
            SELECT COUNT(DISTINCT pa.id_pinjam_asset) AS total
            FROM pinjam_asset pa
            JOIN detail_pinjam_asset dpa ON pa.id_pinjam_asset = dpa.id_pinjam_asset
            JOIN asset a ON dpa.id_asset = a.id_asset
            JOIN karyawan k ON dpa.id_karyawan = k.id_karyawan
            JOIN division d ON k.divisi_karyawan = d.id_division
            JOIN department dep ON k.departemen_karyawan = dep.id_department
        ${whereClause}`, filterValues);

        const totalRows = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(totalRows / limit);

        const dataQuery = `
            SELECT pa.id_pinjam_asset,
                k.id_karyawan,
                k.nama_karyawan,
                k.employee_id,
                k.nomor_hp,
                k.email_karyawan,
                dep.department_name,
                d.name_division,
                COUNT(DISTINCT(dpa.id_asset)) AS jumlah_asset,
                CASE
                    WHEN COUNT(DISTINCT(dpa.id_asset)) = 1 THEN MIN(a.kode_asset)
                    ELSE STRING_AGG(DISTINCT(a.kode_asset), ', ' ORDER BY a.kode_asset)
                END AS daftar_kode_asset,
                dpa.tanggal_pengembalian
            FROM pinjam_asset pa
            JOIN detail_pinjam_asset dpa ON pa.id_pinjam_asset = dpa.id_pinjam_asset
            JOIN asset a ON dpa.id_asset = a.id_asset
            JOIN karyawan k ON dpa.id_karyawan = k.id_karyawan
            JOIN division d ON k.divisi_karyawan = d.id_division
            JOIN department dep ON k.departemen_karyawan = dep.id_department
            ${whereClause}
            GROUP BY pa.id_pinjam_asset, k.id_karyawan, dep.department_name, d.name_division, dpa.tanggal_pengembalian
            ORDER BY k.nama_karyawan ASC
            LIMIT $${filterValues.length + 1} OFFSET $${filterValues.length + 2}
        `;

        const dataValues = [...filterValues, limit, offset];
        const result = await pool.query(dataQuery, dataValues);

        const [optionAsset, optionKaryawan] = await Promise.all([
            pool.query(`SELECT * FROM asset WHERE status_asset = 'TERSEDIA'`),
            pool.query(`
                SELECT k.*, d.name_division, dep.department_name
                FROM karyawan k
                JOIN division d ON k.divisi_karyawan = d.id_division
                JOIN department dep ON k.departemen_karyawan = dep.id_department
                WHERE d.id_division BETWEEN 16 AND 23 AND is_resign = false`)
        ]);

        res.render('pinjamAsset', {
            data: result.rows,
            role,
            optionAsset: optionAsset.rows,
            optionKaryawan: optionKaryawan.rows,
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

// ================= GET form edit peminjaman =================
exports.getPinjamAssetEdit = async (req, res) => {
    const {
        id
    } = req.params;
    try {
        const result = await pool.query(`
            SELECT *
            FROM (
                SELECT pa.id_pinjam_asset, a.id_asset, a.kode_asset, a.nama_asset, a.sn_asset, a.brand_asset, a.tahun_pembelian, ja.jenis_asset, dpa.tanggal_peminjaman, dpa.tanggal_pengembalian, pa.notes,
                    k.nama_karyawan, k.email_karyawan, d.name_division, dep.department_name,
                    ROW_NUMBER() OVER (PARTITION BY dpa.id_asset ORDER BY dpa.id_detail_pinjam_asset) AS rn
                FROM pinjam_asset pa
                JOIN detail_pinjam_asset dpa ON pa.id_pinjam_asset = dpa.id_pinjam_asset
                JOIN asset a ON dpa.id_asset = a.id_asset
                JOIN jenis_asset ja ON a.jenis_asset = ja.id_jenis_asset
                JOIN karyawan k ON dpa.id_karyawan = k.id_karyawan
                JOIN division d ON k.divisi_karyawan = d.id_division
                JOIN department dep ON k.departemen_karyawan = dep.id_department
                WHERE pa.id_pinjam_asset = $1
            ) sub
            WHERE rn = 1`, [id]
        );

        if (!result.rows.length) return res.status(404).send('Data tidak ditemukan');

        const item = result.rows[0];
        const itemAssets = result.rows.map(row => ({
            kode_asset: row.kode_asset,
            nama_asset: row.nama_asset,
            sn_asset: row.sn_asset,
            brand_asset: row.brand_asset,
            tahun_pembelian: row.tahun_pembelian,
            jenis_asset: row.jenis_asset
        }));

        const [assetList, karyawanList] = await Promise.all([
            pool.query(`SELECT id_asset, kode_asset, nama_asset, sn_asset FROM asset WHERE status_asset = 'TERSEDIA'`),
            pool.query(`SELECT id_karyawan, nama_karyawan FROM karyawan WHERE is_resign = false`)
        ]);

        res.render('pinjamAssetEdit', {
            item,
            itemAssets,
            optionAsset: assetList.rows,
            optionKaryawan: karyawanList.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Gagal memuat data edit');
    }
};

// ================= GET karyawan detail =================
exports.getKaryawanInfo = async (req, res) => {
    const {
        id
    } = req.params;
    try {
        const result = await pool.query(`
            SELECT * FROM karyawan k
            JOIN division d ON k.divisi_karyawan = d.id_division
            JOIN department dep ON k.departemen_karyawan = dep.id_department
            WHERE id_karyawan = $1`, [id]
        );

        if (!result.rows.length) return res.status(404).json({
            error: 'Karyawan tidak ditemukan'
        });

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({
            error: 'Terjadi kesalahan pada server'
        });
    }
};

// ================= POST create pinjam =================
exports.createPinjamAsset = async (req, res) => {
    const {
        id_karyawan,
        tanggal_pinjam,
        notes,
        tempAssets
    } = req.body;

    const user = req.session.user;
    const user_id = user.user_id;
    const role_name = user.role_name;
    const name = user.name;

    const assets = JSON.parse(tempAssets);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Ambil nama karyawan
        const karyawanRes = await client.query(`SELECT nama_karyawan FROM karyawan WHERE id_karyawan = $1`, [id_karyawan]);
        const nama_karyawan = karyawanRes.rows[0]?.nama_karyawan || 'Unknown';

        // Insert ke pinjam_asset
        const insertHeader = await client.query(`
            INSERT INTO pinjam_asset (notes, created_at, updated_at)
            VALUES ($1, NOW(), NOW())
            RETURNING id_pinjam_asset
        `, [notes]);
        const id_pinjam_asset = insertHeader.rows[0].id_pinjam_asset;

        // Insert detail dan update asset
        for (let asset of assets) {
            await client.query(`
                INSERT INTO detail_pinjam_asset (id_asset, id_karyawan, tanggal_peminjaman, user_id, created_at, updated_at, id_pinjam_asset)
                VALUES ($1, $2, $3, $4, NOW(), NOW(), $5)
            `, [
                asset.id_asset, id_karyawan, tanggal_pinjam, user_id, id_pinjam_asset
            ]);

            await client.query(`
                UPDATE asset SET status_asset = 'DIPINJAM' WHERE id_asset = $1
            `, [asset.id_asset]);
        }

        // Insert ke log_pinjam_asset
        await client.query(`
            INSERT INTO log_pinjam_asset (user_id, role_name, name, nama_karyawan, keterangan, created_at, id_pinjam_asset)
            VALUES ($1, $2, $3, $4, $5, NOW(), $6)
        `, [
            user_id, role_name, name, nama_karyawan, 'Pinjam Asset Created', id_pinjam_asset
        ]);

        await client.query('COMMIT');
        req.flash('successMessage', 'Pinjaman asset berhasil disimpan');
        res.redirect('/pinjamAsset');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        req.flash('errorMessage', 'Gagal menyimpan pinjaman asset');
        res.redirect('/pinjamAsset');
    } finally {
        client.release();
    }
};


// ================= POST update pinjam =================
exports.updatePinjamAsset = async (req, res) => {
    const {
        id_pinjam_asset,
        tanggal_kembali
    } = req.body;
    
    const user = req.session.user;
    const user_id = user?.user_id;
    const role_name = user?.role_name;
    const name = user?.name;

    try {
        const assetIdsRes = await pool.query(`
            SELECT id_asset, id_karyawan FROM detail_pinjam_asset WHERE id_pinjam_asset = $1
        `, [id_pinjam_asset]);

        const assetIds = assetIdsRes.rows.map(row => row.id_asset);
        const id_karyawan = assetIdsRes.rows[0]?.id_karyawan;

        if (!assetIds.length) return res.status(400).send('Tidak ada asset terkait');

        // Ambil nama karyawan
        const karyawanRes = await pool.query(`SELECT nama_karyawan FROM karyawan WHERE id_karyawan = $1`, [id_karyawan]);
        const nama_karyawan = karyawanRes.rows[0]?.nama_karyawan || 'Unknown';

        // Update status asset
        await pool.query(`
            UPDATE asset
            SET status_asset = 'TERSEDIA',
                updated_at = NOW(),
                user_id = $1
            WHERE id_asset = ANY($2::int[])
        `, [user_id, assetIds]);

        // Update detail pinjam
        await pool.query(`
            UPDATE detail_pinjam_asset
            SET tanggal_pengembalian = $1,
                updated_at = NOW(),
                user_id = $2
            WHERE id_pinjam_asset = $3
        `, [tanggal_kembali || null, user_id, id_pinjam_asset]);

        // Insert ke log
        await pool.query(`
            INSERT INTO log_pinjam_asset (user_id, role_name, name, nama_karyawan, keterangan, created_at, id_pinjam_asset)
            VALUES ($1, $2, $3, $4, $5, NOW(), $6)
        `, [
            user_id,
            role_name,
            name,
            nama_karyawan,
            'Pinjam Asset Updated',
            id_pinjam_asset
        ]);

        req.flash('successMessage', 'Asset sudah dikembalikan');
        res.redirect('/pinjamAsset');

    } catch (err) {
        console.error('Gagal update pinjam asset:', err);
        req.flash('errorMessage', 'Gagal update pinjam asset');
        res.status(500).send('Gagal update pinjam asset.');
    }
};


// ================= GET form cetak =================
exports.printFormPeminjaman = async (req, res) => {
    const {
        id
    } = req.params;
    try {
        const result = await pool.query(`
            SELECT dpa.id_pinjam_asset, k.*, dep.department_name, d.name_division, 
                    a.kode_asset, a.nama_asset, a.sn_asset, a.status_asset, 
                    a.brand_asset, a.tahun_pembelian, pa.notes, 
                    dpa.tanggal_peminjaman, dpa.tanggal_pengembalian, 
                    ja.jenis_asset
            FROM pinjam_asset pa
            JOIN detail_pinjam_asset dpa ON pa.id_pinjam_asset = dpa.id_pinjam_asset
            JOIN asset a ON dpa.id_asset = a.id_asset
            JOIN jenis_asset ja ON a.jenis_asset = ja.id_jenis_asset
            JOIN karyawan k ON dpa.id_karyawan = k.id_karyawan
            JOIN division d ON k.divisi_karyawan = d.id_division
            JOIN department dep ON k.departemen_karyawan = dep.id_department
            WHERE dpa.id_pinjam_asset = $1`, [id]
        );

        if (!result.rows.length) return res.status(404).json({
            error: 'Data tidak ditemukan'
        });

        const item = {
            ...result.rows[0],
            itemAssets: result.rows.map(row => ({
                kode_asset: row.kode_asset,
                nama_asset: row.nama_asset,
                sn_asset: row.sn_asset,
                brand_asset: row.brand_asset,
                tahun_pembelian: row.tahun_pembelian,
                jenis_asset: row.jenis_asset
            }))
        };

        res.render('formPeminjaman', {
            item,
            itemAssets: item.itemAssets
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            error: 'Terjadi kesalahan pada server'
        });
    }
};