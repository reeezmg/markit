import nodemailer from 'nodemailer';

export async function sendEmailWithOtp(to: string, otp: string) {
    const transporter = nodemailer.createTransport({
        service: 'gmail', // or your SMTP
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
        tls: {
            rejectUnauthorized: false, // 👈 Add this line to bypass certificate error
        },
    });

    await transporter.sendMail({
        from: 'reezmohdmg22@gmail.com',
        to,
        subject: 'Markit OTP ',
        html: `<p>Your verification code is: <strong>${otp}</strong></p><p>Expires in 10 minutes.</p>`,
    });
}
