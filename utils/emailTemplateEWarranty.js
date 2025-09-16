function formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
}

exports.generateEWarrantyEmailHTML = ({
    customerName = 'Valued Customer',
    created_at,
    expired_date,
    product_brand,
    product_name,
    product_sn,
    product_catalog,
    logoPath = '',               
    servingQualityPath = '' 
}) => {
    const startDate = formatDate(created_at);
    const endDate = formatDate(expired_date);

    const productInfo = `${product_brand} - ${product_name}`;
    const serial = (!product_sn || product_sn.trim() === '-' || product_sn.trim() === '') ?
        product_catalog :
        product_sn;

    return `
        <div style="font-family: Arial, sans-serif; font-size: 14px; color: #000;">
            <p>Dear ${customerName},</p>

            <p><em>Warmest regards from PT Abadinusa Usahasemesta – Jakarta, Indonesia</em></p>

            <p>
                Together with this email, we would like to inform you that your guarantee is valid from 
                <strong>${startDate}</strong> until <strong>${endDate}</strong>.
            </p>

            <p>Warranty includes serial number / type :</p>
            <p><strong>${productInfo}</strong> : ${serial}</p>

            <p>
                For any others claim damage or other problems, please contact telephone number 
                <strong>+6221 3101017</strong> or WA number 
                <strong>+628111310131</strong>.
            </p>

            <br>
            <p>Thank you for your trust and cooperation.</p>
            <p>Best Regards,</p>
            <br>
            <img src="cid:logoabn" alt="Abadinusa Logo" width="200" height="40" style="display: block; margin-bottom: 10px;"><br>
            <div style="font-weight: bold; color: #005b9e;">PT. Abadinusa Usahasemesta</div>
            <div>Jl. Raden Saleh Raya No. 45 G</div>
            <div>Jakarta Pusat</div>
            <div><strong>Office Ph. :</strong> +62 21 3101017</div>
            <div><strong>Whatsapp :</strong> +62 811 1310 131</div>
            <div><a href="https://www.abadinusa.co.id" target="_blank">www.abadinusa.co.id</a></div>
            <img src="cid:servingQuality" alt="Serving with Quality" style="height: 60px; width: auto; display: block; margin-bottom: 10px;">
            <hr style="margin-top:20px; margin-bottom:10px; border:none; border-top:1px solid #ccc;">
            <p style="font-size: 15px; color: #666;">
                ⚠️ Don't reply to this email, this email is sent automatically from our system.
            </p>
        </div>
    `;
};