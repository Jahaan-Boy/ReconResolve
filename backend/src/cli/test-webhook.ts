import { randomUUID } from 'crypto';

async function main() {
    const port = process.env.PORT || 3000;
    const url = `http://localhost:${port}/api/webhooks/paypal`;
    const eventId = `WH-SIM-${Date.now()}-${randomUUID().slice(0, 8)}`;

    const payload = {
        id: eventId,
        create_time: new Date().toISOString(),
        resource_type: 'capture',
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        summary: 'Payment completed for $ 57.00 USD (Live Simulator)',
        resource: {
            id: `CAP-${Date.now()}`,
            status: 'COMPLETED',
            amount: {
                currency_code: 'USD',
                value: '57.00',
            },
            seller_receivable_breakdown: {
                gross_amount: { currency_code: 'USD', value: '57.00' },
                paypal_fee: { currency_code: 'USD', value: '2.48' },
                net_amount: { currency_code: 'USD', value: '54.52' },
            },
            custom_id: randomUUID(),
            supplementary_data: {
                related_ids: {
                    order_id: `ORD-${Date.now()}`,
                },
            },
        },
        event_version: '1.0',
        resource_version: '2.0',
    };

    const headers = {
        'content-type': 'application/json',
        'paypal-auth-algo': 'SHA256withRSA',
        'paypal-cert-url': 'https://api.paypal.com/v1/notifications/certs/CERT-360caa42-fca2a594-c11921f6',
        'paypal-transmission-id': randomUUID(),
        'paypal-transmission-sig': 'simulated_test_sig',
        'paypal-transmission-time': new Date().toISOString(),
    };

    console.log(`\n🚀 Sending test webhook to ${url}...`);
    console.log(`📦 Event ID: ${eventId}`);
    console.log(`⚡ Type: ${payload.event_type}`);

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        });

        const status = res.status;
        const data = await res.json().catch(() => res.text());

        if (res.ok) {
            console.log(`\n✅ Webhook captured & stored successfully! HTTP ${status}`);
            console.log('Response body:', JSON.stringify(data, null, 2));
            console.log('\n🔍 Verification: Check the Operations tab on the frontend or run query on `webhook_events` table.');
        } else {
            console.error(`\n❌ Webhook rejected with HTTP ${status}:`, data);
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`\n❌ Failed to connect to server at ${url}: ${msg}`);
        console.error('Make sure the backend is running (npm run dev in backend directory).');
    }
}

main();

