/**
 * Merkle Tree & Cryptographic Seal System
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * RFC 6962 compliant Merkle tree implementation for verifiable economic seals.
 * Provides cryptographic commitment and verifiable transparency logs.
 */

import { jsonResponse, errorResponse } from '../utils.js';
import { getOrgIdFromAuth } from '../auth.js';

function hex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hexStr) {
  const bytes = new Uint8Array(hexStr.length / 2);
  for (let i = 0; i < hexStr.length; i += 2) {
    bytes[i / 2] = parseInt(hexStr.substr(i, 2), 16);
  }
  return bytes;
}

function canonicalizeJSON(obj) {
  if (obj === null) return 'null';
  if (typeof obj === 'boolean') return obj ? 'true' : 'false';
  if (typeof obj === 'number') return JSON.stringify(obj);
  if (typeof obj === 'string') return JSON.stringify(obj);

  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalizeJSON).join(',') + ']';
  }

  if (typeof obj === 'object') {
    const keys = Object.keys(obj).sort();
    const pairs = keys.map(k => JSON.stringify(k) + ':' + canonicalizeJSON(obj[k]));
    return '{' + pairs.join(',') + '}';
  }

  return JSON.stringify(obj);
}

async function sha256(data) {
  const buffer = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data;
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return new Uint8Array(digest);
}

async function computeLeafHash(receipt) {
  const canonical = canonicalizeJSON(receipt);
  const leafPrefix = new Uint8Array([0x00]);
  const data = new TextEncoder().encode(canonical);

  const combined = new Uint8Array(leafPrefix.length + data.length);
  combined.set(leafPrefix, 0);
  combined.set(data, leafPrefix.length);

  const digest = await sha256(combined);
  return 'sha256:' + hex(digest);
}

async function computeParentHash(leftHashStr, rightHashStr) {
  const leftHash = fromHex(leftHashStr.replace('sha256:', ''));
  const rightHash = fromHex(rightHashStr.replace('sha256:', ''));

  const parentPrefix = new Uint8Array([0x01]);
  const combined = new Uint8Array(parentPrefix.length + leftHash.length + rightHash.length);

  combined.set(parentPrefix, 0);
  combined.set(leftHash, parentPrefix.length);
  combined.set(rightHash, parentPrefix.length + leftHash.length);

  const digest = await sha256(combined);
  return 'sha256:' + hex(digest);
}

async function supabaseQuery(env, table, query) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase error: ${res.status} ${text}`);
  }

  return res.json();
}

async function supabaseInsert(env, table, records) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(records)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase insert error: ${res.status} ${text}`);
  }

  return res.json();
}

async function batchInsertLeaves(env, treeId, receipts) {
  const leafHashes = await Promise.all(
    receipts.map(r => computeLeafHash(r))
  );

  const heads = await supabaseQuery(
    env,
    'tree_heads',
    `tree_id=eq.${treeId}&order=tree_size.desc&limit=1`
  );

  const currentTreeSize = heads.length > 0 ? heads[0].tree_size : 0;

  const leafNodes = leafHashes.map((hash, idx) => ({
    tree_id: treeId,
    level: 0,
    index: currentTreeSize + idx,
    hash: hash
  }));

  await supabaseInsert(env, 'merkle_nodes', leafNodes);

  const newTreeSize = currentTreeSize + leafHashes.length;
  let rootHash = await recomputeRightEdge(env, treeId, currentTreeSize, newTreeSize);

  const timestamp = new Date().toISOString();
  const signature = await signTreeHead(newTreeSize, rootHash, timestamp, env.MERKLE_SIGNING_KEY);

  const treeHead = {
    tree_id: treeId,
    tree_size: newTreeSize,
    root_hash: rootHash,
    signature: signature,
    timestamp: timestamp
  };

  await supabaseInsert(env, 'tree_heads', [treeHead]);

  const indexMappings = leafHashes.map((hash, idx) => ({
    seal_id: receipts[idx].seal_id || crypto.randomUUID(),
    tree_id: treeId,
    leaf_index: currentTreeSize + idx,
    leaf_hash: hash
  }));

  await supabaseInsert(env, 'seal_tree_index', indexMappings);

  return { rootHash, signature, newTreeSize };
}

async function recomputeRightEdge(env, treeId, oldSize, newSize) {
  const leaves = await supabaseQuery(
    env,
    'merkle_nodes',
    `tree_id=eq.${treeId}&level=eq.0&order=index.asc`
  );

  if (leaves.length === 0) {
    throw new Error('No leaves found');
  }

  let currentLevel = leaves;
  let level = 0;

  while (currentLevel.length > 1 || level === 0) {
    const nextLevel = [];

    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = currentLevel[i + 1];

      const isRightEdge = (i + 2 === currentLevel.length);

      if (isRightEdge || right) {
        const parentHash = right
          ? await computeParentHash(left.hash, right.hash)
          : await computeParentHash(left.hash, left.hash);

        nextLevel.push({
          tree_id: treeId,
          level: level + 1,
          index: Math.floor(i / 2),
          hash: parentHash
        });
      }
    }

    if (nextLevel.length > 0) {
      await supabaseInsert(env, 'merkle_nodes', nextLevel);
    }

    currentLevel = nextLevel;
    level++;
  }

  return currentLevel[0].hash;
}

async function generateInclusionProof(env, treeId, leafIndex, treeSize) {
  const proof = [];
  let currentIndex = leafIndex;
  let currentLevel = 0;

  while (2 ** currentLevel < treeSize) {
    const siblingIndex = currentIndex % 2 === 0
      ? currentIndex + 1
      : currentIndex - 1;

    const siblings = await supabaseQuery(
      env,
      'merkle_nodes',
      `tree_id=eq.${treeId}&level=eq.${currentLevel}&index=eq.${siblingIndex}`
    );

    if (siblings.length > 0) {
      proof.push({
        index: siblingIndex,
        hash: siblings[0].hash
      });
    }

    currentIndex = Math.floor(currentIndex / 2);
    currentLevel++;
  }

  return proof;
}

async function generateConsistencyProof(env, treeId, size1, size2) {
  if (size1 > size2) {
    throw new Error('size1 must be <= size2');
  }

  if (size1 === size2) {
    return [];
  }

  const proof = [];

  const leaves1 = await supabaseQuery(
    env,
    'merkle_nodes',
    `tree_id=eq.${treeId}&level=eq.0&index=lt.${size1}&order=index.desc&limit=1`
  );

  if (leaves1.length === 0) {
    throw new Error('Tree 1 has no leaves');
  }

  let index1 = leaves1[0].index;
  let level = 0;

  while (index1 > 0) {
    if (index1 % 2 === 1) {
      const siblings = await supabaseQuery(
        env,
        'merkle_nodes',
        `tree_id=eq.${treeId}&level=eq.${level}&index=eq.${index1 - 1}`
      );

      if (siblings.length > 0) {
        proof.push({
          index: index1 - 1,
          hash: siblings[0].hash
        });
      }
    }

    index1 = Math.floor(index1 / 2);
    level++;
  }

  return proof;
}

async function signTreeHead(treeSize, rootHashStr, timestamp, signingKeyStr) {
  if (!signingKeyStr || !signingKeyStr.startsWith('ed25519:')) {
    throw new Error('Invalid signing key format');
  }

  const keyHex = signingKeyStr.replace('ed25519:', '');
  const keyBytes = fromHex(keyHex);

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'Ed25519', namedCurve: 'Ed25519' },
    false,
    ['sign']
  );

  const rootHashBytes = fromHex(rootHashStr.replace('sha256:', ''));
  const timestampBytes = new TextEncoder().encode(timestamp);

  const treeSizeBuffer = new ArrayBuffer(8);
  const view = new DataView(treeSizeBuffer);
  view.setBigInt64(0, BigInt(treeSize), false);

  const message = new Uint8Array(
    8 + rootHashBytes.length + timestampBytes.length
  );
  message.set(new Uint8Array(treeSizeBuffer), 0);
  message.set(rootHashBytes, 8);
  message.set(timestampBytes, 8 + rootHashBytes.length);

  const signatureBytes = await crypto.subtle.sign('Ed25519', key, message);
  return 'ed25519:' + hex(new Uint8Array(signatureBytes));
}

async function verifyTreeHead(treeSize, rootHashStr, timestamp, signatureStr, publicKeyStr) {
  if (!signatureStr || !signatureStr.startsWith('ed25519:')) {
    throw new Error('Invalid signature format');
  }

  if (!publicKeyStr || !publicKeyStr.startsWith('ed25519:')) {
    throw new Error('Invalid public key format');
  }

  const signatureHex = signatureStr.replace('ed25519:', '');
  const publicKeyHex = publicKeyStr.replace('ed25519:', '');

  const signatureBytes = fromHex(signatureHex);
  const publicKeyBytes = fromHex(publicKeyHex);

  const key = await crypto.subtle.importKey(
    'raw',
    publicKeyBytes,
    { name: 'Ed25519', namedCurve: 'Ed25519' },
    false,
    ['verify']
  );

  const rootHashBytes = fromHex(rootHashStr.replace('sha256:', ''));
  const timestampBytes = new TextEncoder().encode(timestamp);

  const treeSizeBuffer = new ArrayBuffer(8);
  const view = new DataView(treeSizeBuffer);
  view.setBigInt64(0, BigInt(treeSize), false);

  const message = new Uint8Array(
    8 + rootHashBytes.length + timestampBytes.length
  );
  message.set(new Uint8Array(treeSizeBuffer), 0);
  message.set(rootHashBytes, 8);
  message.set(timestampBytes, 8 + rootHashBytes.length);

  return crypto.subtle.verify('Ed25519', key, signatureBytes, message);
}

async function handleInclusionProof(request, env, ctx) {
  try {
    const url = new URL(request.url);
    const sealId = url.searchParams.get('seal_id');
    const treeSize = url.searchParams.get('tree_size');

    if (!sealId) {
      return errorResponse('INVALID_PARAMS', 'seal_id is required');
    }

    const indexRows = await supabaseQuery(
      env,
      'seal_tree_index',
      `seal_id=eq.${sealId}`
    );

    if (indexRows.length === 0) {
      return errorResponse('NOT_FOUND', 'Seal not found in tree');
    }

    const { tree_id, leaf_index } = indexRows[0];

    let targetTreeSize;
    if (treeSize) {
      targetTreeSize = parseInt(treeSize, 10);
    } else {
      const heads = await supabaseQuery(
        env,
        'tree_heads',
        `tree_id=eq.${tree_id}&order=tree_size.desc&limit=1`
      );
      targetTreeSize = heads[0].tree_size;
    }

    const proof = await generateInclusionProof(env, tree_id, leaf_index, targetTreeSize);

    return jsonResponse({
      seal_id: sealId,
      leaf_index: leaf_index,
      tree_size: targetTreeSize,
      proof: proof
    });
  } catch (error) {
    console.error('[INCLUSION_PROOF]', error);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

async function handleConsistencyProof(request, env, ctx) {
  try {
    const url = new URL(request.url);
    const treeId = url.searchParams.get('tree_id');
    const size1 = parseInt(url.searchParams.get('size_1'), 10);
    const size2 = parseInt(url.searchParams.get('size_2'), 10);

    if (!treeId || !size1 || !size2) {
      return errorResponse('INVALID_PARAMS', 'tree_id, size_1, size_2 are required');
    }

    const proof = await generateConsistencyProof(env, treeId, size1, size2);

    return jsonResponse({
      tree_id: treeId,
      size_1: size1,
      size_2: size2,
      proof: proof
    });
  } catch (error) {
    console.error('[CONSISTENCY_PROOF]', error);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

async function handleTreeHead(request, env, ctx) {
  try {
    const url = new URL(request.url);
    const treeId = url.searchParams.get('tree_id');

    let query = 'order=tree_size.desc&limit=1';
    if (treeId) {
      query = `tree_id=eq.${treeId}&${query}`;
    }

    const heads = await supabaseQuery(env, 'tree_heads', query);

    if (heads.length === 0) {
      return errorResponse('NOT_FOUND', 'No tree head found');
    }

    const head = heads[0];

    return jsonResponse({
      tree_id: head.tree_id,
      tree_size: head.tree_size,
      root_hash: head.root_hash,
      signature: head.signature,
      timestamp: head.timestamp
    });
  } catch (error) {
    console.error('[TREE_HEAD]', error);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

async function handleVerificationKey(request, env, ctx) {
  try {
    if (!env.MERKLE_VERIFICATION_KEY) {
      return errorResponse('SERVICE_UNAVAILABLE', 'Verification key not configured');
    }

    return jsonResponse({
      key_type: 'Ed25519',
      public_key: env.MERKLE_VERIFICATION_KEY,
      algorithm: 'Ed25519',
      usage: 'Merkle tree head signature verification'
    });
  } catch (error) {
    console.error('[VERIFICATION_KEY]', error);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

export {
  handleInclusionProof,
  handleConsistencyProof,
  handleTreeHead,
  handleVerificationKey,
  batchInsertLeaves,
  computeLeafHash,
  computeParentHash,
  generateInclusionProof,
  generateConsistencyProof,
  signTreeHead,
  verifyTreeHead,
  canonicalizeJSON,
  hex,
  fromHex
};
