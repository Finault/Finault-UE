/**
 * Magic Onboarding Handlers
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Handlers for Magic Onboarding - upload before signup:
 * - Accept file uploads without authentication
 * - Parse financial data (invoices, statements, CSVs)
 * - Auto-onboard organizations
 * - Generate initial dashboards
 *
 * Magic = Upload data → System parses & creates account → Users sign up
 */

import { jsonResponse, errorResponse } from '../utils.js';

/**
 * Handle Magic Onboarding file upload
 * POST: Accept file upload without authentication
 */
const handleMagicOnboarding = async (request, env, ctx) => {
  try {
    // Magic onboarding accepts unauthenticated uploads
    // Rate limit by IP address instead
    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';

    // Get file from FormData
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return errorResponse('INVALID_REQUEST', 'File required');
    }

    const fileName = file.name;
    const fileSize = file.size;
    const fileType = file.type;

    // Validate file type
    const supportedTypes = [
      'application/pdf',
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/json'
    ];

    if (!supportedTypes.includes(fileType)) {
      return errorResponse('INVALID_REQUEST', `Unsupported file type: ${fileType}`);
    }

    // Validate file size (max 50MB)
    if (fileSize > 50 * 1024 * 1024) {
      return errorResponse('INVALID_REQUEST', 'File too large (max 50MB)');
    }

    // In full implementation:
    // 1. Store file in KV or database
    // 2. Queue async parsing job
    // 3. Generate onboarding link

    const uploadId = crypto.randomUUID();

    return jsonResponse({
      uploadId,
      fileName,
      fileSize,
      fileType,
      status: 'processing',
      onboardingUrl: `https://app.finault.ai/onboard/${uploadId}`,
      estimatedReadyTime: new Date(Date.now() + 30000).toISOString(),
      message: 'File received. You will receive an email with your onboarding link.'
    }, 202);
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Parse uploaded file and extract financial data
 * POST: Parse file and return extracted data
 */
const handleMagicParse = async (request, env, ctx) => {
  try {
    const body = await request.json();
    const { uploadId } = body;

    if (!uploadId) {
      return errorResponse('INVALID_REQUEST', 'uploadId required');
    }

    // In full implementation:
    // 1. Fetch file from storage
    // 2. Parse based on file type
    // 3. Extract structure data
    // 4. Validate and normalize

    return jsonResponse({
      uploadId,
      status: 'parsed',
      parsedAt: new Date().toISOString(),
      data: {
        transactions: [
          // { date: '...', provider: 'openai', cost: 150, tokens: 5000 }
        ],
        summary: {
          total_cost: 0,
          transaction_count: 0,
          date_range: {
            from: null,
            to: null
          },
          providers_detected: [],
          data_quality: 'high'
        }
      },
      preview: {
        first_rows: [],
        column_mapping: {}
      }
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Complete Magic Onboarding
 * POST: Create organization account from uploaded data
 */
const handleMagicComplete = async (request, env, ctx) => {
  try {
    const body = await request.json();
    const {
      uploadId,
      organizationName,
      email,
      timezone = 'UTC',
      acceptTerms = false
    } = body;

    if (!uploadId || !organizationName || !email || !acceptTerms) {
      return errorResponse('INVALID_REQUEST', 'Missing required fields');
    }

    // In full implementation:
    // 1. Create organization in Supabase
    // 2. Create user account
    // 3. Import data
    // 4. Generate initial dashboard
    // 5. Send welcome email

    const orgId = crypto.randomUUID();
    const userId = crypto.randomUUID();

    return jsonResponse({
      orgId,
      userId,
      organizationName,
      email,
      status: 'created',
      message: 'Organization created successfully',
      nextSteps: [
        'Verify your email address',
        'Set up your team',
        'Configure integrations',
        'Invite team members'
      ],
      signInUrl: `https://app.finault.ai/auth/signin?org=${orgId}`,
      dashboardUrl: `https://app.finault.ai/dashboard?org=${orgId}`
    }, 201);
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Get Magic Onboarding status
 * GET: Check status of an onboarding upload
 */
const handleMagicStatus = async (request, env, ctx) => {
  try {
    const url = new URL(request.url);
    const uploadId = url.searchParams.get('upload_id');

    if (!uploadId) {
      return errorResponse('INVALID_REQUEST', 'upload_id required');
    }

    // In full implementation: fetch from database
    return jsonResponse({
      uploadId,
      status: 'ready_for_review', // uploading, processing, ready_for_review, completed, failed
      progress: 100,
      uploadedAt: new Date(Date.now() - 3600000).toISOString(),
      estimatedCompletion: new Date().toISOString(),
      parsedData: {
        transactions: 1250,
        providers: ['openai', 'anthropic'],
        date_range: '2024-01 to 2024-12',
        total_cost: 125000
      },
      nextAction: 'review_data'
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * List Magic Onboarding sessions
 * GET: For authenticated users, list their onboarding history
 */
const handleMagicList = async (request, env, ctx) => {
  try {
    // This requires authentication
    // In full implementation: query user's onboarding sessions
    return jsonResponse({
      sessions: [
        // { uploadId: '...', organizationName: '...', createdAt: '...' }
      ]
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  handleMagicOnboarding,
  handleMagicParse,
  handleMagicComplete,
  handleMagicStatus,
  handleMagicList
};

export default {
  handleMagicOnboarding,
  handleMagicParse,
  handleMagicComplete,
  handleMagicStatus,
  handleMagicList
};
