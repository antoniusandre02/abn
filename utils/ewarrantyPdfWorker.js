const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const puppeteer = require('puppeteer');
const {
    sendEWarrantyPDF
} = require('../utils/emailSender'); // ← sesuaikan path

const toBase64Async = async (filePath) => {
    const file = await fs.promises.readFile(filePath);
    return file.toString('base64');
};

async function generatePdfAndSendEmail(ewarranty) {
    try {
        const templatePath = path.join(__dirname, '../views/eWarrantyFile.ejs');
        const framePath = path.resolve(__dirname, '../public/adminlte/dist/img/Design E-Warranty.png');
        const servingQualityPath = path.resolve(__dirname, '../public/adminlte/dist/img/unnamed.jpg');
        const logoPath = path.resolve(__dirname, '../public/adminlte/dist/img/logoabn.png');
        const tagLineAbn = path.resolve(__dirname, '../public/adminlte/dist/img/tagline.png');
        const fontEwarranty = '/adminlte/dist/img/MYRIADPRO-REGULAR.woff';

        const [frameBase64, servingQualityBase64, logoBase64, taglineAbnBase64] = await Promise.all([
            toBase64Async(framePath),
            toBase64Async(servingQualityPath),
            toBase64Async(logoPath),
            toBase64Async(tagLineAbn)
        ]);

        const html = await ejs.renderFile(templatePath, {
            dataEwarranty: ewarranty,
            framePath: `data:image/png;base64,${frameBase64}`,
            servingQualityPath: `data:image/png;base64,${servingQualityBase64}`,
            logoPath: `data:image/png;base64,${logoBase64}`,
            tagLineAbn: `data:image/png;base64,${taglineAbnBase64}`,
            fontEwarranty
        });

        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setContent(html, {
            waitUntil: 'networkidle0'
        });

        const pdfFileName = `e-warranty-${ewarranty.customer_name.replace(/\s+/g, '_')}.pdf`;
        const pdfPath = path.join(__dirname, '../temp', pdfFileName);
        await page.pdf({
            path: pdfPath,
            format: 'A4',
            printBackground: true
        });
        await browser.close();

        await sendEWarrantyPDF({
            to: ewarranty.customer_email,
            bcc: ['workshop@abadinusa.co.id', 'servicecenter@abadinusa.co.id'],
            customer_name: ewarranty.customer_name,
            created_at: ewarranty.created_at,
            expired_date: ewarranty.expired_date,
            product_brand: ewarranty.product_brand,
            product_name: ewarranty.product_name,
            product_sn: ewarranty.product_sn,
            product_catalog: ewarranty.product_catalog,
            pdfPath
        });

        // Hapus file PDF setelah selesai dikirim
        fs.unlink(pdfPath, () => {});
    } catch (err) {
        console.error('❌ Error di background worker eWarranty:', err);
    }
}

module.exports = {
    generatePdfAndSendEmail
};