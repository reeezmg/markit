import { createAddress,createPipeline,updateUser } from '../../utils/db';

export default eventHandler(async (event) => {
    const { email, name, companyname, password, type } = await readBody(event);

    const existinguser = await findUserByEmail(email);

    const company = await createCompany({
        name: companyname,
        type,
    });

    if (existinguser) {
        await updateUser(existinguser.id, company.id);
    } else {
        await createUser({
            email,
            name,
            password: await hash(password),
            role: 'admin',
            companies: {
                create: [{ company: { connect: { id: company.id } } }],
            },
        });
    }
    

    
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
