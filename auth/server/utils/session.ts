import type { H3Event, SessionConfig } from 'h3';
import crypto from 'uncrypto';

const runtimeAuth = useRuntimeConfig().auth;
console.log('Auth Config:', runtimeAuth);
const isProd = process.env.NODE_ENV === 'production'

const sessionConfig: SessionConfig = {
  name: runtimeAuth.name,
  password: runtimeAuth.password,
  cookie: {
    secure: isProd,             // HTTPS only in prod
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 31536000,
  },
};
export type AuthSession = {
    id: string;
    cleanup: boolean;
    category: string[];
    purchaseExpenseCategoryId: string;
    name: string | null;
    description?: string;
    thankYouNote?: string;
    refundPolicy?: string;
    returnPolicy?: string;
    companyPhone?: string;
    email: string;
    image: string | null;
    companyId: string;
    companyType: string;
    companyName: string;
    storeUniqueName?: string;
    isTaxIncluded: boolean;
    isCostIncluded: boolean;
    isAiImage: boolean;
    isUserTrackIncluded: boolean;
    isLite:Boolean;
    pointsValue?: number;
    currency?: string;
    logo?: string;
    role: string;
    pipelineId: string;
    address?: any;
    openTime?: string;
    closeTime?: string;
    gstin: string;
    accHolderName: string;
    ifsc: string;
    accountNo: string;
    bankName: string;
    upiId: string;
    type: string;
    code: string;
    authSessionVersion: string;
    plan:string;
    deliveryType: string[];
    deliveryMode: string[];
    fundDeliveryFees?: boolean;
    deliveryRadius?: number;
    deliveryFeesPerKm?: number;
    waitingTime?: number;
    waitingChargesPerMin?: number;
    minDeliveryCharges?: number;
    deliveryDiscountThreshold?: number;
    deliveryDiscountAmount?: number;
    commissionRate?: number;
    printerLabelSize?: string;
    cash?: number;
    bank?: number;
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
        button: boolean;
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
