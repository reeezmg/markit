import { sendEmailWithOtp } from '~/server/utils/mailer';
import { prisma } from '~/server/prisma';
import { generateOtp } from '~/server/utils/otp'; 

export default defineEventHandler(async (event) => {
    const body = await readBody(event);
    const { email } = body;

    if (!email) {
        throw createError({ statusCode: 400, statusMessage: 'Email is required' });
    }

    const otp = generateOtp(); // e.g. 6-digit random number
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins from now

    await prisma.emailOtp.upsert({
        where: { email },
        update: { otp, expiresAt },
        create: { email, otp, expiresAt },
    });

    await sendEmailWithOtp(email, otp);

    return { message: 'OTP sent successfully' };
});
