import crypto from 'node:crypto';

const SCRYPT_PREFIX = 'scrypt';
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;

/**
 * Hashes a plaintext password using Node's standard crypto.scrypt.
 * Output format: scrypt$N=16384,r=8,p=1$<saltHex>$<derivedHex>
 */
export async function hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(SALT_LEN);
    const derived = await new Promise<Buffer>((resolve, reject) => {
        crypto.scrypt(
            password,
            salt,
            KEY_LEN,
            { N: COST, r: BLOCK_SIZE, p: PARALLELISM },
            (err, derivedKey) => {
                if (err) reject(err);
                else resolve(derivedKey);
            },
        );
    });

    return `${SCRYPT_PREFIX}$N=${COST},r=${BLOCK_SIZE},p=${PARALLELISM}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/**
 * Constant-time password verification against stored scrypt hash.
 * Returns false on format mismatch, invalid salt, or key inequality.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
    try {
        if (!storedHash || typeof storedHash !== 'string') {
            return false;
        }

        const parts = storedHash.split('$');
        if (parts.length !== 4 || parts[0] !== SCRYPT_PREFIX) {
            return false;
        }

        // Parse params e.g. N=16384,r=8,p=1
        const paramPairs = parts[1].split(',');
        let n = COST;
        let r = BLOCK_SIZE;
        let p = PARALLELISM;

        for (const pair of paramPairs) {
            const [k, v] = pair.split('=');
            if (k === 'N') n = parseInt(v, 10);
            if (k === 'r') r = parseInt(v, 10);
            if (k === 'p') p = parseInt(v, 10);
        }

        const salt = Buffer.from(parts[2], 'hex');
        const expectedDerived = Buffer.from(parts[3], 'hex');

        if (salt.length === 0 || expectedDerived.length !== KEY_LEN) {
            return false;
        }

        const actualDerived = await new Promise<Buffer>((resolve, reject) => {
            crypto.scrypt(
                password,
                salt,
                KEY_LEN,
                { N: n, r, p },
                (err, derivedKey) => {
                    if (err) reject(err);
                    else resolve(derivedKey);
                },
            );
        });

        return crypto.timingSafeEqual(expectedDerived, actualDerived);
    } catch {
        return false;
    }
}
