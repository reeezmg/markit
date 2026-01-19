import { createDefaultExpenseCategories,createPipeline,updateUser } from '../../utils/db';

export default eventHandler(async (event) => {
    const { email, name, companyname, password, type, plan } = await readBody(event);

    const existingUser = await findUserByEmail(email);

    const company = await createCompany({
        name: companyname,
        type,
        plan,
        variantinput: { create: {} },
        productinput: { create: {} },
    });

    if (existingUser) {
     await updateUser(existingUser.id, company.id, name, 'admin','1');
    } else {
      await createUser({
        email,
        password: await hash(password),
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
