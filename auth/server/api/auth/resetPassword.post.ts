import { Prisma } from '@prisma/client';
import { prisma } from '~/server/prisma';
import { findUserByEmail } from '../../utils/db';

const RETRYABLE_PRISMA_CODES = new Set(['P1001', 'P1002']);
const DB_RETRY_ATTEMPTS = 3;
const DB_RETRY_DELAY_MS = 400;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function isRetryablePrismaError(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError &&
        RETRYABLE_PRISMA_CODES.has(error.code);
}

async function withDbRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= DB_RETRY_ATTEMPTS; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (!isRetryablePrismaError(error) || attempt === DB_RETRY_ATTEMPTS) {
                throw error;
            }
            await wait(DB_RETRY_DELAY_MS * attempt);
        }
    }

    throw lastError;
}

export default eventHandler(async (event) => {
    const body = await readBody(event);
    const email = String(body.email || '').trim().toLowerCase();
    const otp = String(body.otp || '').trim();
    const password = String(body.password || '');

    if (!email || !otp || !password) {
        throw createError({
            message: 'Email, OTP, and password are required.',
            statusCode: 400,
        });
    }

    if (password.length < 6) {
        throw createError({
            message: 'Password must be at least 6 characters.',
            statusCode: 400,
        });
    }

    const user = await findUserByEmail(email);
    if (!user) {
        throw createError({
            message: 'Email not found! Please register.',
            statusCode: 404,
        });
    }

    try {
        const record = await withDbRetry(() => prisma.emailOtp.findUnique({
            where: { email },
        }));

        if (!record) {
            throw createError({
                message: 'OTP not found.',
                statusCode: 404,
            });
        }

        if (record.expiresAt < new Date()) {
            await withDbRetry(() => prisma.emailOtp.delete({ where: { email } }));
            throw createError({
                message: 'OTP has expired.',
                statusCode: 410,
            });
        }

        if (record.otp !== otp) {
            throw createError({
                message: 'Invalid OTP.',
                statusCode: 401,
            });
        }

        const hashedPassword = await hash(password);
        await withDbRetry(() => prisma.$transaction([
            prisma.user.update({
                where: { id: user.id },
                data: { password: hashedPassword },
            }),
            prisma.emailOtp.delete({ where: { email } }),
        ]));

        return {
            message: 'Password reset successfully',
        };
    } catch (error: unknown) {
        if (isRetryablePrismaError(error)) {
            throw createError({
                message: 'Database is waking up. Please retry in a few seconds.',
                statusCode: 503,
            });
        }
        throw error;
    }
});
