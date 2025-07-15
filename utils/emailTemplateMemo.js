// utils/emailTemplateMemo.js
exports.generateMemoEmailHTML = ({ isTo, nomor_memo, perihal, tanggal, detailRows, approvalLink, rejectLink }) => {
    return `
    <!DOCTYPE html>
    <html lang="id">
    <head>
        <meta charset="UTF-8" />
        <title>Pengajuan Memo</title>
    </head>
    <body style="font-family: Arial, sans-serif;">
        <table align="center" width="600" style="background-color: #fff; border-radius: 8px; overflow: hidden; margin-top: 20px;">
            <tr>
                <td style="background-color: #0056b3; color: white; padding: 20px; text-align: center;">
                    <h2>ABN Memo System</h2>
                </td>
            </tr>
            <tr>
                <td style="padding: 20px;">
                    <h3>Pengajuan Memo Baru</h3>
                    <p><strong>Nomor Memo:</strong> ${nomor_memo}</p>
                    <p><strong>Perihal:</strong> ${perihal}</p>
                    <p><strong>Tanggal Pengajuan:</strong> ${tanggal}</p>
                    <hr />
                    <table width="100%" style="border-collapse: collapse; margin-top: 10px;">
                        <thead>
                            <tr style="background-color: #f0f0f0;">
                                <th style="border: 1px solid #ccc; padding: 8px;">Item</th>
                                <th style="border: 1px solid #ccc; padding: 8px;">Qty</th>
                                <th style="border: 1px solid #ccc; padding: 8px;">User</th>
                                <th style="border: 1px solid #ccc; padding: 8px;">Remark</th>
                            </tr>
                        </thead>
                        <tbody>${detailRows}</tbody>
                    </table>
                    
                    ${isTo ? `
                    <div style="text-align: center; margin-top: 30px;">
                        <a href="${approvalLink}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Approve</a>
                        <a href="${rejectLink}" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reject</a>
                    </div>` : `
                    <div style="margin-top: 30px; padding: 10px; background-color: #e2e3e5; border-left: 4px solid #6c757d;">
                        Anda menerima memo ini sebagai tembusan (CC). Anda tidak dapat mengambil tindakan terhadap memo ini.
                    </div>`}

                    <p style="margin-top: 30px; font-size: 12px; color: #666;">Email ini dikirim otomatis oleh sistem.</p>
                </td>
            </tr>
        </table>
    </body>
    </html>
    `;
};
