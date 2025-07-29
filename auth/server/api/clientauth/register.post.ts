import { createClient, createClientAddress, updateClientPipeline } from '../../utils/clientdb';

export default eventHandler(async (event) => {
    const { email, name, password,phone, companyId } = await readBody(event);

    const client = await createClient({
        email,
        name,
        password: await hash(password),
        phone,
        companies: {
            create: [{ company: { connect: { id: companyId } } }],
        },
    });
    
  await createClientAddress({
        street: '',
        townCity: '',
        postcode: '',
        county: '',
        country: '',
        client: {
            connect: {
                id: client.id,
            },
        },
    });
  await updateClientPipeline(client.id,companyId);
  
    

    return {
        message: 'Successfully registered!',
    };
});
