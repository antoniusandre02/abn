const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { generateMemoEmailHTML } = require('./emailTemplateMemo');
const { generateEWarrantyEmailHTML } = require('./emailTemplateEWarranty');
// ✅ Inisialisasi transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // contoh: yourcompany@gmail.com
        pass: process.env.EMAIL_PASS, // app password Gmail
    },
});

// ✅ Fungsi kirim email dengan HTML dan lampiran PDF
exports.sendMemoWithPDF = async ({
    to,
    cc,
    nomor_memo,
    perihal,
    tanggal,
    details = [],
    approvalLink,
    rejectLink,
    pdfPath
}) => {
    try {
        const detailRows = details.map((d) => `
            <tr>
                <td style="border: 1px solid #ccc; padding: 8px;">
                    <div><strong> ${d.item}</strong></div>
                    <div style="font-size: 0.8em; word-break: break-all;"><a href="<%= ${d.link} %>" target="_blank"> ${d.link} </a></div>
                </td>
                <td style="border: 1px solid #ccc; padding: 8px;">${d.jumlah}</td>
                <td style="border: 1px solid #ccc; padding: 8px;">${d.user_memo}</td>
                <td style="border: 1px solid #ccc; padding: 8px;">${d.keterangan}</td>
            </tr>
        `).join('');

        // Email TO (dari_memo) – bisa approve/reject
        const htmlTo = generateMemoEmailHTML({
            isTo: true,
            nomor_memo,
            perihal,
            tanggal,
            detailRows,
            approvalLink,
            rejectLink
        });

        await transporter.sendMail({
            from: `"ABN Memo System" <${process.env.EMAIL_USER}>`,
            to,
            subject: `Pengajuan Memo: ${nomor_memo}`,
            html: htmlTo,
            attachments: [{
                filename: `Memo - ${nomor_memo}.pdf`,
                path: pdfPath
            }],
        });

        // Email CC (cc_memo) – hanya lihat
        const htmlCc = generateMemoEmailHTML({
            isTo: false,
            nomor_memo,
            perihal,
            tanggal,
            detailRows
        });

        await transporter.sendMail({
            from: `"ABN Memo System" <${process.env.EMAIL_USER}>`,
            to: cc,
            subject: `Tembusan Memo: ${nomor_memo}`,
            html: htmlCc,
            attachments: [{
                filename: `Memo - ${nomor_memo}.pdf`,
                path: pdfPath
            }],
        });

        console.log('✅ Email TO & CC berhasil dikirim');
    } catch (error) {
        console.error('❌ Gagal kirim email:', error);
        throw error;
    }
};

// Kirim E-Warranty dengan attachment PDF

exports.sendEWarrantyPDF = async ({
    to,
    bcc,
    customer_name,
    created_at,
    expired_date,
    product_brand,
    product_name,
    product_sn,
    product_catalog,
    pdfPath
}) => {
    try {
        const html = generateEWarrantyEmailHTML({
            customerName: customer_name,
            created_at,
            expired_date,
            product_brand,
            product_name,
            product_sn,
            product_catalog
        });

        await transporter.sendMail({
            from: `"ABN E-Warranty" no-reply@abadinusa.co.id`,
            replyTo: 'no-reply@abadinusa.co.id',
            to,
            bcc: bcc,
            subject: `Confirmation e-Warranty PT. Abadinusa Usahasemesta`,
            html,
            attachments: [{
                filename: `E-Warranty - ${customer_name}.pdf`,
                path: pdfPath
                },
                {
                    filename: 'logoabn.png',
                    path: path.join(__dirname, '../public/adminlte/dist/img/logoabn.png'),
                    cid: 'logoabn' // dipanggil dari HTML
                },
                {
                    filename: 'serving-quality.jpg',
                    path: path.join(__dirname, '../public/adminlte/dist/img/unnamed.jpg'),
                    cid: 'servingQuality' // dipanggil dari HTML
                }]
        });

        console.log('✅ E-Warranty Email sent successfully');
    } catch (error) {
        console.error('❌ Failed to send E-Warranty Email:', error);
        throw error;
    }
};