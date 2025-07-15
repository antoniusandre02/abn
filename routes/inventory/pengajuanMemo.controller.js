const pool = require('../../db');
const bwipjs = require('bwip-js');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const {
    sendMemoWithPDF
} = require('../../utils/emailSender');
const puppeteer = require('puppeteer');
const ejs = require('ejs');
const { generateTokenReject, verifyToken } = require('../../utils/jwt');

// GET: Halaman list asset
exports.getMemoListPage = async (req, res) => {
    try {
        optionKaryawan = await pool.query(`
                SELECT k.*, d.name_division, dep.department_name
                FROM karyawan k
                JOIN division d ON k.divisi_karyawan = d.id_division
                JOIN department dep ON k.departemen_karyawan = dep.id_department
                WHERE d.id_division BETWEEN 16 AND 23 AND is_resign = false`
        );

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
            filterConditions.push(`(pm.nomor_memo ILIKE $${filterValues.length + 1} OR 
                                    pm.perihal ILIKE $${filterValues.length + 1})`);
            filterValues.push(searchPattern);
        }

        if (filterDateStart && filterDateEnd) {
            filterConditions.push(`pm.tanggal_memo BETWEEN $${filterValues.length + 1} AND $${filterValues.length + 2}`);
            filterValues.push(filterDateStart, filterDateEnd);
        }

        const whereClause = filterConditions.length > 0 ? `WHERE ${filterConditions.join(' AND ')}` : '';
        const countQuery = `SELECT COUNT(*) FROM pengajuan_memo pm  ${whereClause}`;
        const totalRows = parseInt((await pool.query(countQuery, filterValues)).rows[0].count);
        const totalPages = Math.ceil(totalRows / limit);

        const dataQuery = `SELECT * FROM  pengajuan_memo pm ${whereClause} ORDER BY pm.id_memo DESC LIMIT $${filterValues.length + 1} OFFSET $${filterValues.length + 2}`;
        const dataValues = [...filterValues, limit, offset];
        const result = await pool.query(dataQuery, dataValues);
        
        res.render('pengajuanMemo', {
            data: result.rows,
            optionKaryawan: optionKaryawan.rows,
            role,
            currentPage: parseInt(page),
            totalPages,
            searchKeyword: search.trim(),
            filterDateStart,
            filterDateEnd
        });
    } catch (err) {
        console.error('Error while fetching Asset:', err);
        res.status(500).send('Gagal mengambil data dari database');
    }
};

//GET : Halaman Edit Memo
exports.getMemoEditForm = async (req, res) => {
    const {
        id_memo
    } = req.params;

    try {
        optionKaryawan = await pool.query(`
                SELECT k.*, d.name_division, dep.department_name
                FROM karyawan k
                JOIN division d ON k.divisi_karyawan = d.id_division
                JOIN department dep ON k.departemen_karyawan = dep.id_department
                WHERE d.id_division BETWEEN 16 AND 23 AND is_resign = false`
        );

        const memoResult = await pool.query(`SELECT pm.id_memo, pm.cc_memo, pm.dari_memo,
                pm.perihal, pm.tanggal_pengajuan, pm.is_approve, pm.nomor_memo, pm.tanggal_approve, pm.keterangan_memo, pm.tanggal_reject,
                k1.nama_karyawan AS dari_nama,
                k2.nama_karyawan AS cc_nama,
				k1.email_karyawan AS dari_email,
				k2.email_karyawan AS cc_email,
				d1.name_division AS dari_division,
				d2.name_division AS cc_division
            FROM 
                pengajuan_memo pm
            LEFT JOIN 
                karyawan k1 ON pm.dari_memo = k1.id_karyawan
            LEFT JOIN 
                karyawan k2 ON pm.cc_memo = k2.id_karyawan
			LEFT JOIN 
				division d1 ON k1.divisi_karyawan = d1.id_division
			LEFT JOIN 
				division d2 ON k2.divisi_karyawan = d2.id_division
            WHERE id_memo = $1
                AND pm.dari_memo IS NOT NULL 
                AND pm.cc_memo IS NOT NULL 
                AND pm.dari_memo != pm.cc_memo;`, [id_memo]
        );
        const detailResult = await pool.query(`SELECT * FROM detail_pengajuan_memo WHERE id_memo = $1`, [id_memo]);

        if (memoResult.rows.length === 0) {
            req.flash('errorMessage', 'Memo tidak ditemukan');
            return res.redirect('/pengajuanMemo');
        }

        res.render('pengajuanMemoEdit', {
            memo: memoResult.rows[0],
            details: detailResult.rows,
            optionKaryawan: optionKaryawan.rows,
        });



    } catch (err) {
        console.error('Gagal ambil data untuk edit memo:', err);
        console.log('Gagal ambil data untuk edit memo:', err);
        req.flash('errorMessage', 'Gagal ambil data memo');
        res.redirect('/pengajuanMemo');
    }
};

//GET : Halaman View Memo
exports.getMemoView = async (req, res) => {
    const {
        id_memo
    } = req.params;

    try {
        const memoResult = await pool.query(`SELECT pm.id_memo,
                pm.perihal, pm.tanggal_pengajuan, pm.is_approve, pm.nomor_memo, pm.tanggal_approve, pm.keterangan_memo, pm.tanggal_reject,
                k1.nama_karyawan AS dari_nama,
                k2.nama_karyawan AS cc_nama,
				k1.email_karyawan AS dari_email,
				k2.email_karyawan AS cc_email,
				d1.name_division AS dari_division,
				d2.name_division AS cc_division
            FROM 
                pengajuan_memo pm
            LEFT JOIN 
                karyawan k1 ON pm.dari_memo = k1.id_karyawan
            LEFT JOIN 
                karyawan k2 ON pm.cc_memo = k2.id_karyawan
			LEFT JOIN 
				division d1 ON k1.divisi_karyawan = d1.id_division
			LEFT JOIN 
				division d2 ON k2.divisi_karyawan = d2.id_division
            WHERE id_memo = $1
                AND pm.dari_memo IS NOT NULL 
                AND pm.cc_memo IS NOT NULL 
                AND pm.dari_memo != pm.cc_memo;`, [id_memo]
        );
        const detailResult = await pool.query(`SELECT * FROM detail_pengajuan_memo WHERE id_memo = $1`, [id_memo]);

        if (memoResult.rows.length === 0) {
            req.flash('errorMessage', 'Memo tidak ditemukan');
            return res.redirect('/pengajuanMemo');
        }

        res.render('pengajuanMemoView', {
            memo: memoResult.rows[0],
            details: detailResult.rows
        });



    } catch (err) {
        console.error('Gagal ambil data untuk edit memo:', err);
        console.log('Gagal ambil data untuk edit memo:', err);
        req.flash('errorMessage', 'Gagal ambil data memo');
        res.redirect('/pengajuanMemo');
    }
};

// GET reject form
exports.getRejectMemo = async (req, res) => {
    const { id_memo } = req.params;
    const { token } = req.query;
    try {
        const decoded = verifyToken(token);
        if (decoded.id_memo != id_memo) throw new Error('Token tidak cocok');
        
        

        const memoRes = await pool.query(`SELECT 
                pm.perihal, pm.tanggal_pengajuan, pm.is_approve, pm.nomor_memo, pm.tanggal_approve, pm.keterangan_memo, pm.tanggal_reject,
                k1.nama_karyawan AS dari_nama,
                k2.nama_karyawan AS cc_nama
            FROM 
                pengajuan_memo pm
            LEFT JOIN 
                karyawan k1 ON pm.dari_memo = k1.id_karyawan
            LEFT JOIN 
                karyawan k2 ON pm.cc_memo = k2.id_karyawan
            WHERE id_memo = $1
                AND pm.dari_memo IS NOT NULL 
                AND pm.cc_memo IS NOT NULL 
                AND pm.dari_memo != pm.cc_memo;`, [id_memo]
        );
        if (memoRes.rowCount === 0) return res.send('Memo tidak ditemukan');

        res.render('pengajuanMemoFormReject', {
            id_memo,
            token
        });
    } catch (err) {
        console.log('❌ Link ini tidak valid atau telah kedaluwarsa.', err);
        return res.status(401).send('❌ Link ini tidak valid atau telah kedaluwarsa.');
    }
};

//GET confirm memo page
exports.getConfirmMemo = async (req, res) => {
    try {
        res.render('confirmMemo');
    } catch (err) {
        console.log('❌ Link ini tidak valid atau telah kedaluwarsa.', err);
        return res.status(401).send('❌ Link ini tidak valid atau telah kedaluwarsa.');
    }
};

//GET validation memo page
exports.getValidationMemo = async (req, res) => {
    try {
        res.render('validationMemo');
    } catch (err) {
        console.log('❌ Link ini tidak valid atau telah kedaluwarsa.', err);
        return res.status(401).send('❌ Link ini tidak valid atau telah kedaluwarsa.');
    }
};


// Print memo yang sudah di-approve
exports.printApprovedMemo = (req, res) => {
    const { id_memo } = req.params;
    const filePath = path.join(__dirname, '../../public/memos', `memo-${id_memo}-approve.pdf`);
    if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename=' + `memo-${id_memo}-approve.pdf`);
        fs.createReadStream(filePath).pipe(res);
    } else {
        req.flash('errorMessage', 'Dokumen belum tersedia.');
        res.redirect('/pengajuanMemo');
    }
};

// Download memo yang sudah di-reject
exports.downloadRejectedMemo = (req, res) => {
    const { id_memo } = req.params;
    const filePath = path.join(__dirname, '../../public/memos', `memo-${id_memo}-reject.pdf`);
    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        req.flash('errorMessage', 'Dokumen reject belum tersedia.');
        res.redirect('/pengajuanMemo');
    }
};



// POST : createMemo
exports.createMemo = async (req, res) => {
    const {
        dariMemo,
        perihal,
        ccMemo,
        tanggal_memo,
        tempItems
    } = req.body;
    const user = req.session.user;

    try {
        const items = JSON.parse(tempItems);

        if (!items.length) {
            req.flash('errorMessage', 'Silakan tambahkan minimal 1 item sebelum menyimpan.');
            return res.redirect('/pengajuanMemo');
        }

        const client = await pool.connect();
        await client.query('BEGIN');

        // Step 1: Insert ke table pengajuan_memo
        const insertMemoResult = await client.query(`
            INSERT INTO pengajuan_memo (perihal, cc_memo, dari_memo, tanggal_pengajuan, is_approve, created_at)
            VALUES ($1, $2, $3, $4, false, NOW())
            RETURNING id_memo
        `, [perihal, ccMemo, dariMemo, tanggal_memo]);

        const idMemo = insertMemoResult.rows[0].id_memo;

        // Generate nomor_memo: IT/mm-yyyy/FR-SM-id
        const tanggalObj = new Date(tanggal_memo);
        const month = String(tanggalObj.getMonth() + 1).padStart(2, '0');
        const year = tanggalObj.getFullYear();
        const nomorMemo = `IT/${month}-${year}/FR-SM-${String(idMemo).padStart(3, '0')}`;

        // Update pengajuan_memo dengan nomor_memo
        await client.query(`
        UPDATE pengajuan_memo SET nomor_memo = $1 WHERE id_memo = $2
        `, [nomorMemo, idMemo]);

        // Step 2: Insert ke table detail_pengajuan_memo
        for (const item of items) {
            await client.query(`
                INSERT INTO detail_pengajuan_memo
                (id_memo, item, link, jumlah, user_memo, keterangan, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
            `, [
                idMemo,
                item.item,
                item.link,
                item.qty,
                item.user_memo,
                item.remark
            ]);
        }

        // Step 3: Insert ke table log_pengajuan_memo
        await client.query(`
                INSERT INTO log_pengajuan_memo
                (id_memo, user_id, role_name, name, keterangan, created_at, nomor_memo)
                VALUES ($1, $2, $3, $4, 'Created Pengajuan Memo', NOW(), $5)
            `, [
            idMemo,
            user.user_id,
            user.role_name,
            user.name,
            nomorMemo
        ]);

        await client.query('COMMIT');
        client.release();

        req.flash('successMessage', 'Pengajuan memo berhasil disimpan');
        res.redirect('/pengajuanMemo');

    } catch (err) {
        console.error('Gagal menyimpan pengajuan memo:', err);
        console.log('Gagal menyimpan pengajuan memo:', err);
        req.flash('errorMessage', 'Terjadi kesalahan saat menyimpan memo');
        res.redirect('/pengajuanMemo');
    }
};

// File: pengajuanMemo.controller.js
exports.updateMemo = async (req, res) => {
    const {
        id_memo
    } = req.params;

    const {
        perihal,
        tanggal_memo,
        tempItems,
        ccMemo,
        dariMemo
    } = req.body;
    const user = req.session.user;

    try {
        const items = JSON.parse(tempItems);

        if (!items.length) {
            req.flash('errorMessage', 'Silakan tambahkan minimal 1 item sebelum menyimpan.');
            return res.redirect(`/pengajuanMemoEdit/${id_memo}`);
        }

        const client = await pool.connect();
        await client.query('BEGIN');

        const memoNomorQuery = await client.query(
            `SELECT nomor_memo FROM pengajuan_memo WHERE id_memo = $1`,
            [id_memo]
        );
        const nomorMemo = memoNomorQuery.rows[0].nomor_memo;


        // Step 1: Update pengajuan_memo
        await client.query(`
            UPDATE pengajuan_memo
            SET perihal = $1, tanggal_pengajuan = $2, dari_memo = $3, cc_memo = $4, updated_at = NOW()
            WHERE id_memo = $5
            `, [perihal, tanggal_memo, dariMemo, ccMemo, id_memo]);

        // Step 2: Hapus detail memo lama
        await client.query(`DELETE FROM detail_pengajuan_memo WHERE id_memo = $1`, [id_memo]);

        // Step 3: Tambahkan kembali detail memo baru
        for (const item of items) {
            await client.query(`
            INSERT INTO detail_pengajuan_memo
            (id_memo, item, link, jumlah, user_memo, keterangan, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [
                id_memo,
                item.item,
                item.link,
                item.qty,
                item.user_memo,
                item.remark
            ]);
        }

        // Step 4: Insert log update
        await client.query(`
            INSERT INTO log_pengajuan_memo
            (id_memo, user_id, role_name, name, keterangan, created_at, nomor_memo)
            VALUES ($1, $2, $3, $4, 'Updated Pengajuan Memo', NOW(), $5)
            `,
            [
                id_memo,
                user.user_id,
                user.role_name,
                user.name,
                nomorMemo
            ]
        );

        await client.query('COMMIT');
        client.release();

        req.flash('successMessage', 'Pengajuan memo berhasil diperbarui');
        res.redirect('/pengajuanMemo');

    } catch (err) {
        console.error('Gagal update pengajuan memo:', err);
        req.flash('errorMessage', 'Terjadi kesalahan saat update memo');
        res.redirect(`/pengajuanMemoEdit/${id_memo}`);
    }
};

// Helper async: convert image file to base64
const toBase64 = (filePath) => {
    return fs.readFileSync(filePath, {
        encoding: 'base64'
    });
};

//POST : Print and Send Email
exports.printAndSend = async (req, res) => {
    const {
        id_memo
    } = req.params;

    const rejectToken = generateTokenReject({
        action: 'reject',
        id_memo: id_memo
    });

    try {
        const memoRes = await pool.query(`SELECT pm.id_memo, pm.cc_memo, pm.dari_memo,
                pm.perihal, pm.tanggal_pengajuan, pm.is_approve, pm.nomor_memo, pm.tanggal_approve, pm.keterangan_memo, pm.tanggal_reject,
                k1.nama_karyawan AS dari_nama,
                k2.nama_karyawan AS cc_nama,
				k1.email_karyawan AS dari_email,
				k2.email_karyawan AS cc_email,
				d1.name_division AS dari_division,
				d2.name_division AS cc_division
            FROM 
                pengajuan_memo pm
            LEFT JOIN 
                karyawan k1 ON pm.dari_memo = k1.id_karyawan
            LEFT JOIN 
                karyawan k2 ON pm.cc_memo = k2.id_karyawan
			LEFT JOIN 
				division d1 ON k1.divisi_karyawan = d1.id_division
			LEFT JOIN 
				division d2 ON k2.divisi_karyawan = d2.id_division
            WHERE id_memo = $1
                AND pm.dari_memo IS NOT NULL 
                AND pm.cc_memo IS NOT NULL 
                AND pm.dari_memo != pm.cc_memo;`, [id_memo]
        );
        const detailRes = await pool.query(`SELECT * FROM detail_pengajuan_memo WHERE id_memo = $1`, [id_memo]);

        if (memoRes.rows.length === 0) {
            req.flash('errorMessage', 'Memo tidak ditemukan');
            return res.redirect('/pengajuanMemo');
        }

        const memo = memoRes.rows[0];
        const details = detailRes.rows;

        // Konversi gambar ke base64 (inline img di HTML agar muncul di PDF)
        const logoPath = path.resolve(__dirname, '../../public/adminlte/dist/img/logoabn.png');
        const ttdPath = path.resolve(__dirname, '../../public/adminlte/dist/img/paksondra.png');
        const logoBase64 = `data:image/png;base64,${toBase64(logoPath)}`;
        const ttdBase64 = `data:image/png;base64,${toBase64(ttdPath)}`;

        // Render HTML ke string
        const html = await ejs.renderFile(path.join(__dirname, '../../views/pengajuanMemoForm.ejs'), {
            memo,
            details,
            logoPath: logoBase64,
            ttdPath: ttdBase64
        });

        // Siapkan direktori temp dan pdf
        const tempDir = path.join(__dirname, '../../temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, {
            recursive: true
        });

        const htmlTempPath = path.join(tempDir, `memo-${id_memo}.html`);
        fs.writeFileSync(htmlTempPath, html);

        const folderPath = path.join(__dirname, '../../public/memos');
        if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, {
            recursive: true
        });

        const pdfPath = path.join(folderPath, `memo-${id_memo}.pdf`);

        // Render HTML ke PDF pakai Puppeteer
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        await page.goto(`file://${htmlTempPath.replace(/\\/g, '/')}`, {
            waitUntil: 'networkidle0'
        });
        await page.pdf({
            path: pdfPath,
            format: 'A4'
        });
        await browser.close();

        // Kirim email beserta PDF
        await sendMemoWithPDF({
            to: 'antoniusandre02@gmail.com',
            nomor_memo: memo.nomor_memo,
            cc: [memo.dari_email, memo.cc_email],
            perihal: memo.perihal,
            tanggal: new Date(memo.tanggal_pengajuan).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }),
            details,
            approvalLink: `http://localhost:3002/pengajuanMemo/approve/${id_memo}`,
            rejectLink: `http://localhost:3002/pengajuanMemo/rejectMemo/${id_memo}?token=${rejectToken}`,
            pdfPath
        });

        res.download(pdfPath);
    } catch (err) {
        req.flash('errorMessage', 'Gagal mengirim memo ke email.');
        console.log('gagal mengirim memo ke email: ', err);
        res.redirect('/pengajuanMemo');
    }
};

// POST : Update Approve Memo
exports.approveMemo = async (req, res) => {
    const {
        id_memo
    } = req.params;
    const user = req.session.user;

    try {
        const now = new Date();
        nomorMemo = await pool.query(`SELECT nomor_memo FROM pengajuan_memo WHERE id_memo = $1`, [id_memo]);
        const noMemo = nomorMemo.rows[0].nomor_memo;
        if (!noMemo) {
            req.flash('errorMessage', 'Nomor Memo tidak ditemukan');
            return res.redirect('/pengajuanMemo');
        }

        validationMemo = await pool.query(`SELECT * FROM pengajuan_memo WHERE id_memo = $1`, [id_memo]);
        const memoValidation = validationMemo.rows[0];
        if (memoValidation.tanggal_approve || memoValidation.tanggal_reject) {
            return res.render('validationMemo');
        }
        
        await pool.query(`
                UPDATE pengajuan_memo
                SET is_approve = true, tanggal_approve = $1, keterangan_memo = 'Memo Disetujui'
                WHERE id_memo = $2
            `, [now, id_memo]);

        await pool.query(`
                INSERT INTO log_pengajuan_memo
                (id_memo, user_id, role_name, name, keterangan, created_at, nomor_memo)
                VALUES ($1, $2, $3, $4, $5, NOW(), $6)
            `, [
            id_memo,
            user.user_id,
            user.role_name,
            user.name,
            `Memo disetujui`,
            noMemo
        ]);

        const memoRes = await pool.query(`SELECT 
                pm.perihal, pm.tanggal_pengajuan, pm.is_approve, pm.nomor_memo, pm.tanggal_approve, pm.keterangan_memo, pm.tanggal_reject,
                k1.nama_karyawan AS dari_nama,
                k2.nama_karyawan AS cc_nama
            FROM 
                pengajuan_memo pm
            LEFT JOIN 
                karyawan k1 ON pm.dari_memo = k1.id_karyawan
            LEFT JOIN 
                karyawan k2 ON pm.cc_memo = k2.id_karyawan
            WHERE id_memo = $1
                AND pm.dari_memo IS NOT NULL 
                AND pm.cc_memo IS NOT NULL 
                AND pm.dari_memo != pm.cc_memo;`, [id_memo]
        );
        const detailRes = await pool.query(`SELECT * FROM detail_pengajuan_memo WHERE id_memo = $1`, [id_memo]);

        const memo = memoRes.rows[0];
        if (!memo) {
            req.flash('errorMessage', 'Memo tidak ditemukan');
            return res.redirect('/pengajuanMemo');
        }

        const details = detailRes.rows;

        // Konversi gambar ke base64
        const logoPath = path.resolve(__dirname, '../../public/adminlte/dist/img/logoabn.png');
        const ttdManager = path.resolve(__dirname, '../../public/adminlte/dist/img/paksondra.png');
        const ttdPresdirPath = path.resolve(__dirname, '../../public/adminlte/dist/img/paksondra.png');

        const logoBase64 = `data:image/png;base64,${toBase64(logoPath)}`;
        const ttdUserBase64 = `data:image/png;base64,${toBase64(ttdManager)}`;
        const ttdPresdirBase64 = `data:image/png;base64,${toBase64(ttdPresdirPath)}`;

        // 🔧 Render ulang HTML dengan approve
        const html = await ejs.renderFile(path.join(__dirname, '../../views/pengajuanMemoForm.ejs'), {
            memo,
            details,
            logoPath: logoBase64,
            ttdPath: ttdUserBase64,
            ttdApprove: ttdPresdirBase64,
            approvedAt: now
        });

        const tempDir = path.join(__dirname, '../../temp');
        const folderPath = path.join(__dirname, '../../public/memos');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, {
            recursive: true
        });
        if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, {
            recursive: true
        });

        const htmlTempPath = path.join(tempDir, `memo-${id_memo}-approve.html`);
        const pdfPath = path.join(folderPath, `memo-${id_memo}-approve.pdf`);

        fs.writeFileSync(htmlTempPath, html);

        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.goto(`file://${htmlTempPath.replace(/\\/g, '/')}`, {
            waitUntil: 'networkidle0'
        });
        await page.pdf({
            path: pdfPath,
            format: 'A4'
        });
        await browser.close();

        req.flash('successMessage', 'Memo berhasil di-approve dan ditandatangani');
        res.redirect('/confirmMemo');
    } catch (err) {
        console.error('Gagal approve memo:', err);
        req.flash('errorMessage', 'Gagal approve memo.');
        res.redirect('/pengajuanMemo');
    }
};

// POST : Update Reject Memo
exports.rejectMemo = async (req, res) => {
    const { id_memo } = req.params;
    const { alasan } = req.body;
    const user = req.session.user;

    try {
        validationMemo = await pool.query(`SELECT * FROM pengajuan_memo WHERE id_memo = $1`, [id_memo]);
        const memoValidation = validationMemo.rows[0];
        if (memoValidation.tanggal_approve || memoValidation.tanggal_reject) {
            return res.render('validationMemo');
        }
        
        const now = new Date();
        const memoNomorQuery = await pool.query(
            `SELECT nomor_memo FROM pengajuan_memo WHERE id_memo = $1`,
            [id_memo]
        );
        const nomorMemo = memoNomorQuery.rows[0].nomor_memo;

        await pool.query(`
            UPDATE pengajuan_memo
            SET is_approve = false,
                keterangan_memo = $1,
                tanggal_reject = $2
            WHERE id_memo = $3
        `, [alasan, now, id_memo]);

        await pool.query(`
            INSERT INTO log_pengajuan_memo
            (id_memo, user_id, role_name, name, keterangan, created_at, nomor_memo)
            VALUES ($1, $2, $3, $4, $5, NOW(), $6)
        `, [
            id_memo,
            user.user_id,
            user.role_name,
            user.name,
            `Memo ditolak dengan alasan: ${alasan}`,
            nomorMemo
        ]);
        
        const memoRes = await pool.query(`SELECT 
                pm.perihal, pm.tanggal_pengajuan, pm.is_approve, pm.nomor_memo, pm.tanggal_approve, pm.keterangan_memo, pm.tanggal_reject,
                k1.nama_karyawan AS dari_nama,
                k2.nama_karyawan AS cc_nama
            FROM 
                pengajuan_memo pm
            LEFT JOIN 
                karyawan k1 ON pm.dari_memo = k1.id_karyawan
            LEFT JOIN 
                karyawan k2 ON pm.cc_memo = k2.id_karyawan
            WHERE id_memo = $1
                AND pm.dari_memo IS NOT NULL 
                AND pm.cc_memo IS NOT NULL 
                AND pm.dari_memo != pm.cc_memo;`, [id_memo]
        );
        const detailRes = await pool.query(`SELECT * FROM detail_pengajuan_memo WHERE id_memo = $1`, [id_memo]);

        const memo = memoRes.rows[0];
        if (!memo) {
            req.flash('errorMessage', 'Memo tidak ditemukan');
            return res.redirect('/pengajuanMemo');
        }

        const details = detailRes.rows;

        // Konversi gambar ke base64
        const logoPath = path.resolve(__dirname, '../../public/adminlte/dist/img/logoabn.png');
        const ttdManager = path.resolve(__dirname, '../../public/adminlte/dist/img/paksondra.png');
        const ttdPresdirPath = path.resolve(__dirname, '../../public/adminlte/dist/img/paksondra.png');

        const logoBase64 = `data:image/png;base64,${toBase64(logoPath)}`;
        const ttdUserBase64 = `data:image/png;base64,${toBase64(ttdManager)}`;
        const ttdPresdirBase64 = `data:image/png;base64,${toBase64(ttdPresdirPath)}`;

        // 🔧 Render ulang HTML dengan approve
        const html = await ejs.renderFile(path.join(__dirname, '../../views/pengajuanMemoForm.ejs'), {
            memo,
            details,
            logoPath: logoBase64,
            ttdPath: ttdUserBase64,
            ttdApprove: ttdPresdirBase64,
            approvedAt: now
        });

        const tempDir = path.join(__dirname, '../../temp');
        const folderPath = path.join(__dirname, '../../public/memos');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, {
            recursive: true
        });
        if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, {
            recursive: true
        });

        const htmlTempPath = path.join(tempDir, `memo-${id_memo}-reject.html`);
        const pdfPath = path.join(folderPath, `memo-${id_memo}-reject.pdf`);

        fs.writeFileSync(htmlTempPath, html);

        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.goto(`file://${htmlTempPath.replace(/\\/g, '/')}`, {
            waitUntil: 'networkidle0'
        });
        await page.pdf({
            path: pdfPath,
            format: 'A4'
        });
        await browser.close();

        req.flash('successMessage', 'Memo berhasil di-approve dan ditandatangani');
        res.redirect('/confirmMemo');
    } catch (err) {
        console.error('Gagal reject memo:', err);
        req.flash('errorMessage', 'Gagal menolak memo.');
        res.redirect('/pengajuanMemo');
    }
};
