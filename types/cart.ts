export interface CartItem {
    variantId: string;
    size: string | null;
    qty: number;
    name: string;
    price: number;
}

export interface CartState {
    items: CartItem[];
    companyId: string;
}

export type CartFetchResponse = {
    items: CartItem[];
};