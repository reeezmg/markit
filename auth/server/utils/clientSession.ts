import type { H3Event, SessionConfig } from 'h3';
import crypto from 'uncrypto';

const sessionConfig: SessionConfig = useRuntimeConfig().auth || {};

export type AuthClientSession = {
    id: string;
    name: string;
    email?: string;
    phone: string;
    type: string;
};

export const useAuthClientSession = async (event: H3Event) => {
    const session = await useSession<AuthClientSession>(event, sessionConfig);
    return session;
};

export const requireAuthClientSession = async (event: H3Event) => {
    const session = await useAuthClientSession(event);
    if (!session.data.phone) {
        throw createError({
            message: 'Not Authorized',
            statusCode: 401,
        });
    }
    return session;
};
