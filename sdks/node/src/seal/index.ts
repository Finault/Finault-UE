/**
 * @finault/seal — Cryptographic receipts for every AI decision.
 *
 * Usage:
 *   import { SealClient } from '@finault/seal';
 *   const client = new SealClient();
 *   const seal = await client.seal({
 *     agentId: 'my-agent',
 *     action: 'decision_made',
 *     outcome: { result: 'approved' },
 *   });
 *
 * Zero runtime dependencies — uses Node `crypto` module.
 */

export { SealData, SealDataInput } from './data';
export { SealCrypto } from './crypto';
export { SealChain, ChainIntegrityError } from './chain';
export { SealClient, SealClientOptions, SealOptions } from './client';
