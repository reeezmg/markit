import { createDefaultExpenseCategories,createPipeline,updateUser } from '../../utils/db';
import type { CompanyType } from '@prisma/client';

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

    const company = await createCompany({
        name: companyname,
        type: companyType as CompanyType,
        plan,
        variantinput: { create: {} },
        productinput: { create: {} },
    });

    if (existingUser) {
     await updateUser(existingUser.id, company.id, name, 'admin', 1);
    } else {
      await createUser({
        email,
        password: hashedPassword,
        companies: {
            create: [
            {
                company: {
                connect: { id: company.id },
                },
                role: 'admin',
                code: 1,
                name,     
            },
            ],
        },
         });
    }
    
    await createDefaultExpenseCategories(company.id);

    
    await createPipeline({
        company: {
            connect: {
                id: company.id,
            },
        },
    });

    return {
        message: 'Successfully registered!',
    };
});
