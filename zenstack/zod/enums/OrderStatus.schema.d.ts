import { z } from 'zod';
export declare const OrderStatusSchema: z.ZodEnum<["PENDING", "CONFIRMED", "PACKED", "DELIVERED", "CANCELED", "OUTOFSTOCK", "BOOKED"]>;
