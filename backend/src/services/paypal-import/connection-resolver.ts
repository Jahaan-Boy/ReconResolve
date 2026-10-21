import type { PrismaClient } from '../../generated/prisma';
import { ImportError } from './errors';
import type { ImportContext } from './types';

type ResolverDb = Pick<PrismaClient, 'merchant' | 'providerConnection'>;

export async function resolvePayPalConnection(
    db: ResolverDb,
    merchantSlugInput: string,
): Promise<ImportContext> {
    const merchantSlug = merchantSlugInput.trim();
    if (!merchantSlug || merchantSlug.length > 128) {
        throw new ImportError('PAYPAL_SYNC_INVALID_ARGS', 'A valid --merchant-slug is required.');
    }

    const merchant = await db.merchant.findUnique({
        where: { slug: merchantSlug },
        select: { id: true },
    });
    if (!merchant) {
        throw new ImportError(
            'PAYPAL_SYNC_MERCHANT_NOT_FOUND',
            'No merchant matches the supplied --merchant-slug. Check the development seed.',
        );
    }

    const connections = await db.providerConnection.findMany({
        where: { merchantId: merchant.id, provider: 'PAYPAL', status: 'ACTIVE' },
        select: { id: true },
        take: 2,
    });

    if (connections.length === 0) {
        throw new ImportError(
            'PAYPAL_SYNC_CONNECTION_NOT_FOUND',
            'The merchant has no ACTIVE PAYPAL connection. Create/enable a Sandbox connection before importing.',
        );
    }
    if (connections.length > 1) {
        throw new ImportError(
            'PAYPAL_SYNC_CONNECTION_AMBIGUOUS',
            'The merchant has more than one ACTIVE PAYPAL connection; refusing to guess.',
        );
    }

    const connection = connections[0];
    if (!connection) {
        // Keeps this safe with noUncheckedIndexedAccess enabled.
        throw new ImportError(
            'PAYPAL_SYNC_CONNECTION_NOT_FOUND',
            'No ACTIVE PAYPAL connection could be resolved for this merchant.',
        );
    }

    return { merchantId: merchant.id, providerConnectionId: connection.id };
}
