import { registerCompanyWithOwner } from '../../utils/db';
import { Prisma, type CompanyType } from '@prisma/client';

const VALID_COMPANY_TYPES = new Set(['seller', 'buyer', 'retail', 'service']);
const VALID_PLANS = new Set(['free', 'lite', 'pro']);

export default eventHandler(async (event) => {
    const body = await readBody(event);
    const email = String(body.email || '').trim().toLowerCase();
    const name = String(body.name || '').trim();
    const companyname = String(body.companyname || '').trim();
    const password = String(body.password || '');
    const companyType = String(body.type || 'retail');
    const plan = String(body.plan || 'free');

    if (!email || !name || !companyname || !password) {
        throw createError({
            message: 'Email, name, company name, and password are required.',
            statusCode: 400,
        });
    }

    if (!VALID_COMPANY_TYPES.has(companyType)) {
        throw createError({
            message: 'Invalid company type.',
            statusCode: 400,
        });
    }

    if (!VALID_PLANS.has(plan)) {
        throw createError({
            message: 'Invalid plan.',
            statusCode: 400,
        });
    }

    const existingUser = await findUserByEmail(email);
    const hashedPassword = await hash(password);

    if (existingUser && existingUser.password !== hashedPassword) {
        throw createError({
            message: "Password doesn't match.",
            statusCode: 401,
        });
    }

    // Company, owner user/link, default expense category and pipeline are created in one
    // transaction — if any step fails nothing is persisted, so no orphan company or user is left.
    try {
        await registerCompanyWithOwner({
            company: {
                name: companyname,
                type: companyType as CompanyType,
                plan,
                variantinput: { create: {} },
                productinput: { create: {} },
            },
            email,
            hashedPassword,
            name,
            existingUserId: existingUser?.id,
        });
    } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            throw createError({
                message: 'An account with these details already exists.',
                statusCode: 409,
            });
        }

        console.error('[auth/register] registration failed, rolled back:', err);
        throw createError({
            message: 'Registration failed. No account was created, please try again.',
            statusCode: 500,
        });
    }

    return {
        message: 'Successfully registered!',
    };
});
