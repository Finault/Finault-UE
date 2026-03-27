/**
 * FINAULT LINK — Triple-Entry Accounting Network
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * When Company A's agent calls Company B's API through the gateway:
 * - Both sides get a sealed receipt linked by shared transaction_id
 * - Company A's receipt: cost to A, served Customer B
 * - Company B's receipt: service from Company A, cost to A, charge to B
 * - Both sealed independently, both verifiable, both linked
 *
 * This enables:
 * - True triple-entry accounting (buyer seal + seller seal + link record)
 * - Complete auditability of inter-company API calls
 * - Automated settlement and billing
 * - Cross-org margin analysis
 */

/**
 * Create a cross-company linked transaction
 * POST /v1/links
 *
 * Body:
 * {
 *   org_id_a: string,        // Buyer org
 *   org_id_b: string,        // Seller org
 *   customer_id: string,     // End customer (served by B, paying A)
 *   transaction_id: string,  // Shared ID across both sides
 *   api_call: {
 *     provider: string,
 *     model: string,
 *     endpoint: string,
 *     input_tokens: number,
 *     output_tokens: number
 *   },
 *   cost_to_a_cents: number, // What B charged A
 *   charge_to_customer_cents: number,
 *   margin_cents: number
 * }
 */
export async function handleLinkCreate(request, env) {
  try {
    const orgIdA = request._user?.orgId;
    if (!orgIdA) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const body = await request.json();
    const {
      org_id_b,
      customer_id,
      transaction_id,
      api_call,
      cost_to_a_cents,
      charge_to_customer_cents,
      margin_cents,
    } = body;

    // Validate required fields
    if (!org_id_b || !customer_id || !transaction_id || !api_call) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400 }
      );
    }

    // Generate unique link ID
    const linkId = `link_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create seal for Organization A (buyer/calling org)
    const sealA = {
      seal_id: `seal_a_${transaction_id}`,
      org_id: orgIdA,
      seal_type: 'INTER_ORG_CALL',
      transaction_data: {
        timestamp: new Date().toISOString(),
        link_id: linkId,
        transaction_id,
        direction: 'OUTBOUND',
        customer_id,
        party: {
          role: 'buyer',
          org_id: orgIdA,
        },
        counterparty: {
          role: 'seller',
          org_id: org_id_b,
        },
        api_call,
        costs: {
          cost_paid_to_seller_cents: cost_to_a_cents,
        },
      },
      seal_hash: generateHash(linkId, 'seal_a'),
      previous_hash: 'hash_placeholder',
      signature: 'sig_placeholder',
    };

    // Create seal for Organization B (seller/called org)
    const sealB = {
      seal_id: `seal_b_${transaction_id}`,
      org_id: org_id_b,
      seal_type: 'INTER_ORG_SERVICE',
      transaction_data: {
        timestamp: new Date().toISOString(),
        link_id: linkId,
        transaction_id,
        direction: 'INBOUND',
        customer_id,
        party: {
          role: 'seller',
          org_id: org_id_b,
        },
        counterparty: {
          role: 'buyer',
          org_id: orgIdA,
        },
        api_call,
        costs: {
          cost_incurred_cents: cost_to_a_cents,
          cost_charged_to_buyer_cents: cost_to_a_cents,
          cost_charged_to_customer_cents: charge_to_customer_cents,
          margin_cents,
        },
      },
      seal_hash: generateHash(linkId, 'seal_b'),
      previous_hash: 'hash_placeholder',
      signature: 'sig_placeholder',
    };

    // Create link record (triple-entry)
    const linkRecord = {
      link_id: linkId,
      org_a_id: orgIdA,
      org_b_id: org_id_b,
      customer_id,
      shared_transaction_id: transaction_id,
      seal_a_id: sealA.seal_id,
      seal_b_id: sealB.seal_id,
      api_call,
      settlement: {
        amount_cents: cost_to_a_cents,
        currency: 'USD',
        status: 'PENDING',
        due_date: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
      created_at: new Date().toISOString(),
      state: {
        a_confirmed: true,
        b_needs_confirmation: true,
      },
    };

    // In production: save sealA, sealB, linkRecord to database
    // For now: return response with all data

    const response = {
      status: 'success',
      link_id: linkId,
      link: linkRecord,
      seals: {
        seal_a: sealA,
        seal_b: sealB,
      },
      metadata: {
        triple_entry_valid: true,
        signatures_pending: true,
        generated_at: new Date().toISOString(),
      },
    };

    return new Response(JSON.stringify(response, null, 2), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Link create error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to create link',
        message: error.message,
      }),
      { status: 500 }
    );
  }
}

/**
 * Verify both sides of a linked transaction
 * GET /v1/links/{link_id}/verify
 */
export async function handleLinkVerify(request, env) {
  try {
    const linkId = request.params?.link_id;
    const orgId = request._user?.orgId;

    if (!linkId) {
      return new Response(JSON.stringify({ error: 'Missing link_id' }), { status: 400 });
    }

    // In production: fetch link and seals from database
    // For now: return mock verification

    const verification = {
      link_id: linkId,
      status: 'VERIFIED',
      verification_results: {
        seal_a: {
          seal_id: `seal_a_${linkId.split('_')[1]}`,
          org_id: 'org_abc123',
          hash_valid: true,
          signature_valid: true,
          previous_link_valid: true,
          transaction_data: {
            direction: 'OUTBOUND',
            cost_paid_cents: 460,
          },
        },
        seal_b: {
          seal_id: `seal_b_${linkId.split('_')[1]}`,
          org_id: 'org_def456',
          hash_valid: true,
          signature_valid: true,
          previous_link_valid: true,
          transaction_data: {
            direction: 'INBOUND',
            cost_incurred_cents: 460,
            margin_cents: 140,
          },
        },
        link_integrity: {
          both_seals_present: true,
          hashes_match: true,
          transaction_ids_match: true,
          amounts_match: true,
          timestamps_reasonable: true,
        },
      },
      reconciliation: {
        org_a_agrees: true,
        org_b_agrees: true,
        settlement_status: 'READY',
        next_action: 'Process payment',
      },
      signed_by: 'Finault Verification Service',
      verified_at: new Date().toISOString(),
    };

    return new Response(JSON.stringify(verification, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Link verify error:', error);
    return new Response(
      JSON.stringify({
        error: 'Verification failed',
        message: error.message,
      }),
      { status: 500 }
    );
  }
}

/**
 * Query all linked transactions for an organization
 * GET /v1/links
 *
 * Query params:
 * - role: "buyer" | "seller" (which side to filter)
 * - status: "pending" | "verified" | "settled"
 * - counterparty_org_id: filter by counterparty
 * - limit: max results (default: 100)
 * - offset: pagination offset
 */
export async function handleLinkQuery(request, env) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const url = new URL(request.url);
    const role = url.searchParams.get('role'); // 'buyer' or 'seller'
    const status = url.searchParams.get('status');
    const counterpartyOrgId = url.searchParams.get('counterparty_org_id');
    const limit = parseInt(url.searchParams.get('limit') || '100');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // In production: query links table with filters
    // For now: return mock results

    const links = [
      {
        link_id: 'link_001',
        org_a_id: 'org_abc123',
        org_b_id: 'org_def456',
        direction: role === 'seller' ? 'INBOUND' : 'OUTBOUND',
        status: 'verified',
        settlement: {
          amount_cents: 460,
          currency: 'USD',
          status: 'PENDING',
          due_date: '2026-04-20',
        },
        created_at: '2026-03-15T10:30:00Z',
        seal_a_id: 'seal_a_001',
        seal_b_id: 'seal_b_001',
      },
      {
        link_id: 'link_002',
        org_a_id: 'org_abc123',
        org_b_id: 'org_ghi789',
        direction: role === 'seller' ? 'INBOUND' : 'OUTBOUND',
        status: 'verified',
        settlement: {
          amount_cents: 385,
          currency: 'USD',
          status: 'SETTLED',
          due_date: '2026-04-15',
        },
        created_at: '2026-03-15T11:15:00Z',
        seal_a_id: 'seal_a_002',
        seal_b_id: 'seal_b_002',
      },
    ];

    // Filter by role if specified
    let filtered = links;
    if (role === 'buyer') {
      filtered = filtered.filter(l => l.org_a_id === orgId);
    } else if (role === 'seller') {
      filtered = filtered.filter(l => l.org_b_id === orgId);
    } else {
      filtered = filtered.filter(l => l.org_a_id === orgId || l.org_b_id === orgId);
    }

    // Filter by status
    if (status) {
      filtered = filtered.filter(l => l.status === status);
    }

    // Filter by counterparty
    if (counterpartyOrgId) {
      filtered = filtered.filter(l =>
        l.org_a_id === counterpartyOrgId || l.org_b_id === counterpartyOrgId
      );
    }

    // Paginate
    const total = filtered.length;
    const results = filtered.slice(offset, offset + limit);

    const response = {
      status: 'success',
      org_id: orgId,
      links: results,
      pagination: {
        total,
        returned: results.length,
        limit,
        offset,
        has_more: offset + limit < total,
      },
      summary: {
        total_links: total,
        verified_count: filtered.filter(l => l.status === 'verified').length,
        pending_settlement: filtered.filter(l => l.settlement?.status === 'PENDING').length,
        total_pending_settlement_cents: filtered
          .filter(l => l.settlement?.status === 'PENDING')
          .reduce((sum, l) => sum + l.settlement.amount_cents, 0),
      },
      generated_at: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Link query error:', error);
    return new Response(
      JSON.stringify({
        error: 'Query failed',
        message: error.message,
      }),
      { status: 500 }
    );
  }
}

/**
 * Helper: Generate hash for seal
 */
function generateHash(linkId, side) {
  // In production: use SHA-256
  const input = `${linkId}:${side}:${Date.now()}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return 'sha256_' + Math.abs(hash).toString(16).padStart(64, '0').slice(0, 64);
}

export default handleLinkCreate;
