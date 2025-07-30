import { useAuthClientSession } from '../../utils/clientSession';

export default eventHandler(async (event) => {
    const session = await useAuthClientSession(event);
    return session.data;
});
