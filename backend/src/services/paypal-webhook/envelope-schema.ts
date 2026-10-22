import { z } from 'zod';

export const PayPalWebhookEnvelopeSchema = z
    .object({
        id: z.string().trim().min(1, 'Webhook event id must not be empty'),
        event_type: z.string().trim().min(1, 'Webhook event_type must not be empty'),
        resource_type: z.string().trim().min(1).nullable().optional(),
        create_time: z.string().nullable().optional(),
        event_version: z.string().nullable().optional(),
        summary: z.string().nullable().optional(),
        resource: z.record(z.string(), z.unknown()).nullable().optional(),
    })
    .passthrough();

export type PayPalWebhookEnvelope = z.infer<typeof PayPalWebhookEnvelopeSchema>;
