/**
 * Finault: Badge Generator
 * Creates and serves achievement badges for orgs with excellent AI margins
 */

/**
 * GET /v1/badge/:orgSlug.svg
 * PUBLIC, no auth required
 * Returns SVG badge based on org's margin tier
 */
export async function handleGetBadge(request, env, orgSlug) {
  try {
    // Sanitize slug
    const cleanSlug = String(orgSlug).toLowerCase().replace(/[^a-z0-9-]/g, '');

    // Look up org by slug
    const org = await env.DB.prepare(`
      SELECT id, name FROM orgs WHERE slug = ?
    `).bind(cleanSlug).first();

    if (!org) {
      return new Response('Not Found', { status: 404 });
    }

    // Check badge eligibility
    const profile = await env.DB.prepare(`
      SELECT badge_eligible, badge_tier FROM org_benchmark_profiles WHERE org_id = ?
    `).bind(org.id).first();

    if (!profile?.badge_eligible) {
      return new Response('Not Found', { status: 404 });
    }

    const tier = profile.badge_tier || 'standard';
    const svg = generateBadgeSVG(tier);

    return new Response(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('handleGetBadge error:', error);
    return new Response('Error', { status: 500 });
  }
}

/**
 * GET /v1/badge/config
 * Authenticated. Returns the org's badge status and embed code.
 */
export async function handleBadgeConfig(request, env) {
  try {
    const orgId = request.user?.org_id;
    if (!orgId) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get org info
    const org = await env.DB.prepare(`
      SELECT id, slug, name FROM orgs WHERE id = ?
    `).bind(orgId).first();

    if (!org) {
      return new Response(
        JSON.stringify({ error: 'Org not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get badge profile
    const profile = await env.DB.prepare(`
      SELECT badge_eligible, badge_tier, badge_earned_at FROM org_benchmark_profiles WHERE org_id = ?
    `).bind(orgId).first();

    if (!profile?.badge_eligible) {
      return new Response(
        JSON.stringify({
          eligible: false,
          tier: null,
          requirements: {
            margin_pct_target: 40,
            current_margin: null,
            message: 'Improve AI margins to 40%+ to earn a badge',
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const badgeUrl = `${env.GATEWAY_URL}/v1/badge/${org.slug}.svg`;
    const embedHtml = `<img src="${badgeUrl}" alt="Finault AI Margins Badge" style="height: 28px; vertical-align: middle;" />`;
    const embedMarkdown = `![Finault AI Margins Badge](${badgeUrl})`;

    return new Response(
      JSON.stringify({
        eligible: true,
        tier: profile.badge_tier,
        badge_earned_at: profile.badge_earned_at,
        badge_url: badgeUrl,
        embed_html: embedHtml,
        embed_markdown: embedMarkdown,
        tier_description: getBadgeTierDescription(profile.badge_tier),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('handleBadgeConfig error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch badge config' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * POST /v1/badge/check
 * Authenticated. Recalculates badge eligibility based on latest margin data.
 */
export async function handleCheckBadgeEligibility(request, env) {
  try {
    const orgId = request.user?.org_id;
    if (!orgId) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get org's latest metrics
    const metrics = await env.DB.prepare(`
      SELECT margin_pct FROM org_metrics
      WHERE org_id = ?
      ORDER BY period DESC
      LIMIT 1
    `).bind(orgId).first();

    if (!metrics) {
      return new Response(
        JSON.stringify({ error: 'No metrics found for org' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const marginPct = parseFloat(metrics.margin_pct);
    let tier = null;
    let eligible = false;

    // Determine tier
    if (marginPct >= 60) {
      tier = 'shooting_star';
      eligible = true;
    } else if (marginPct >= 40) {
      tier = 'rising';
      eligible = true;
    } else if (marginPct >= 20) {
      tier = 'standard';
      eligible = true;
    }

    // Update profile
    await env.DB.prepare(`
      UPDATE org_benchmark_profiles
      SET
        badge_eligible = ?,
        badge_tier = ?,
        badge_earned_at = CASE WHEN ? THEN NOW() ELSE badge_earned_at END,
        updated_at = NOW()
      WHERE org_id = ?
    `).bind(eligible, tier, eligible, orgId).run();

    return new Response(
      JSON.stringify({
        org_id: orgId,
        margin_pct: marginPct,
        eligible: eligible,
        tier: tier,
        tier_description: tier ? getBadgeTierDescription(tier) : null,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('handleCheckBadgeEligibility error:', error);
    return new Response(
      JSON.stringify({ error: 'Badge eligibility check failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ============================================================================
// SVG Badge Generation
// ============================================================================

/**
 * Generate SVG badge based on tier
 */
function generateBadgeSVG(tier) {
  const tiers = {
    shooting_star: {
      color: '#FFD700',
      label: 'Shooting Star ★',
      secondary: '#FFA500',
    },
    rising: {
      color: '#C0C0C0',
      label: 'Rising',
      secondary: '#808080',
    },
    standard: {
      color: '#CD7F32',
      label: 'Standard',
      secondary: '#8B4513',
    },
  };

  const config = tiers[tier] || tiers.standard;
  const text = `AI Margins: ${config.label}`;
  const poweredBy = 'Powered by Finault';

  // SVG dimensions
  const textWidth = text.length * 7;
  const poweredByWidth = poweredBy.length * 5;
  const totalWidth = Math.max(textWidth, poweredByWidth) + 40;
  const height = 44;

  // Badge SVG
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" viewBox="0 0 ${totalWidth} ${height}">
  <defs>
    <linearGradient id="badgeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${config.color};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${config.secondary};stop-opacity:1" />
    </linearGradient>
  </defs>

  <!-- Background rectangle -->
  <rect x="0" y="0" width="${totalWidth}" height="${height}" fill="url(#badgeGradient)" rx="4" />

  <!-- Border -->
  <rect x="0" y="0" width="${totalWidth}" height="${height}" fill="none" stroke="#1a1a1a" stroke-width="1" rx="4" />

  <!-- Main text -->
  <text x="${totalWidth / 2}" y="18" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">
    ${text}
  </text>

  <!-- Powered by text -->
  <text x="${totalWidth / 2}" y="34" font-family="Arial, sans-serif" font-size="8" fill="rgba(255, 255, 255, 0.9)" text-anchor="middle" dominant-baseline="middle">
    ${poweredBy}
  </text>
</svg>
  `.trim();
}

/**
 * Get badge tier description
 */
function getBadgeTierDescription(tier) {
  const descriptions = {
    shooting_star: {
      name: 'Shooting Star',
      color: 'Gold',
      margin_threshold: '60%+',
      description: 'Exceptional AI margins. Leading the network in cost optimization.',
    },
    rising: {
      name: 'Rising',
      color: 'Silver',
      margin_threshold: '40-60%',
      description: 'Strong AI margins. Above-average performance in unit economics.',
    },
    standard: {
      name: 'Standard',
      color: 'Bronze',
      margin_threshold: '20-40%',
      description: 'Solid AI margins. Tracking well against network benchmarks.',
    },
  };

  return descriptions[tier] || descriptions.standard;
}
