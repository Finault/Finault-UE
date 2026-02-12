/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT MAGIC ONBOARDING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Criticism #10: "Onboarding is 5 steps pretending to be zero friction."
 *
 * SOLUTION: True magic onboarding:
 * 1. User drags invoice onto landing page (NO signup required)
 * 2. Invoice is parsed INSTANTLY
 * 3. Results shown with watermark: "Save your results? [Create Free Account]"
 * 4. One-click signup with Google/Microsoft SSO
 * 5. Results are now saved to their account
 *
 * MOAT: Literally zero friction. They see value BEFORE signing up.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

/**
 * Magic Session - Temporary session for anonymous users
 */
export class MagicSession {
    constructor(env) {
        this.env = env;
        this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
    }

    /**
     * Create a magic session token for anonymous invoice parsing
     */
    async createSession() {
        const sessionId = `magic_${crypto.randomUUID()}`;
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        await this.supabase.from('magic_sessions').insert({
            id: sessionId,
            token_hash: crypto.createHash('sha256').update(token).digest('hex'),
            created_at: new Date().toISOString(),
            expires_at: expiresAt.toISOString(),
            status: 'active',
            data: {}
        });

        return { sessionId, token, expiresAt };
    }

    /**
     * Validate and get magic session
     */
    async getSession(token) {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        const { data, error } = await this.supabase
            .from('magic_sessions')
            .select('*')
            .eq('token_hash', tokenHash)
            .eq('status', 'active')
            .gt('expires_at', new Date().toISOString())
            .single();

        return data;
    }

    /**
     * Store parsed invoice in magic session
     */
    async storeParsedInvoice(sessionId, invoiceData) {
        const { data, error } = await this.supabase
            .from('magic_sessions')
            .update({
                data: {
                    invoice: invoiceData,
                    parsedAt: new Date().toISOString()
                },
                updated_at: new Date().toISOString()
            })
            .eq('id', sessionId)
            .select()
            .single();

        return data;
    }

    /**
     * Convert magic session to real account
     */
    async convertToAccount(token, userId, organizationId) {
        const session = await this.getSession(token);
        if (!session) throw new Error('Invalid or expired session');

        // Move invoice data to the new organization
        if (session.data?.invoice) {
            await this.supabase.from('invoices').insert({
                id: crypto.randomUUID(),
                organization_id: organizationId,
                provider: session.data.invoice.provider,
                period_start: session.data.invoice.periodStart,
                period_end: session.data.invoice.periodEnd,
                total_amount: session.data.invoice.totalAmount,
                line_items: session.data.invoice.lineItems,
                raw_data: session.data.invoice,
                status: 'parsed',
                created_at: new Date().toISOString(),
                created_by: userId,
                source: 'magic_onboarding'
            });
        }

        // Mark session as converted
        await this.supabase
            .from('magic_sessions')
            .update({
                status: 'converted',
                converted_to_org: organizationId,
                converted_at: new Date().toISOString()
            })
            .eq('id', session.id);

        return { success: true, invoiceMigrated: !!session.data?.invoice };
    }
}

/**
 * Magic Parser - Parse without authentication
 */
export class MagicParser {
    constructor(env) {
        this.env = env;
        this.magicSession = new MagicSession(env);
    }

    /**
     * Parse invoice without requiring authentication
     * Returns results immediately with a session token for claiming later
     */
    async parseAnonymous(content, options = {}) {
        // Create magic session
        const session = await this.magicSession.createSession();

        // Parse the invoice (using existing parser logic)
        const parseResult = await this.parseInvoice(content, options);

        // Store in session
        await this.magicSession.storeParsedInvoice(session.sessionId, parseResult);

        return {
            success: true,
            anonymous: true,
            session: {
                token: session.token,
                expiresAt: session.expiresAt,
                claimUrl: `/v1/magic/claim?token=${session.token}`
            },
            invoice: parseResult,
            cta: {
                title: 'Save Your Results',
                message: 'Create a free account to save this analysis, get ongoing insights, and generate CFO-ready close packs.',
                buttons: [
                    { label: 'Sign up with Google', action: 'google_sso', primary: true },
                    { label: 'Sign up with Microsoft', action: 'microsoft_sso' },
                    { label: 'Sign up with Email', action: 'email' }
                ]
            },
            watermark: {
                visible: true,
                message: 'Preview Mode - Create account to save'
            }
        };
    }

    /**
     * Parse invoice content (simplified version using patterns from universal parser)
     */
    async parseInvoice(content, options = {}) {
        const provider = this.detectProvider(content);
        const lineItems = this.extractLineItems(content, provider);
        const totals = this.calculateTotals(lineItems);

        return {
            provider,
            detectedFormat: options.format || 'csv',
            lineItems,
            lineItemCount: lineItems.length,
            ...totals,
            models: [...new Set(lineItems.map(l => l.model).filter(Boolean))],
            periodStart: this.extractPeriodStart(lineItems),
            periodEnd: this.extractPeriodEnd(lineItems),
            parsedAt: new Date().toISOString(),
            confidence: this.calculateConfidence(lineItems, totals)
        };
    }

    detectProvider(content) {
        const contentLower = content.toLowerCase();
        if (contentLower.includes('openai') || contentLower.includes('gpt-')) return 'openai';
        if (contentLower.includes('anthropic') || contentLower.includes('claude')) return 'anthropic';
        if (contentLower.includes('google') || contentLower.includes('gemini')) return 'google';
        if (contentLower.includes('azure')) return 'azure';
        if (contentLower.includes('bedrock')) return 'aws';
        if (contentLower.includes('cohere')) return 'cohere';
        if (contentLower.includes('mistral')) return 'mistral';
        return 'unknown';
    }

    extractLineItems(content, provider) {
        const lines = content.split('\n').filter(l => l.trim());
        const items = [];

        // Skip header line
        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(',').map(p => p.trim().replace(/"/g, ''));
            if (parts.length >= 3) {
                items.push({
                    date: parts[0] || null,
                    model: parts[1] || 'unknown',
                    tokens: parseInt(parts[2]) || 0,
                    cost: parseFloat(parts[3]) || 0,
                    requests: parseInt(parts[4]) || 1,
                    raw: lines[i]
                });
            }
        }

        return items;
    }

    calculateTotals(lineItems) {
        return {
            totalAmount: lineItems.reduce((sum, l) => sum + (l.cost || 0), 0),
            totalTokens: lineItems.reduce((sum, l) => sum + (l.tokens || 0), 0),
            totalRequests: lineItems.reduce((sum, l) => sum + (l.requests || 0), 0)
        };
    }

    extractPeriodStart(lineItems) {
        const dates = lineItems.map(l => new Date(l.date)).filter(d => !isNaN(d.getTime()));
        return dates.length > 0 ? new Date(Math.min(...dates)).toISOString() : null;
    }

    extractPeriodEnd(lineItems) {
        const dates = lineItems.map(l => new Date(l.date)).filter(d => !isNaN(d.getTime()));
        return dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : null;
    }

    calculateConfidence(lineItems, totals) {
        let confidence = 0.5; // Base confidence

        // More line items = higher confidence
        if (lineItems.length > 10) confidence += 0.1;
        if (lineItems.length > 50) confidence += 0.1;
        if (lineItems.length > 100) confidence += 0.1;

        // Valid totals increase confidence
        if (totals.totalAmount > 0) confidence += 0.1;
        if (totals.totalTokens > 0) confidence += 0.1;

        return Math.min(0.99, confidence);
    }
}

/**
 * Magic SSO Handler
 */
export class MagicSSO {
    constructor(env) {
        this.env = env;
        this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
        this.magicSession = new MagicSession(env);
    }

    /**
     * Generate OAuth URL for one-click signup
     */
    getGoogleAuthUrl(magicToken, redirectUri) {
        const state = Buffer.from(JSON.stringify({ magicToken, provider: 'google' })).toString('base64');
        const params = new URLSearchParams({
            client_id: this.env.GOOGLE_CLIENT_ID,
            redirect_uri: redirectUri || `${this.env.APP_URL}/auth/callback`,
            response_type: 'code',
            scope: 'email profile',
            state,
            prompt: 'select_account'
        });
        return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    }

    getMicrosoftAuthUrl(magicToken, redirectUri) {
        const state = Buffer.from(JSON.stringify({ magicToken, provider: 'microsoft' })).toString('base64');
        const params = new URLSearchParams({
            client_id: this.env.MICROSOFT_CLIENT_ID,
            redirect_uri: redirectUri || `${this.env.APP_URL}/auth/callback`,
            response_type: 'code',
            scope: 'email profile openid',
            state,
            prompt: 'select_account'
        });
        return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
    }

    /**
     * Complete SSO and claim magic session
     */
    async completeSSOAndClaim(code, state, provider) {
        // Decode state
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        const magicToken = stateData.magicToken;

        // Exchange code for tokens based on provider
        let userInfo;
        if (provider === 'google') {
            userInfo = await this.exchangeGoogleCode(code);
        } else if (provider === 'microsoft') {
            userInfo = await this.exchangeMicrosoftCode(code);
        }

        // Create or get user
        const user = await this.findOrCreateUser(userInfo);

        // Create or get organization
        const org = await this.findOrCreateOrg(user, userInfo);

        // Convert magic session to real account
        if (magicToken) {
            await this.magicSession.convertToAccount(magicToken, user.id, org.id);
        }

        // Generate session token
        const sessionToken = await this.createSession(user.id, org.id);

        return {
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            },
            organization: {
                id: org.id,
                name: org.name
            },
            session: sessionToken,
            redirectTo: '/dashboard',
            message: magicToken
                ? 'Welcome! Your invoice analysis has been saved.'
                : 'Welcome to Finault!'
        };
    }

    async exchangeGoogleCode(code) {
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: this.env.GOOGLE_CLIENT_ID,
                client_secret: this.env.GOOGLE_CLIENT_SECRET,
                redirect_uri: `${this.env.APP_URL}/auth/callback`,
                grant_type: 'authorization_code'
            })
        });
        const tokens = await response.json();

        // Get user info
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
        });
        return userResponse.json();
    }

    async exchangeMicrosoftCode(code) {
        const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: this.env.MICROSOFT_CLIENT_ID,
                client_secret: this.env.MICROSOFT_CLIENT_SECRET,
                redirect_uri: `${this.env.APP_URL}/auth/callback`,
                grant_type: 'authorization_code',
                scope: 'email profile openid'
            })
        });
        const tokens = await response.json();

        // Get user info
        const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
        });
        const userData = await userResponse.json();
        return {
            email: userData.mail || userData.userPrincipalName,
            name: userData.displayName,
            id: userData.id
        };
    }

    async findOrCreateUser(userInfo) {
        // Try to find existing user
        const { data: existing } = await this.supabase
            .from('users')
            .select('*')
            .eq('email', userInfo.email)
            .single();

        if (existing) return existing;

        // Create new user
        const { data: newUser, error } = await this.supabase
            .from('users')
            .insert({
                id: crypto.randomUUID(),
                email: userInfo.email,
                name: userInfo.name || userInfo.email.split('@')[0],
                created_at: new Date().toISOString(),
                source: 'magic_onboarding'
            })
            .select()
            .single();

        if (error) throw error;
        return newUser;
    }

    async findOrCreateOrg(user, userInfo) {
        // Check if user has an org
        const { data: membership } = await this.supabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .single();

        if (membership) {
            const { data: org } = await this.supabase
                .from('organizations')
                .select('*')
                .eq('id', membership.organization_id)
                .single();
            return org;
        }

        // Create new org
        const domain = userInfo.email.split('@')[1];
        const { data: newOrg, error } = await this.supabase
            .from('organizations')
            .insert({
                id: crypto.randomUUID(),
                name: domain || 'My Organization',
                tier: 'free',
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        // Add user as admin
        await this.supabase.from('organization_members').insert({
            organization_id: newOrg.id,
            user_id: user.id,
            role: 'admin',
            created_at: new Date().toISOString()
        });

        return newOrg;
    }

    async createSession(userId, orgId) {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        await this.supabase.from('sessions').insert({
            id: crypto.randomUUID(),
            user_id: userId,
            organization_id: orgId,
            token_hash: crypto.createHash('sha256').update(token).digest('hex'),
            expires_at: expiresAt.toISOString(),
            created_at: new Date().toISOString()
        });

        return token;
    }
}

/**
 * Magic Onboarding Complete Flow
 */
export class MagicOnboarding {
    constructor(env) {
        this.parser = new MagicParser(env);
        this.sso = new MagicSSO(env);
        this.session = new MagicSession(env);
    }

    /**
     * Step 1: Anonymous Parse
     * User drops invoice, sees results immediately, no signup
     */
    async parseWithoutSignup(content, options) {
        return this.parser.parseAnonymous(content, options);
    }

    /**
     * Step 2: Get SSO URLs
     * User wants to save, show one-click auth options
     */
    getSSOOptions(magicToken) {
        return {
            google: this.sso.getGoogleAuthUrl(magicToken),
            microsoft: this.sso.getMicrosoftAuthUrl(magicToken),
            email: `/auth/email?magic=${magicToken}`
        };
    }

    /**
     * Step 3: Complete Auth and Claim
     * User completes SSO, invoice data is migrated to their account
     */
    async completeAuth(code, state, provider) {
        return this.sso.completeSSOAndClaim(code, state, provider);
    }

    /**
     * Alternative: Claim with existing session
     * User is already logged in, just claim the magic session
     */
    async claimWithExistingSession(magicToken, userId, orgId) {
        return this.session.convertToAccount(magicToken, userId, orgId);
    }
}

// Export all classes
export default {
    MagicSession,
    MagicParser,
    MagicSSO,
    MagicOnboarding
};
