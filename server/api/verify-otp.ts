// server/api/verify-otp.post.ts
import { prisma } from '~/server/prisma'; // adjust if different

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { email, otp } = body;

  if (!email || !otp) {
    throw createError({ statusCode: 400, message: 'Email and OTP are required' });
  }

  const record = await prisma.emailOtp.findUnique({
    where: { email },
  });

  if (!record) {
    throw createError({ statusCode: 404, message: 'OTP not found' });
  }

  const now = new Date();
  if (record.expiresAt < now) {
    await prisma.emailOtp.delete({ where: { email } }); // cleanup expired OTP
    throw createError({ statusCode: 410, message: 'OTP has expired' });
  }

  if (record.otp !== otp) {
    throw createError({ statusCode: 401, message: 'Invalid OTP' });
  }

  // ✅ OTP is valid — you can now delete it or mark as used
  await prisma.emailOtp.delete({ where: { email } });

  return { message: 'OTP verified successfully' };
});
