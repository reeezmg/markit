import { createAddress,createPipeline } from '../../utils/db';

export default eventHandler(async (event) => {
    const { email, name, companyname, password, type } = await readBody(event);
    const company = await createCompany({
        name: companyname,
        type,
    });

    const user = await createUser({
        email,
        name,
        password: await hash(password),
        role: 'admin',
        companies: {
            create: [{ company: { connect: { id: company.id } } }],
        },
    });

    
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
