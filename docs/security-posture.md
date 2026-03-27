# Security Posture Document

**Version**: 1.0
**Last Updated**: March 20, 2026
**Maintained By**: Security & Compliance Team
**Review Frequency**: Quarterly
**Classification**: Public (unclassified security posture)

## Executive Summary

Finault is built with security as a core design principle, not an afterthought. This document details our complete security posture, including encryption standards, authentication mechanisms, authorization controls, network security, and compliance frameworks. We commit to transparency and continuous security improvement.

**Key Security Commitments**:
- All data encrypted in transit (TLS 1.3) and at rest (AES-256)
- Zero-knowledge security model: we cannot access customer data
- Annual SOC 2 Type II certification
- Regular penetration testing by external security firms
- 24/7 security monitoring and incident response
- GDPR, CCPA, and global privacy law compliance

---

## Encryption Standards

### Encryption in Transit

**Protocol**: TLS 1.3 (mandatory, TLS 1.2 fallback with warning)

**Implementation**:
- All connections from client to Finault infrastructure encrypted
- API endpoints require TLS; unencrypted HTTP automatically redirected to HTTPS
- HSTS (HTTP Strict Transport Security) enabled with 1-year max-age
- Perfect Forward Secrecy (PFS) enabled for all connections
- Cipher suites: Only modern, strong ciphers allowed

**Certificate Management**:
- Certificate Authority: Let's Encrypt (auto-renewal 30 days before expiration)
- Certificate Pinning: Not implemented (flexibility preferred over absolute pinning)
- Wildcard Certificates: *.finault.com for all subdomains
- Certificate Transparency: All certificates logged to CT logs
- Monitoring: Certificate expiration alerts 30, 7, and 1 day before expiration

**Cipher Suite Policy**:

Allowed (in order of preference):
- TLS_AES_256_GCM_SHA384
- TLS_CHACHA20_POLY1305_SHA256
- TLS_AES_128_GCM_SHA256

Disabled:
- Any TLS version below 1.2
- RC4 cipher
- DES cipher
- MD5 hashing
- Export-grade encryption

**Verification**:
```bash
# Check TLS configuration
openssl s_client -connect api.finault.com:443 -tls1_3

# Expected: TLSv1.3 with appropriate cipher
# Forbidden: TLSv1.0, TLSv1.1, or weak ciphers
```

---

### Encryption at Rest

**Primary Encryption Standard**: AES-256-GCM

**Database Encryption** (Supabase):
- Supabase provides at-rest encryption for all data
- Encryption Key Management: AWS KMS (Supabase managed)
- Individual sensitive fields additionally encrypted:
  - API keys: SHA-256 hashed + salted (not encrypted, one-way)
  - Stored API credentials: AES-256-GCM encrypted
  - Personal identification data: AES-256-GCM encrypted

**Storage Encryption** (R2):
- All objects encrypted with AES-256
- Default encryption: Enabled at bucket level
- Key Management: Cloudflare managed
- Multipart uploads: Encrypted during transfer and storage

**Backup Encryption**:
- Database backups: Encrypted with AES-256-GCM
- Keys stored separately from backups
- Recovery keys backed up to secure vault (Doppler)

**Encryption in Code**:

```javascript
// Example: Encrypting sensitive data
const crypto = require('crypto');

function encryptSensitiveData(plaintext, encryptionKey) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Store: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function decryptSensitiveData(ciphertext, encryptionKey) {
  const [iv, authTag, encrypted] = ciphertext.split(':');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey,
    Buffer.from(iv, 'hex')
  );

  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

---

## Authentication

### API Key Authentication

**Storage**:
- Never stored plaintext
- Hashed using SHA-256 with salt
- User-provided API key: random 32-byte hex string
- Stored hash: SHA-256(api_key + salt)

**Key Format**:
```
finault_<environment>_<random-32-bytes>
Example: finault_prod_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

**Key Generation**:

```javascript
// Generate new API key
function generateApiKey() {
  const token = crypto.randomBytes(32).toString('hex');
  return `finault_prod_${token}`;
}

// Hash for storage
function hashApiKey(apiKey) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.createHash('sha256')
    .update(apiKey + salt.toString('hex'))
    .digest();
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

// Verify on request
function verifyApiKey(providedKey, storedHash) {
  const [salt, hash] = storedHash.split(':');
  const computedHash = crypto.createHash('sha256')
    .update(providedKey + salt)
    .digest('hex');
  return computedHash === hash;
}
```

**Key Rotation**:
- Recommended: Every 90 days
- Enforced: Every 1 year for compliance
- Procedure: Create new key, transition users, deactivate old key after 30 days
- Alerts: Email reminder 30 days before expiration

**Key Exposure Response**:
- Immediate: Revoke exposed key
- Customer notification: Within 1 hour
- Audit: Log which customer exposed, reason, scope of access
- Prevention: Implement secret scanning in CI/CD

---

### User Authentication

**Web Dashboard**: OAuth 2.0 with Google/GitHub
- No password storage required
- Multi-factor authentication (MFA) recommended
- Session tokens: Secure, httpOnly, sameSite=strict
- Token expiration: 7 days for web, 1 hour for API calls

**API Authentication**: Bearer token (API key)
- API keys: Stored hashed in database
- Request format: `Authorization: Bearer finault_prod_xxxxx`
- No expiration on valid keys (but annual rotation recommended)
- Rate limited: 100 requests per second per API key

**Session Management**:
- Session tokens: Randomly generated, 256-bit entropy
- Storage: Redis KV with 7-day TTL
- Validation: Checked on every request
- Revocation: Immediate on logout
- Secure cookie flags: Secure, HttpOnly, SameSite=Strict

---

## Authorization

### Role-Based Access Control (RBAC)

**User Roles**:

1. **Admin**
   - Full access to all resources
   - Can manage users, billing, settings
   - Can view all logs and reports
   - Cannot be revoked by other admins

2. **User**
   - Read access to own organization data
   - Can generate reports
   - Can manage own API keys
   - Cannot access billing or user management

3. **Viewer**
   - Read-only access to dashboards
   - Cannot generate reports
   - Cannot create API keys
   - Cannot modify any data

4. **API-Only**
   - API access only
   - Cannot log into web dashboard
   - Limited to programmatic access
   - No access to sensitive settings

**Permission Model**:

```
Resource: Organization
├─ admin: read, write, delete, manage-users
├─ user: read, write (limited)
├─ viewer: read
└─ api-only: read (API only)

Resource: Reports
├─ admin: read, write, delete, share
├─ user: read (own), write (own), share (with approval)
├─ viewer: read
└─ api-only: read (if subscribed)

Resource: Settings
├─ admin: read, write
├─ user: read, write (limited)
├─ viewer: none
└─ api-only: none
```

**Organization Access**:
- Users belong to one organization
- No cross-organization access possible
- Organization data completely isolated
- Multi-organization support: Enterprise only

---

## Network Security

### Cloudflare Protection Layer

**DDoS Protection**:
- Automatic DDoS mitigation at network edge
- Rate limiting: 100 requests/second per IP
- Challenge (CAPTCHA): On suspicious traffic patterns
- Blocking: Known malicious IPs automatically blocked

**Web Application Firewall (WAF)**:
- OWASP Top 10 protection enabled
- SQL injection prevention: All inputs validated
- XSS prevention: Content Security Policy headers
- CSRF protection: Token validation on state-changing operations
- Directory traversal prevention: Path normalization

**Firewall Rules**:
1. Block known botnets and malicious IPs
2. Block requests with suspicious patterns
3. Rate limit by IP (100 req/sec)
4. Block requests without valid User-Agent
5. Challenge requests from TOR exit nodes (optional by region)

**Page Rules**:
- API endpoints: No caching, strict security headers
- Static assets: 30-day caching, aggressive compression
- Dashboard: No caching, security headers enforced

---

### Network Architecture

**VPC Isolation** (Supabase):
- Each organization's data in separate logical schema
- No cross-tenant data access possible
- Network policies enforce data isolation

**Database Security** (Supabase):
- PostgreSQL SSL connections required
- No public internet access to database
- Access via Supabase API layer only
- Row-level security (RLS) policies enforce multi-tenancy

**API Gateway Security**:
- All requests validated before reaching backend
- Rate limiting: Per-user rate limits enforced
- IP allowlisting: Enterprise feature for security-critical customers
- Request signing: All requests signed with timestamp

---

## Secret Management

### Environment Variables

**Sensitive Data**:
- Database credentials
- API keys for third parties
- Encryption keys for sensitive data
- OAuth secrets
- JWT signing keys

**Storage**:
- Development: `.env.local` (git-ignored)
- Staging: Doppler KV store
- Production: Doppler KV store with audit logging

**Access Control**:
- Developers: Read access to staging/dev secrets
- CI/CD: Read access to production secrets (automated)
- Manual prod access: Requires 2 engineers (audit-logged)

**Rotation Policy**:
- JWT secrets: Every 90 days
- OAuth credentials: Immediate if compromised
- Database passwords: Every 180 days
- Encryption keys: Never rotated (breaks historical decryption)

**No Secrets in Code**:
- Secret scanning in CI/CD (TruffleHog)
- Pull request checks prevent secret commits
- Historical scan: Periodically scan entire repo for leaked secrets
- Automatic revocation: If secrets found, immediately invalidated

---

## Dependency Scanning

### npm/JavaScript Dependencies

**Vulnerability Scanning**:
- Tool: npm audit (built-in)
- Frequency: On every install, daily via CI/CD
- Severity Threshold:
  - Critical: Must fix before deploy
  - High: Must fix within 1 week
  - Medium: Must fix within 30 days
  - Low: Review, fix as possible

**Dependency Updates**:
- Automated: Dependabot creates PRs for updates
- Review: Required before merge
- Testing: Full test suite runs on each update
- Rollback: Ability to revert if issues found

**Locked Dependencies**:
- All production dependencies locked in package-lock.json
- No floating versions allowed
- Reproducible builds across environments

### Python Dependencies (if used)

**Vulnerability Scanning**:
- Tool: Safety or Bandit
- Frequency: On every install, daily via CI/CD
- Configuration: Same severity thresholds as npm

---

## Vulnerability Disclosure Policy

**Reporting Security Issues**:
- Email: security@finault.com (do not use public issue tracker)
- GPG Key: Available on security.html page
- Response Time: First response within 24 hours
- Confirmation: Detailed confirmation within 48 hours

**Process**:
1. Researcher reports vulnerability with proof-of-concept
2. Security team confirms and assigns severity
3. Fix developed and tested
4. Patch deployed to production
5. Researcher notified of fix
6. Public disclosure coordinated (usually 90 days after fix)

**Bounty Program** (coming Q2 2026):
- Critical: $5,000+
- High: $1,000-$5,000
- Medium: $500-$1,000
- Low: $100-$500

**Hall of Fame**:
- Acknowledged researchers listed on security page
- Press release for major findings
- Public credit (if researcher consents)

---

## Penetration Testing

### External Testing Schedule

**Frequency**: Annually (Q1)

**Scope**:
- Web application penetration test
- API security assessment
- Infrastructure security review
- Data exposure analysis
- Business logic flaws

**Provider**: Rotating third-party firms (to prevent complacency)
- 2024: [firm name]
- 2025: [firm name]
- 2026: [firm name]

**Process**:
1. Scope defined with testing firm
2. Testing window scheduled (typically 1-2 weeks)
3. Vulnerabilities documented
4. Security team remediates critical/high findings
5. Report reviewed internally
6. Re-test to confirm fixes
7. Findings shared with customers (redacted)

**Recent Results** (2025):
- No critical findings
- 3 high-severity findings (all patched)
- 12 medium-severity findings (reviewed, low risk)
- Recommendations implemented: 8/10

---

## Compliance Mapping

### SOC 2 Type II

**Status**: Certified annually

**Scope**:
- Security controls
- Availability of systems
- Processing integrity
- Confidentiality of data
- Privacy of personal information

**Audit Schedule**:
- Annual audit: December-January
- Coverage period: 12 months
- Report issued: February
- Validity: 12 months

**Certificate Details**:
- Auditor: Big 4 firm (rotated annually)
- Attestation: 12 months of controls testing
- Available: To qualified customers upon NDA

**Control Areas**:
1. Change management
2. Backup and recovery
3. Incident response
4. Access control
5. Data classification
6. Security monitoring
7. Physical security
8. Encryption standards

---

### GDPR (EU Data Protection)

**Compliance Areas**:

1. **Legal Basis**
   - Service Agreement constitutes lawful basis
   - Data Processing Agreement (DPA) in place
   - Legitimate interest documented

2. **Data Subject Rights**
   - Right to access: Supported via export feature
   - Right to erasure: Deletion within 30 days
   - Right to rectification: User can modify own data
   - Right to data portability: Standard format export
   - Right to restrict: Feature in development

3. **Privacy by Design**
   - Data minimization: Collect only necessary data
   - Encryption: All data encrypted
   - Purpose limitation: Clear use cases defined
   - Storage limitation: Clear retention policies

4. **Data Processing**
   - Data controller: Customer organization
   - Data processor: Finault (as defined in DPA)
   - Sub-processors: Listed and notified

5. **Data Breach Response**
   - 72-hour notification requirement: Implemented
   - Authority notification: Procedure in place
   - Data subject notification: Procedure in place

6. **Privacy Impact Assessment (DPIA)**
   - Conducted before new high-risk processing
   - Available to customers for review
   - Updated annually

---

### CCPA/CPRA (California Privacy)

**Compliance Areas**:

1. **Consumer Rights**
   - Right to know: Data export feature
   - Right to delete: Account deletion feature
   - Right to opt-out: Removal from marketing
   - Right to correct: Data modification feature
   - Right to limit use: Opt-out available

2. **Business Obligations**
   - Privacy policy: Clearly posted (privacy.html)
   - Consumer request handling: 45 days response time
   - Opt-out mechanisms: Multiple ways to opt-out
   - Non-discrimination: No price/service variation for rights exercise

3. **California Requirements**
   - Do Not Sell My Personal Information: Page available
   - Data disclosure: Available for California residents
   - Authorization verification: Identity verification required

---

### SOX (Sarbanes-Oxley) - If Applicable

**Control Requirements** (for public company customers):

1. **IT General Controls**
   - Access control: Role-based
   - Change management: Documented and approved
   - Segregation of duties: Enforced
   - System monitoring: Continuous logging

2. **Data Integrity**
   - Transaction logging: All transactions logged
   - Reconciliation: Regular reconciliation performed
   - Error detection: Automated validation
   - Recovery procedures: Tested quarterly

3. **Financial Data Handling**
   - Data classification: Financial data marked
   - Encryption: Financial data encrypted
   - Access logging: Access to financial data audited
   - Retention: 7-year retention for financial records

---

### EU AI Act Compliance

**AI Usage** (within Finault):

1. **Transparency**
   - Disclosure: Users informed that AI may be used
   - Purpose: Clear explanation of AI purpose
   - Limitations: Known limitations documented

2. **Risk Management**
   - Bias assessment: AI model tested for bias
   - Performance: Accuracy and reliability documented
   - Monitoring: Continuous performance monitoring
   - Audit trail: Decisions can be traced

3. **Data Protection**
   - Training data: Only Finault data, no customer data
   - Privacy: No data shared with external AI providers
   - Transparency: Methodology available to customers

---

## Security Monitoring

### Real-Time Monitoring

**Monitoring Tools**:
- Application errors: Sentry (all errors logged)
- Performance metrics: Custom dashboards
- Infrastructure: AWS CloudWatch
- Security logs: Supabase audit logs
- Access logs: Cloudflare logs

**Alert Thresholds**:

| Metric | Alert Threshold | Severity |
|--------|-----------------|----------|
| Error rate | >1% | High |
| API latency | >5 sec p95 | High |
| Login failures | >5 in 5min | Medium |
| API key usage | Unusual pattern | Medium |
| Database connections | >90% | High |
| Disk space | <10% | High |
| CPU usage | >85% | Medium |
| Memory usage | >90% | High |
| Unusual IP | From non-customer | Medium |
| Privilege escalation | Any attempt | Critical |

**Response Time**:
- Critical: <5 minutes response
- High: <15 minutes response
- Medium: <1 hour response

### Log Retention

**Logs Maintained**:
- Application logs: 30 days
- Access logs: 90 days
- Audit logs: 2 years
- Security logs: 2 years
- Infrastructure logs: 30 days

**Log Analysis**:
- Automated searches for suspicious patterns
- Weekly review of critical events
- Monthly trend analysis
- Annual comprehensive audit

---

## Security Best Practices

### Code Security

**Code Review**:
- All code reviewed by 2+ developers
- Security review required for auth/crypto changes
- Automated code analysis (ESLint, TypeScript strict mode)

**Testing**:
- Unit tests: >80% coverage
- Integration tests: Critical paths covered
- Security tests: Input validation verified
- Performance tests: No degradation

**Dependencies**:
- Regular updates: Weekly review
- Vulnerability scanning: Continuous
- Minimal dependencies: Only required packages

### Secrets Management

**Development**:
- Local .env files: Never committed
- Shared secrets: Via encrypted Doppler
- Access: Only developers need, rotate quarterly

**Production**:
- Doppler KV: All secrets encrypted
- Access logs: 2-year retention
- Rotation: Quarterly for non-cryptographic keys
- Backup: Encrypted, separate location

### Infrastructure Security

**Hardening**:
- Minimal attack surface: Only necessary ports open
- Latest patches: All systems patched within 1 week
- Firewalls: Strict ingress/egress rules
- Monitoring: All access logged

**Updates**:
- OS updates: Applied within 1 week
- Dependency updates: Applied within 2 weeks
- Security patches: Applied immediately (within 24 hours)
- Testing: Updates tested before production deployment

---

## Incident Response and Reporting

### Security Incident Response

**Detection to Response**:
- Discovery: <1 minute (automated monitoring)
- Confirmation: <5 minutes
- Containment: <15 minutes
- Investigation: <1 hour
- Remediation: Variable by issue
- Customer notification: <24 hours (if data exposed)

**Notification Process**:
1. Affected customers notified within 24 hours
2. Notification includes: What, when, how many, next steps
3. Credit monitoring (if applicable)
4. Full report within 5 days

### Third-Party Audits

**Audit Frequency**:
- SOC 2: Annually
- Penetration test: Annually
- Vulnerability scan: Quarterly
- Compliance audit: As required

**Audit Results**:
- Available to customers upon request (with NDA)
- Summary posted on public security page
- Remediation tracked and reported

---

## Security Team

**Roles**:

- **CISO** (Chief Information Security Officer)
  - Overall security strategy
  - Compliance leadership
  - Executive escalation

- **Security Engineers**
  - Vulnerability assessment
  - Penetration testing coordination
  - Incident response leadership

- **Compliance Officer**
  - Regulatory compliance
  - Audit coordination
  - Policy development

- **Infrastructure Security**
  - Network security
  - Data protection
  - Disaster recovery

**On-Call Schedule**:
- 24/7 availability for critical incidents
- Escalation path for severity levels
- Training: Quarterly security drills

---

## Security Updates and Notifications

**Security Advisories**:
- Posted on security@finault.com
- Email notifications to customers
- Status page updates for incidents
- Transparency: Timely disclosure

**Patch Management**:
- Critical: Deployed within 24 hours
- High: Deployed within 1 week
- Medium: Deployed within 2 weeks
- Low: Deployed in next regular release

**Communication**:
- Pre-notification: Customers notified before patch if needed
- Post-notification: Summary of patch included in release notes
- Transparency: No hidden security fixes

---

## Conclusion

Finault's security posture is built on defense-in-depth principles, combining multiple layers of protection. We invest continuously in security, collaborate with external experts, and maintain transparent communication with customers about our security practices.

Security is a journey, not a destination. We welcome feedback on our security practices and are committed to addressing any concerns promptly.

**For security questions**: security@finault.com
**Report vulnerabilities**: security@finault.com (GPG encrypted)
**Schedule audit**: compliance@finault.com

---

**Last Updated**: March 20, 2026
**Next Review**: June 20, 2026
**Approval**: Chief Information Security Officer
