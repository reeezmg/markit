import { useAuthClientSession } from '../../utils/clientSession';

export default eventHandler(async (event) => {
    const session = await useAuthClientSession(event);
    console.log("sesseion",session.data)
    return session.data;
});
