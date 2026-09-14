import nodemailer from 'nodemailer';

export async function sendEmailWithOtp(to: string, otp: string) {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !pass) {
        throw new Error('SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS must be configured');
    }

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: {
            user,
            pass,
        },
    });

    await transporter.sendMail({
        from: user,
        to,
        subject: 'Markit OTP ',
        html: `<p>Your verification code is: <strong>${otp}</strong></p><p>Expires in 10 minutes.</p>`,
    });
}
