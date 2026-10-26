import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma';
import { hashPassword } from '../src/auth/password';

const prisma = new PrismaClient();

async function main(): Promise<void> {
    console.log('[seed] Starting database seeding for ReconResolve...');

    // 1. Upsert Primary Demo Merchant
    const merchant = await prisma.merchant.upsert({
        where: { slug: 'demo-merchant' },
        update: {},
        create: {
            id: '50f20dea-28b3-4da4-b733-517fead8e3a7',
            name: 'Demo Merchant (Sandbox)',
            slug: 'demo-merchant',
            status: 'ACTIVE',
        },
    });
    console.log(`[seed] Merchant ready: id=${merchant.id} slug=${merchant.slug}`);

    // Also upsert sandbox UUID merchant so both IDs resolve cleanly
    const sandboxMerchant = await prisma.merchant.upsert({
        where: { slug: 'sandbox-merchant' },
        update: {},
        create: {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Acme Retail US (Sandbox)',
            slug: 'sandbox-merchant',
            status: 'ACTIVE',
        },
    });

    // Upsert third isolated merchant for tenant isolation testing
    const isolatedMerchant = await prisma.merchant.upsert({
        where: { slug: 'isolated-merchant' },
        update: {},
        create: {
            id: '22222222-2222-4222-8222-222222222222',
            name: 'Apex Global Trade (Isolated Tenant)',
            slug: 'isolated-merchant',
            status: 'ACTIVE',
        },
    });

    // 2. Seed Users & Memberships for Authentication & Tenant Isolation
    const defaultPasswordHash = await hashPassword('Password123!');

    const adminUser = await prisma.user.upsert({
        where: { email: 'admin@reconresolve.com' },
        update: { passwordHash: defaultPasswordHash },
        create: {
            id: 'aaaa1111-1111-4111-8111-111111111111',
            email: 'admin@reconresolve.com',
            passwordHash: defaultPasswordHash,
            fullName: 'Sarah Jenkins (Owner)',
            status: 'ACTIVE',
        },
    });

    const analystUser = await prisma.user.upsert({
        where: { email: 'analyst@reconresolve.com' },
        update: { passwordHash: defaultPasswordHash },
        create: {
            id: 'bbbb2222-2222-4222-8222-222222222222',
            email: 'analyst@reconresolve.com',
            passwordHash: defaultPasswordHash,
            fullName: 'Alex Rivera (Analyst)',
            status: 'ACTIVE',
        },
    });

    const viewerUser = await prisma.user.upsert({
        where: { email: 'viewer@reconresolve.com' },
        update: { passwordHash: defaultPasswordHash },
        create: {
            id: 'cccc3333-3333-4333-8333-333333333333',
            email: 'viewer@reconresolve.com',
            passwordHash: defaultPasswordHash,
            fullName: 'Morgan Lee (Auditor / Viewer)',
            status: 'ACTIVE',
        },
    });

    const isolatedUser = await prisma.user.upsert({
        where: { email: 'isolated@othermerchant.com' },
        update: { passwordHash: defaultPasswordHash },
        create: {
            id: 'dddd4444-4444-4444-8444-444444444444',
            email: 'isolated@othermerchant.com',
            passwordHash: defaultPasswordHash,
            fullName: 'Taylor Cross (Isolated Operator)',
            status: 'ACTIVE',
        },
    });

    const disabledUser = await prisma.user.upsert({
        where: { email: 'disabled@reconresolve.com' },
        update: { passwordHash: defaultPasswordHash },
        create: {
            id: 'eeee5555-5555-4555-8555-555555555555',
            email: 'disabled@reconresolve.com',
            passwordHash: defaultPasswordHash,
            fullName: 'Inactive Operator (Suspended)',
            status: 'SUSPENDED',
        },
    });

    // Memberships:
    // adminUser -> OWNER on demoMerchant, ADMIN on sandboxMerchant
    await prisma.merchantMembership.upsert({
        where: { userId_merchantId: { userId: adminUser.id, merchantId: merchant.id } },
        update: { role: 'OWNER' },
        create: { userId: adminUser.id, merchantId: merchant.id, role: 'OWNER' },
    });
    await prisma.merchantMembership.upsert({
        where: { userId_merchantId: { userId: adminUser.id, merchantId: sandboxMerchant.id } },
        update: { role: 'ADMIN' },
        create: { userId: adminUser.id, merchantId: sandboxMerchant.id, role: 'ADMIN' },
    });

    // analystUser -> ANALYST on demoMerchant
    await prisma.merchantMembership.upsert({
        where: { userId_merchantId: { userId: analystUser.id, merchantId: merchant.id } },
        update: { role: 'ANALYST' },
        create: { userId: analystUser.id, merchantId: merchant.id, role: 'ANALYST' },
    });

    // viewerUser -> VIEWER on demoMerchant
    await prisma.merchantMembership.upsert({
        where: { userId_merchantId: { userId: viewerUser.id, merchantId: merchant.id } },
        update: { role: 'VIEWER' },
        create: { userId: viewerUser.id, merchantId: merchant.id, role: 'VIEWER' },
    });

    // isolatedUser -> OWNER on isolatedMerchant ONLY
    await prisma.merchantMembership.upsert({
        where: { userId_merchantId: { userId: isolatedUser.id, merchantId: isolatedMerchant.id } },
        update: { role: 'OWNER' },
        create: { userId: isolatedUser.id, merchantId: isolatedMerchant.id, role: 'OWNER' },
    });

    // disabledUser -> VIEWER on demoMerchant
    await prisma.merchantMembership.upsert({
        where: { userId_merchantId: { userId: disabledUser.id, merchantId: merchant.id } },
        update: { role: 'VIEWER' },
        create: { userId: disabledUser.id, merchantId: merchant.id, role: 'VIEWER' },
    });

    console.log('[seed] Users and merchant memberships successfully seeded!');

    for (const currentMerchant of [merchant, sandboxMerchant]) {
        const mId = currentMerchant.id;

        // 2. Provider Connection
        const connection = await prisma.providerConnection.upsert({
            where: {
                merchantId_provider_connectionKey: {
                    merchantId: mId,
                    provider: 'PAYPAL',
                    connectionKey: 'paypal-sandbox-primary',
                },
            },
            update: {},
            create: {
                merchantId: mId,
                provider: 'PAYPAL',
                connectionKey: 'paypal-sandbox-primary',
                providerAccountId: 'ACCT-PAYPAL-SANDBOX-01',
                webhookId: 'WH-SANDBOX-LIVE-9921',
                status: 'ACTIVE',
            },
        });

        // 3. Reconciliation Run
        const run = await prisma.reconciliationRun.upsert({
            where: {
                merchantId_idempotencyKey: {
                    merchantId: mId,
                    idempotencyKey: `run-daily-auto-${mId.substring(0, 8)}`,
                },
            },
            update: {},
            create: {
                merchantId: mId,
                idempotencyKey: `run-daily-auto-${mId.substring(0, 8)}`,
                rulesetVersion: 'v1.2',
                status: 'COMPLETED',
                windowStart: new Date(Date.now() - 86400000 * 2),
                windowEnd: new Date(),
                totalConsidered: 142,
                matchedCount: 135,
                unmatchedCount: 7,
                ambiguousCount: 1,
                excludedCount: 0,
                startedAt: new Date(Date.now() - 3600000 * 4),
                completedAt: new Date(Date.now() - 3600000 * 3),
            },
        });

        // 4. Clean existing exceptions for idempotent re-runs
        await prisma.exceptionAuditEvent.deleteMany({ where: { merchantId: mId } });
        await prisma.reconciliationException.deleteMany({ where: { merchantId: mId } });
        await prisma.merchantOrder.deleteMany({ where: { merchantId: mId } });
        await prisma.providerTransaction.deleteMany({ where: { merchantId: mId } });

        // --- Exception 1: AMOUNT_MISMATCH (Status: OPEN) ---
        // Expected $120.00 vs Captured $102.00 (Delta -$18.00)
        const order1 = await prisma.merchantOrder.create({
            data: {
                merchantId: mId,
                externalOrderId: 'ORD-1043',
                amountMinor: 12000n, // $120.00
                currency: 'USD',
                status: 'PAID',
                orderedAt: new Date(Date.now() - 3600000 * 5),
            },
        });

        const txn1 = await prisma.providerTransaction.create({
            data: {
                merchantId: mId,
                providerConnectionId: connection.id,
                providerTxnId: 'PAYID-M458992-TXN-1043',
                providerRecordKey: `rec-key-1043-${mId.substring(0, 8)}`,
                providerOrderId: 'PP-ORD-1043',
                type: 'CAPTURE',
                status: 'CAPTURED',
                amountMinor: 10200n, // $102.00
                currency: 'USD',
                feeMinor: 320n,
                occurredAt: new Date(Date.now() - 3600000 * 5 + 120000),
                rawPayload: { payer: 'customer-1043@example.com' },
            },
        });

        const exc1 = await prisma.reconciliationException.create({
            data: {
                merchantId: mId,
                reconciliationRunId: run.id,
                type: 'AMOUNT_MISMATCH',
                status: 'OPEN',
                merchantOrderId: order1.id,
                providerTransactionId: txn1.id,
                version: 1,
                details: {
                    reasonCode: 'AMOUNT_MISMATCH',
                    evidence: {
                        expectedAmountMinor: '12000',
                        actualAmountMinor: '10200',
                        orderId: order1.externalOrderId,
                        providerTxnId: txn1.providerTxnId,
                    },
                },
                createdAt: new Date(Date.now() - 3600000 * 3),
            },
        });

        await prisma.exceptionAuditEvent.create({
            data: {
                merchantId: mId,
                exceptionId: exc1.id,
                actorId: 'reconciliation-engine',
                actorType: 'SYSTEM',
                action: 'CREATE',
                fromStatus: 'OPEN',
                toStatus: 'OPEN',
                reason: 'Discrepancy detected during daily reconciliation run: amount mismatch $18.00 delta',
                createdAt: new Date(Date.now() - 3600000 * 3),
            },
        });

        // --- Exception 2: STATUS_DISCREPANCY (Status: OPEN) ---
        // Order CANCELLED but PayPal captured funds
        const order2 = await prisma.merchantOrder.create({
            data: {
                merchantId: mId,
                externalOrderId: 'ORD-2091',
                amountMinor: 4500n, // $45.00
                currency: 'USD',
                status: 'CANCELLED',
                orderedAt: new Date(Date.now() - 3600000 * 12),
            },
        });

        const txn2 = await prisma.providerTransaction.create({
            data: {
                merchantId: mId,
                providerConnectionId: connection.id,
                providerTxnId: 'PAYID-M778100-TXN-2091',
                providerRecordKey: `rec-key-2091-${mId.substring(0, 8)}`,
                providerOrderId: 'PP-ORD-2091',
                type: 'CAPTURE',
                status: 'CAPTURED',
                amountMinor: 4500n,
                currency: 'USD',
                feeMinor: 150n,
                occurredAt: new Date(Date.now() - 3600000 * 11),
                rawPayload: { payer: 'jane.smith@example.com' },
            },
        });

        const exc2 = await prisma.reconciliationException.create({
            data: {
                merchantId: mId,
                reconciliationRunId: run.id,
                type: 'STATUS_DISCREPANCY',
                status: 'OPEN',
                merchantOrderId: order2.id,
                providerTransactionId: txn2.id,
                version: 1,
                details: {
                    reasonCode: 'STATUS_DISCREPANCY',
                    evidence: {
                        orderStatus: 'CANCELLED',
                        providerStatus: 'CAPTURED',
                    },
                },
                createdAt: new Date(Date.now() - 3600000 * 2),
            },
        });

        await prisma.exceptionAuditEvent.create({
            data: {
                merchantId: mId,
                exceptionId: exc2.id,
                actorId: 'reconciliation-engine',
                actorType: 'SYSTEM',
                action: 'CREATE',
                fromStatus: 'OPEN',
                toStatus: 'OPEN',
                reason: 'Lifecycle status mismatch: internal order was marked CANCELLED while PayPal reported CAPTURED',
                createdAt: new Date(Date.now() - 3600000 * 2),
            },
        });

        // --- Exception 3: MISSING_PROVIDER_COUNTERPART (Status: OPEN) ---
        // Order exists and expected payment, but provider never reported capture
        const order3 = await prisma.merchantOrder.create({
            data: {
                merchantId: mId,
                externalOrderId: 'ORD-3310',
                amountMinor: 21000n, // $210.00
                currency: 'USD',
                status: 'PAID',
                orderedAt: new Date(Date.now() - 3600000 * 8),
            },
        });

        const exc3 = await prisma.reconciliationException.create({
            data: {
                merchantId: mId,
                reconciliationRunId: run.id,
                type: 'MISSING_PROVIDER_COUNTERPART',
                status: 'OPEN',
                merchantOrderId: order3.id,
                providerTransactionId: null,
                version: 1,
                details: {
                    reasonCode: 'MISSING_PROVIDER_COUNTERPART',
                    evidence: {
                        expectedProvider: 'PAYPAL',
                        externalOrderId: order3.externalOrderId,
                        amountMinor: '21000',
                    },
                },
                createdAt: new Date(Date.now() - 3600000 * 1),
            },
        });

        await prisma.exceptionAuditEvent.create({
            data: {
                merchantId: mId,
                exceptionId: exc3.id,
                actorId: 'reconciliation-engine',
                actorType: 'SYSTEM',
                action: 'CREATE',
                fromStatus: 'OPEN',
                toStatus: 'OPEN',
                reason: 'Merchant order ORD-3310 has no corresponding settlement reported by PayPal gateway',
                createdAt: new Date(Date.now() - 3600000 * 1),
            },
        });

        // --- Exception 4: MISSING_MERCHANT_COUNTERPART (Status: INVESTIGATING) ---
        // Provider captured funds, but no order exists (Ghost transaction)
        const txn4 = await prisma.providerTransaction.create({
            data: {
                merchantId: mId,
                providerConnectionId: connection.id,
                providerTxnId: 'PAYID-M993041-TXN-GHOST',
                providerRecordKey: `rec-key-ghost-${mId.substring(0, 8)}`,
                providerOrderId: 'PP-UNKNOWN-REF',
                type: 'CAPTURE',
                status: 'CAPTURED',
                amountMinor: 8999n, // $89.99
                currency: 'USD',
                feeMinor: 260n,
                occurredAt: new Date(Date.now() - 3600000 * 16),
                rawPayload: { payer: 'anonymous-buyer@example.com' },
            },
        });

        const exc4 = await prisma.reconciliationException.create({
            data: {
                merchantId: mId,
                reconciliationRunId: run.id,
                type: 'MISSING_MERCHANT_COUNTERPART',
                status: 'INVESTIGATING',
                merchantOrderId: null,
                providerTransactionId: txn4.id,
                version: 2,
                details: {
                    reasonCode: 'MISSING_MERCHANT_COUNTERPART',
                    evidence: {
                        capturedAmountMinor: '8999',
                        providerTxnId: txn4.providerTxnId,
                    },
                },
                createdAt: new Date(Date.now() - 3600000 * 10),
            },
        });

        await prisma.exceptionAuditEvent.create({
            data: {
                merchantId: mId,
                exceptionId: exc4.id,
                actorId: 'reconciliation-engine',
                actorType: 'SYSTEM',
                action: 'CREATE',
                fromStatus: 'OPEN',
                toStatus: 'OPEN',
                reason: 'Unmatched provider transaction: customer funds captured without matching merchant order',
                createdAt: new Date(Date.now() - 3600000 * 10),
            },
        });

        await prisma.exceptionAuditEvent.create({
            data: {
                merchantId: mId,
                exceptionId: exc4.id,
                actorId: 'operator-sarah',
                actorType: 'OPERATOR',
                action: 'INVESTIGATE',
                fromStatus: 'OPEN',
                toStatus: 'INVESTIGATING',
                reason: 'Contacted merchant support team to locate abandoned checkout session or manual invoice.',
                createdAt: new Date(Date.now() - 3600000 * 4),
            },
        });

        // --- Exception 5: AMBIGUOUS_MATCH (Status: OPEN) ---
        // Multiple candidate orders match transaction amount
        const order5a = await prisma.merchantOrder.create({
            data: {
                merchantId: mId,
                externalOrderId: 'ORD-7001-A',
                amountMinor: 5000n, // $50.00
                currency: 'USD',
                status: 'OPEN',
                orderedAt: new Date(Date.now() - 3600000 * 6),
            },
        });

        const order5b = await prisma.merchantOrder.create({
            data: {
                merchantId: mId,
                externalOrderId: 'ORD-7001-B',
                amountMinor: 5000n, // $50.00
                currency: 'USD',
                status: 'OPEN',
                orderedAt: new Date(Date.now() - 3600000 * 6 + 180000),
            },
        });

        const txn5 = await prisma.providerTransaction.create({
            data: {
                merchantId: mId,
                providerConnectionId: connection.id,
                providerTxnId: 'PAYID-M505050-TXN-AMBIG',
                providerRecordKey: `rec-key-ambig-${mId.substring(0, 8)}`,
                providerOrderId: 'PP-ORD-AMBIGUOUS',
                type: 'CAPTURE',
                status: 'CAPTURED',
                amountMinor: 5000n,
                currency: 'USD',
                feeMinor: 175n,
                occurredAt: new Date(Date.now() - 3600000 * 5),
                rawPayload: { payer: 'shopper@example.com' },
            },
        });

        const exc5 = await prisma.reconciliationException.create({
            data: {
                merchantId: mId,
                reconciliationRunId: run.id,
                type: 'AMBIGUOUS_MATCH',
                status: 'OPEN',
                merchantOrderId: order5a.id,
                providerTransactionId: txn5.id,
                version: 1,
                details: {
                    reasonCode: 'AMBIGUOUS_MATCH',
                    candidateCount: 2,
                    candidates: [order5a.externalOrderId, order5b.externalOrderId],
                },
                createdAt: new Date(Date.now() - 3600000 * 2),
            },
        });

        await prisma.exceptionAuditEvent.create({
            data: {
                merchantId: mId,
                exceptionId: exc5.id,
                actorId: 'reconciliation-engine',
                actorType: 'SYSTEM',
                action: 'CREATE',
                fromStatus: 'OPEN',
                toStatus: 'OPEN',
                reason: 'Ambiguous candidates: 2 orders matched $50.00 within same 1-hour window. Exact matching declined to prevent misattribution.',
                createdAt: new Date(Date.now() - 3600000 * 2),
            },
        });

        // --- Exception 6: AMOUNT_MISMATCH (Status: RESOLVED) ---
        const order6 = await prisma.merchantOrder.create({
            data: {
                merchantId: mId,
                externalOrderId: 'ORD-9912',
                amountMinor: 7500n, // $75.00
                currency: 'USD',
                status: 'PAID',
                orderedAt: new Date(Date.now() - 86400000 * 2),
            },
        });

        const txn6 = await prisma.providerTransaction.create({
            data: {
                merchantId: mId,
                providerConnectionId: connection.id,
                providerTxnId: 'PAYID-M884122-TXN-9912',
                providerRecordKey: `rec-key-9912-${mId.substring(0, 8)}`,
                providerOrderId: 'PP-ORD-9912',
                type: 'CAPTURE',
                status: 'CAPTURED',
                amountMinor: 7000n, // $70.00
                currency: 'USD',
                feeMinor: 210n,
                occurredAt: new Date(Date.now() - 86400000 * 2 + 60000),
                rawPayload: {},
            },
        });

        const exc6 = await prisma.reconciliationException.create({
            data: {
                merchantId: mId,
                reconciliationRunId: run.id,
                type: 'AMOUNT_MISMATCH',
                status: 'RESOLVED',
                merchantOrderId: order6.id,
                providerTransactionId: txn6.id,
                version: 2,
                resolutionNote: 'Customer courtesy discount of $5.00 applied at gateway. Confirmed ledger journal entry #GL-8891.',
                resolvedAt: new Date(Date.now() - 86400000),
                details: {
                    reasonCode: 'AMOUNT_MISMATCH',
                    evidence: {
                        expectedAmountMinor: '7500',
                        actualAmountMinor: '7000',
                    },
                },
                createdAt: new Date(Date.now() - 86400000 * 2),
            },
        });

        await prisma.exceptionAuditEvent.create({
            data: {
                merchantId: mId,
                exceptionId: exc6.id,
                actorId: 'reconciliation-engine',
                actorType: 'SYSTEM',
                action: 'CREATE',
                fromStatus: 'OPEN',
                toStatus: 'OPEN',
                reason: 'Amount mismatch detected: $5.00 delta',
                createdAt: new Date(Date.now() - 86400000 * 2),
            },
        });

        await prisma.exceptionAuditEvent.create({
            data: {
                merchantId: mId,
                exceptionId: exc6.id,
                actorId: 'operator-alex',
                actorType: 'OPERATOR',
                action: 'RESOLVE',
                fromStatus: 'OPEN',
                toStatus: 'RESOLVED',
                reason: 'Customer courtesy discount of $5.00 applied at gateway. Confirmed ledger journal entry #GL-8891.',
                createdAt: new Date(Date.now() - 86400000),
            },
        });

        // --- Exception 7: STATUS_DISCREPANCY (Status: DISMISSED) ---
        const order7 = await prisma.merchantOrder.create({
            data: {
                merchantId: mId,
                externalOrderId: 'ORD-8821',
                amountMinor: 3000n, // $30.00
                currency: 'USD',
                status: 'CANCELLED',
                orderedAt: new Date(Date.now() - 86400000 * 3),
            },
        });

        const txn7 = await prisma.providerTransaction.create({
            data: {
                merchantId: mId,
                providerConnectionId: connection.id,
                providerTxnId: 'PAYID-M662211-TXN-8821',
                providerRecordKey: `rec-key-8821-${mId.substring(0, 8)}`,
                providerOrderId: 'PP-ORD-8821',
                type: 'CAPTURE',
                status: 'CAPTURED',
                amountMinor: 3000n,
                currency: 'USD',
                feeMinor: 110n,
                occurredAt: new Date(Date.now() - 86400000 * 3 + 30000),
                rawPayload: {},
            },
        });

        const exc7 = await prisma.reconciliationException.create({
            data: {
                merchantId: mId,
                reconciliationRunId: run.id,
                type: 'STATUS_DISCREPANCY',
                status: 'DISMISSED',
                merchantOrderId: order7.id,
                providerTransactionId: txn7.id,
                version: 2,
                resolutionNote: 'Customer cancellation webhook arrived out-of-order; physical shipment dispatched and customer kept goods.',
                details: {
                    reasonCode: 'STATUS_DISCREPANCY',
                },
                createdAt: new Date(Date.now() - 86400000 * 3),
            },
        });

        await prisma.exceptionAuditEvent.create({
            data: {
                merchantId: mId,
                exceptionId: exc7.id,
                actorId: 'reconciliation-engine',
                actorType: 'SYSTEM',
                action: 'CREATE',
                fromStatus: 'OPEN',
                toStatus: 'OPEN',
                reason: 'Order cancelled but PayPal captured funds',
                createdAt: new Date(Date.now() - 86400000 * 3),
            },
        });

        await prisma.exceptionAuditEvent.create({
            data: {
                merchantId: mId,
                exceptionId: exc7.id,
                actorId: 'operator-sarah',
                actorType: 'OPERATOR',
                action: 'DISMISS',
                fromStatus: 'OPEN',
                toStatus: 'DISMISSED',
                reason: 'Customer cancellation webhook arrived out-of-order; physical shipment dispatched and customer kept goods.',
                createdAt: new Date(Date.now() - 86400000 * 2),
            },
        });

        console.log(`[seed] Created 7 rich exceptions for merchant ${mId}`);
    }

    console.log('[seed] Seeding successfully completed!');
}

main()
    .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[seed] Fatal error: ${message}`);
        process.exit(1);
    })
    .finally(() => {
        void prisma.$disconnect();
    });
