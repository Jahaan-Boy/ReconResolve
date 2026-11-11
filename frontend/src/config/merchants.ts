export interface MerchantPreset {
    id: string;
    name: string;
    slug: string;
}

export const KNOWN_MERCHANTS: readonly MerchantPreset[] = [
    {
        id: '50f20dea-28b3-4da4-b733-517fead8e3a7',
        name: 'Demo Merchant',
        slug: 'demo-merchant',
    },
    {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Acme Retail US',
        slug: 'sandbox-merchant',
    },
    {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Apex Global Trade',
        slug: 'isolated-merchant',
    },
] as const;

export const DEFAULT_MERCHANT_ID = KNOWN_MERCHANTS[0].id;

