import { z } from 'zod';

export const PayPalTokenResponseSchema = z.object({
    access_token: z.string().min(1),
    token_type: z.string(),
    expires_in: z.number().int().positive(),
    scope: z.string().optional(),
    nonce: z.string().optional(),
    app_id: z.string().optional(),
});

export type PayPalTokenResponse = z.infer<typeof PayPalTokenResponseSchema>;

const MoneySchema = z.object({
    currency_code: z.string().min(3).max(3),
    value: z.string().min(1),
});


export const TransactionInfoSchema = z.object({
    transaction_id: z.string().min(1),
    transaction_event_code: z.string().min(1),
    transaction_initiation_date: z.string().min(1),
    transaction_updated_date: z.string().min(1),
    transaction_amount: MoneySchema,
    fee_amount: MoneySchema.optional(),
    transaction_status: z.string().min(1).max(1),
    paypal_reference_id: z.string().optional(),
    paypal_reference_id_type: z.string().optional(),
}).passthrough();

export type TransactionInfo = z.infer<typeof TransactionInfoSchema>;

export const TransactionDetailSchema = z.object({
    transaction_info: TransactionInfoSchema,
}).passthrough();

export type TransactionDetail = z.infer<typeof TransactionDetailSchema>;

export const TransactionSearchResponseSchema = z.object({
    transaction_details: z.array(TransactionDetailSchema).default([]),
    // The API returns page, total_items, total_pages, and links.
    page: z.number().int().nonnegative(),
    total_items: z.number().int().nonnegative().optional(),
    total_pages: z.number().int().nonnegative(),
    // Links array for HATEOAS-style pagination (optional use)
    links: z.array(
        z.object({
            href: z.string(),
            rel: z.string(),
            method: z.string().optional(),
        }),
    ).optional(),
}).passthrough();

export type TransactionSearchResponse = z.infer<typeof TransactionSearchResponseSchema>;