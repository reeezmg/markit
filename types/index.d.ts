import type { Avatar } from '#ui/types';

export type UserStatus = 'subscribed' | 'unsubscribed' | 'bounced';

export interface User {
    id: number;
    name: string;
    email: string;
    avatar?: Avatar;
    status: UserStatus;
    location: string;
}

export interface Mail {
    id: number;
    unread?: boolean;
    from: User;
    subject: string;
    body: string;
    date: string;
}

export interface Member {
    name: string;
    username: string;
    role: 'member' | 'owner';
    avatar: Avatar;
}

export interface Notification {
    id: number;
    unread?: boolean;
    sender: User;
    body: string;
    date: string;
}

export type Period = 'daily' | 'weekly' | 'monthly';

export interface Range {
    start: Date;
    end: Date;
}

export interface CartState {
    items: CartItem[];     
    companyId: string;
    isLoading: boolean;
    sessionId: string;
    lastSynced: number;
    isHydrated: boolean;
}

export interface CartItem {
    variantId: string;
    size: string | null;
    qty: number;

}

export type LikedProduct = {
    variantId: string;
  };
  
  export type LikeState = {
    liked: LikedProduct[];
    companyId: string;
    isLoading: boolean;
    sessionId: string;
    lastSynced: number;
    isHydrated: boolean;
  };

export interface Message {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    conversationId: string;
    senderId: string;
    text: string;
    seen: string[];
    reply?:Boolean
    edit?:Boolean
    delete?:Boolean
  }