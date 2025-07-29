import type { H3Event, SessionConfig } from 'h3';
import crypto from 'uncrypto';

const runtimeAuth = useRuntimeConfig().auth;

const sessionConfig: SessionConfig = {
  name: runtimeAuth.name,
  password: runtimeAuth.password,
  cookie: {
    maxAge: 60 * 60 * 24 * 365,
  }
};

export type AuthSession = {
    id: string;
    cleanup: boolean;
    name: string | null;
    email: string;
    image: string | null;
    companyId: string;
    companyType: string;
    companyName: string;
    storeUniqueName?: string;
    isTaxIncluded: boolean;
    isBarcodeIncluded: boolean;
    isUserTrackIncluded: boolean;
    isLite:Boolean;
    pointsValue?: number;
    currency?: string;
    logo?: string;
    role: string;
    pipelineId: string;
    address?: any;
    gstin: string;
    accHolderName: string;
    upiId: string;
    type: string;
    code: string;
    billCounter: number;
    authSessionVersion: string;
    productInputs?: {
        name: boolean;
        brand: boolean;
        category: boolean;
        description: boolean;
    };

    variantInputs?: {
        name: boolean;
        code: boolean;
        sprice: boolean;
        pprice: boolean;
        dprice: boolean;
        discount: boolean;
        qty: boolean;
        sizes: boolean;
        images: boolean;
    };
};

export const useAuthSession = async (event: H3Event) => {
    const session = await useSession<AuthSession>(event, sessionConfig);
    return session;
};

export const requireAuthSession = async (event: H3Event) => {
    const session = await useAuthSession(event);
    if (!session.data.email) {
        throw createError({
            message: 'Not Authorized',
            statusCode: 401,
        });
    }
    return session;
};

export async function hash(str: string) {
    const msgUint8 = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-512', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    return hashHex;
}
