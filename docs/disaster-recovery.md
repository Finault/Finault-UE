# Disaster Recovery Plan

**Version**: 1.0
**Last Updated**: March 20, 2026
**Maintained By**: Infrastructure & Operations Team
**Review Frequency**: Quarterly
**Next DR Test**: June 20, 2026

## Executive Summary

The Finault disaster recovery plan defines procedures to restore critical systems following a catastrophic failure. This plan ensures business continuity, minimizes data loss, and restores customer access within defined recovery objectives.

**Key Commitments**:
- **Recovery Time Objective (RTO)**: 2 hours maximum downtime
- **Recovery Point Objective (RPO)**: 1 hour maximum data loss
- **Backup Frequency**: Hourly backups with daily full snapshots
- **Test Schedule**: Quarterly DR drills
- **Documentation**: Tested procedures validated every quarter

---

## Recovery Objectives

### Recovery Time Objective (RTO)

**Definition**: Maximum acceptable time from disaster discovery to full service restoration.

**Finault RTO Targets**:

| Component | RTO | Priority |
|-----------|-----|----------|
| API Service | 30 minutes | Critical |
| Web Dashboard | 45 minutes | Critical |
| Database | 60 minutes | Critical |
| Report Generation | 90 minutes | High |
| Analytics Features | 120 minutes | Medium |
| Notifications | 120 minutes | Medium |

**RTO Assumptions**:
- Backup systems are accessible and functional
- Recovery team can be assembled within 15 minutes
- DNS/network failover available
- No physical datacenter destruction

---

### Recovery Point Objective (RPO)

**Definition**: Maximum acceptable data loss measured from disaster to recovery.

**Finault RPO Targets**:

| Data Type | RPO | Backup Frequency |
|-----------|-----|------------------|
| User Accounts | 1 hour | Hourly snapshots |
| Transaction Data | 1 hour | Hourly snapshots |
| Configuration | 1 hour | Hourly snapshots |
| Audit Logs | 4 hours | 4-hour snapshots |
| Analytics Data | 24 hours | Daily snapshots |

**RPO Assumptions**:
- Backups stored in geographically separate regions
- Backup integrity verified before retention
- Restore procedure can be initiated immediately

---

## Backup Strategy

### Supabase Database Backups

**Backup Configuration**:

1. **Automated Backups**
   - Frequency: Every hour (automated)
   - Retention: 30 days of hourly backups
   - Location: Supabase-managed US and EU regions
   - Redundancy: 3 copies maintained automatically

2. **Daily Full Snapshot**
   - Frequency: Once daily at 02:00 UTC
   - Retention: 90 days
   - Location: R2 object storage (encrypted)
   - Size: ~500MB-2GB depending on active users

3. **Backup Contents**
   - All production data
   - User accounts and credentials (hashed)
   - Transaction records
   - Application configuration
   - Historical audit logs

4. **Backup Verification**
   - Automated verification: daily
   - Test restore: weekly
   - Integrity check: SHA-256 validation
   - Size/record count alerts if anomalies detected

**Backup Access**:
- Primary: Supabase dashboard backup interface
- Secondary: Direct R2 export for manual recovery
- Credentials: Stored in secure vault (Doppler)
- Approval: Requires 2 engineers for restore

---

### R2 Object Storage Backups

**Backup Configuration**:

1. **Cross-Region Replication**
   - Primary Region: US (us-east-1)
   - Secondary Region: EU (eu-west-1)
   - Replication: Continuous, automatic
   - Sync Time: <5 minutes typical

2. **Backup Contents**
   - Generated reports and exports
   - User-uploaded documents
   - System snapshots
   - Historical data exports
   - Configuration backups

3. **Versioning**
   - All objects versioned
   - Retention: 90 days of versions
   - Recovery: Point-in-time restore available
   - Size: ~100GB-500GB depending on usage

4. **Backup Verification**
   - Automated listing validation
   - Access verification: daily
   - Cross-region sync check: hourly
   - Integrity: ETag validation on restore

---

### KV Store Snapshots

**Backup Configuration**:

1. **Snapshot Creation**
   - Frequency: Hourly automatic
   - Retention: 30 days
   - Size: ~10-50MB
   - Contents: Session data, cache, feature flags

2. **Snapshot Storage**
   - Location: R2 with cross-region replication
   - Encryption: AES-256 at rest
   - Format: JSON compressed snapshots

3. **Snapshot Verification**
   - Daily: Test deserialization
   - Weekly: Verify data consistency
   - Automated: Size/record count checks

---

### Application Configuration Backups

**Backup Configuration**:

1. **Version Control Backups**
   - Repository: GitHub (geographically redundant)
   - Branches: Main, staging, production
   - Retention: Unlimited (git history)
   - Recovery: Rollback to any commit

2. **Secrets Management**
   - Provider: Doppler
   - Backups: Daily automatic
   - Encryption: AES-256
   - Recovery: No recovery needed (live versioning)

3. **Deployment Configuration**
   - Docker images: Stored in registry
   - Terraform state: Backed up to R2
   - Environment configs: Version controlled
   - Recovery: Redeploy from verified image

---

## Restore Procedures

### Database Restore Procedure

**Step-by-step Restoration** (estimated time: 45-60 minutes):

**Preparation** (5 minutes):

1. Declare disaster/recovery mode
2. Assess damage scope and recovery point
3. Notify incident response team
4. Secure access to backup systems
5. Verify backup integrity and availability

**Database Restore** (30-45 minutes):

1. Access Supabase dashboard with recovery credentials
2. Navigate to Backups section
3. Select backup point (typically latest hourly backup)
4. Click "Restore from Backup"
5. Confirm restore point and timestamp
6. Monitor restore progress in Supabase logs
7. Verify database is online and accepting connections
8. Run integrity check queries:

```sql
-- Verify basic connectivity
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM transactions;
SELECT COUNT(*) FROM audit_logs;

-- Check for corruption
SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public';

-- Verify indexes exist
SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public';

-- Check recent data
SELECT MAX(created_at) FROM transactions;
SELECT MAX(updated_at) FROM users;
```

**Post-Restore Validation** (15 minutes):

1. Application connects successfully to restored database
2. API health check endpoints return 200 OK
3. User authentication tests successful
4. Sample queries return expected results
5. No corruption detected in logs
6. Backup timestamp logged for audit

**Rollback if Failed** (5 minutes):

- Restore from previous backup point
- Contact Supabase support for assistance
- Activate failover database if configured

---

### R2 Storage Restore Procedure

**Step-by-step Restoration** (estimated time: 15-30 minutes):

**Preparation** (5 minutes):

1. Identify data loss scope and recovery point
2. Verify backup in secondary region accessible
3. Obtain necessary R2 credentials
4. Prepare storage replication

**Storage Restore** (10-20 minutes):

1. Access Cloudflare R2 dashboard
2. Verify secondary region (EU) has current data
3. If primary corrupted:
   ```bash
   # Sync from secondary to primary
   rclone sync R2-EU:finault-backups/ R2-US:finault-backups/ --verbose
   ```
4. Monitor sync progress and verify completion
5. Spot-check restored files by accessing via API
6. Verify ETag values match source

**Post-Restore Validation** (5 minutes):

1. List all bucket contents and verify record count
2. Test file access and download
3. Verify permissions are correct
4. Check timestamps of restored objects
5. Log recovery details and timing

---

### Application Restore Procedure

**Step-by-step Restoration** (estimated time: 10-20 minutes):

**Preparation** (3 minutes):

1. Identify last known good deployment
2. Verify Docker image is available and not corrupted
3. Obtain deployment credentials

**Deployment Restore** (7-15 minutes):

1. Access deployment system (Cloudflare Workers, Vercel, or Kubernetes)
2. Identify current problematic deployment
3. Rollback or redeploy previous version:

   **Option A: Rollback**
   ```bash
   # Cloudflare Workers
   wrangler rollback --name finault-api --version [version-number]
   ```

   **Option B: Redeploy from Git**
   ```bash
   # Build from known good commit
   git checkout [last-known-good-commit]
   npm run build
   npm run deploy
   ```

4. Monitor deployment logs for errors
5. Wait for deployment to complete (usually 3-5 minutes)
6. Verify all instances are running

**Post-Deployment Validation** (5 minutes):

1. Health check endpoints respond 200 OK
2. Critical API endpoints functional
3. User authentication working
4. Dashboard loads without errors
5. No error spikes in monitoring

---

### KV Store Recovery Procedure

**Step-by-step Restoration** (estimated time: 5-10 minutes):

**Preparation** (2 minutes):

1. Identify data loss scope (sessions, cache, flags)
2. Determine if data recovery necessary (cache is non-critical)
3. Locate appropriate snapshot

**Recovery** (3-5 minutes):

For non-critical cache:
- Allow system to rebuild cache naturally
- Performance may be degraded initially
- No manual restore required

For critical session data:
1. Access KV snapshot in R2
2. Parse snapshot JSON file
3. Reingest data into KV store via API:
   ```javascript
   // Pseudocode for KV restoration
   const snapshot = await getSnapshotFromR2();
   for (const [key, value] of Object.entries(snapshot)) {
     await kv.put(key, JSON.stringify(value));
   }
   ```
4. Verify keys are accessible
5. Resume normal operations

**Post-Recovery Validation** (2 minutes):

1. Sessions are retrievable
2. No 404 errors on key access
3. TTL values re-applied
4. Performance returns to baseline

---

## Data Integrity Verification

### SHA-256 Verification Chain

**Before Disaster**:

1. Daily backup snapshot created
2. SHA-256 hash computed and stored
3. Hash stored in separate secure location
4. Sample integrity check performed

**After Restore**:

1. Recompute SHA-256 hash of restored data
2. Compare against original hash stored
3. If mismatch:
   - Restore from previous backup point
   - Investigate data corruption cause
   - Log incident for analysis

**Hash Verification Command**:

```bash
# Create hash of backup file
sha256sum finault-backup-2026-03-20.sql.gz > finault-backup-2026-03-20.sha256

# After restore, verify
sha256sum -c finault-backup-2026-03-20.sha256

# Expected output: OK
# Actual output: FAILED (indicates corruption)
```

### Record Count Validation

**Critical Table Validation**:

```sql
-- Before backup - record counts
users:                 [COUNT_1]
transactions:          [COUNT_2]
audit_logs:           [COUNT_3]
api_keys:             [COUNT_4]

-- After restore - run same queries
-- Counts should match exactly
```

**Variance Tolerance**:
- ±5 records: Acceptable (in-flight transactions)
- ±50 records: Investigate
- ±100+ records: Restore from alternate backup

### Data Quality Checks

```sql
-- Check for referential integrity
SELECT COUNT(*) FROM transactions
WHERE user_id NOT IN (SELECT id FROM users);
-- Expected result: 0 (no orphaned records)

-- Check for data inconsistencies
SELECT COUNT(*) FROM users
WHERE created_at > updated_at;
-- Expected result: 0

-- Verify encryption
SELECT COUNT(*) FROM api_keys
WHERE key NOT LIKE 'sha256_%';
-- Expected result: 0 (all hashed)
```

---

## Disaster Scenarios

### Scenario 1: Ransomware or Data Deletion

**Detection**: Unexpected mass data deletion, encryption, or unauthorized access

**Immediate Actions**:

1. **Isolate Systems** (5 minutes)
   - Disconnect affected systems from network
   - Prevent further propagation
   - Preserve logs for forensics

2. **Assess Scope** (10 minutes)
   - Determine what data was deleted/encrypted
   - Check backup integrity
   - Verify backups are unaffected

3. **Notify Stakeholders** (5 minutes)
   - Declare disaster mode
   - Page recovery team
   - Update status page

4. **Initiate Recovery** (immediately)
   - Restore from latest clean backup (usually within 1 hour)
   - Deploy to isolated environment first
   - Verify integrity before production switch

**Recovery Time**: 1-2 hours

**Expected Data Loss**: ≤1 hour (since last backup)

---

### Scenario 2: Database Corruption

**Detection**: Query failures, index corruption, referential integrity errors

**Immediate Actions**:

1. **Stop User Operations** (2 minutes)
   - Disable write operations
   - Activate read-only mode
   - Queue pending operations

2. **Assess Corruption** (10 minutes)
   - Run DBCC CHECKDB (or equivalent)
   - Identify corrupted tables/indexes
   - Determine if repair possible

3. **Recovery Decision** (5 minutes)
   - If repair possible: Attempt repair with backup
   - If repair impossible: Restore from backup
   - Verify integrity of chosen backup

4. **Restore and Validate** (30 minutes)
   - Follow database restore procedure
   - Run comprehensive integrity checks
   - Resume operations once validated

**Recovery Time**: 45 minutes - 1.5 hours

**Expected Data Loss**: ≤1 hour

---

### Scenario 3: Availability Zone Failure

**Detection**: All instances in AZ down, network issues, infrastructure alerts

**Immediate Actions**:

1. **Failover to Alternate Region** (10 minutes)
   - Activate secondary region database
   - Update DNS to secondary region
   - Deploy application to secondary

2. **Data Synchronization** (5 minutes)
   - Verify secondary database has recent data
   - Sync any missing recent changes
   - Validate consistency

3. **Monitor Failover** (10 minutes)
   - Watch error rates in monitoring
   - Verify user traffic reaching secondary
   - Monitor resource utilization

4. **Permanent Recovery** (ongoing)
   - Investigate primary region failure
   - Restore primary infrastructure
   - Migrate back to primary (or keep secondary as new primary)

**Recovery Time**: 20 minutes

**Expected Data Loss**: Minimal (typically <5 minutes)

---

### Scenario 4: External Dependency Failure

**Detection**: Supabase down, Cloudflare down, R2 unavailable

**Response by Service**:

**If Supabase Down** (60-90 min RTO target):
- Activate read-only mode for data retrieval
- Use cached data where available
- Queue write operations for later
- Monitor Supabase status page
- Contact Supabase support
- Once restored: Replay queued operations

**If Cloudflare Down** (20-30 min RTO target):
- Use direct IP if available
- Route through alternate CDN (if configured)
- Notify customers of alternate access
- Reduce security features temporarily
- Once restored: Restore full security posture

**If R2 Down** (2-4 hour RTO target):
- Reports cannot be generated (non-critical)
- Revert to document cache
- Queue report generation requests
- Once restored: Process queued requests

---

## Quarterly DR Test Procedure

### Test Scheduling

**Schedule**: Second week of each quarter
- Q1: January (mid-month)
- Q2: April (mid-month)
- Q3: July (mid-month)
- Q4: October (mid-month)

**Duration**: 2-3 hours

**Announcement**: 1 week in advance to team

**Scope**: Full restore of database and application from backups

### Test Execution

**Phase 1: Preparation** (30 minutes)

- [ ] Verify all backups are available and accessible
- [ ] Confirm recovery credentials are valid
- [ ] Document baseline system status (health checks, metrics)
- [ ] Alert team: "DR Test Starting - Not a Real Incident"
- [ ] Deploy to isolated test environment (not production)

**Phase 2: Database Restore** (45 minutes)

- [ ] Obtain database backup
- [ ] Initiate restore to test environment
- [ ] Monitor restore progress
- [ ] Run data integrity checks
- [ ] Measure restore time (target: <60 minutes)
- [ ] Record any issues or delays

**Phase 3: Application Restore** (30 minutes)

- [ ] Deploy application version to test environment
- [ ] Configure to use restored database
- [ ] Run health checks
- [ ] Test critical API endpoints
- [ ] Measure deployment time (target: <30 minutes)
- [ ] Record any issues or delays

**Phase 4: Validation** (30 minutes)

- [ ] API endpoint tests (pass/fail)
- [ ] User authentication test (pass/fail)
- [ ] Data retrieval tests (pass/fail)
- [ ] Report generation test (pass/fail)
- [ ] Performance benchmarking
- [ ] Document any deviations from expected behavior

**Phase 5: Postmortem** (30 minutes)

- [ ] Review test execution
- [ ] Compare actual times to RTO/RPO targets
- [ ] Identify gaps or improvements
- [ ] Document action items
- [ ] Update procedures if needed

### Success Criteria

- [ ] Full database restore completed within RTO (60 minutes)
- [ ] Application deployed within RTO (30 minutes)
- [ ] All critical data integrity checks passed
- [ ] API endpoints responding normally
- [ ] Data loss ≤ RPO target (1 hour)
- [ ] No critical issues identified

### Test Documentation

**Report Template**:

```
# DR Test Report - Q[X] 2026

**Date**: [test date]
**Team Members**: [names]
**Environment**: Test/Isolated

## Results

| Phase | Time | Target | Status |
|-------|------|--------|--------|
| Database Restore | 45 min | 60 min | PASS |
| Application Deploy | 12 min | 30 min | PASS |
| Validation Tests | 18 min | 20 min | PASS |
| **Total Time** | **75 min** | **120 min** | **PASS** |

## Data Integrity

- [ ] All tables restored
- [ ] Record counts verified
- [ ] No referential integrity errors
- [ ] Encryption verified
- [ ] Data loss: 0 records

## Issues Found

1. [Issue 1] - [severity]
2. [Issue 2] - [severity]

## Action Items

| Action | Owner | Deadline |
|--------|-------|----------|
| [improvement] | [person] | [date] |

## Lessons Learned

[Key takeaways from test]

**Next DR Test**: [next quarter date]
**Report Approval**: [signature]
```

---

## Contact Information

### Recovery Coordination

**Recovery Manager**
- Role: Coordinates overall disaster recovery
- Availability: On-call 24/7 during declared disasters
- Contact: recovery-manager@finault.com

**Database Administrator**
- Role: Executes database restore procedures
- Availability: Primary on-call, backup available
- Contact: dba-team@finault.com

**Infrastructure Engineer**
- Role: Handles application and network recovery
- Availability: On-call rotation
- Contact: infrastructure@finault.com

**Security Lead**
- Role: Handles security aspects, breach investigation
- Availability: On-call for security-related disasters
- Contact: security@finault.com

**Executive Escalation**
- Role: Final decision authority for recovery procedures
- Contact: management@finault.com

### External Contacts

**Supabase Support**
- URL: https://supabase.com/support
- Email: support@supabase.com
- Response Time: Usually <30 minutes (Pro plan)

**Cloudflare Support**
- URL: https://support.cloudflare.com
- Email: enterprise-support@cloudflare.com
- Response Time: 1 hour (Enterprise)

**Internet Provider**
- Provider: [ISP name]
- Contact: [support number]
- Account: [account number]

---

## Dependencies Map

```
User Requests
    ↓
Cloudflare (CDN/WAF)
    ├─ If Down: API inaccessible (20 min RTO)
    ├─ Backup: Direct IP access
    └─ Recovery: Wait for Cloudflare or use alternate CDN

API Service (Application)
    ├─ Depends: Supabase (database)
    ├─ Depends: R2 (storage)
    ├─ Depends: KV (cache/sessions)
    ├─ Depends: Workers (compute)
    └─ If Down: Restore from backup or rollback

Supabase (Database)
    ├─ Depends: PostgreSQL backend
    ├─ Depends: AWS infrastructure
    ├─ Backup: Hourly snapshots
    ├─ If Down: Restore from backup (60 min RTO)
    └─ Recovery: Switch to backup region (10 min failover)

R2 (Object Storage)
    ├─ Depends: AWS infrastructure
    ├─ Replication: Cross-region automatic
    ├─ If Down: Use replica region (5 min failover)
    └─ Recovery: Automatic replication resumes

KV Store (Cache/Sessions)
    ├─ Depends: Cloudflare Workers KV
    ├─ Backup: Hourly snapshots in R2
    ├─ If Down: Cache rebuild on recovery
    └─ Recovery: Restore from snapshot (5 min)

Dashboard (Web Interface)
    ├─ Depends: API Service
    ├─ Depends: CDN (for static assets)
    ├─ If Down: Restore from backup or use cached version
    └─ Recovery: Redeploy if needed (5 min)
```

---

## Testing and Validation

**Backup Restoration Tests**:
- Frequency: Weekly (automated)
- Scope: Restore sample backup to test environment
- Validation: Integrity checks, record count, data sampling
- Alert: If any test fails, page DBA immediately

**Failover Testing**:
- Frequency: Monthly (secondary systems)
- Scope: Test failover without affecting primary
- Validation: All systems functional in failover region
- Documentation: Record any issues or improvements

**DR Drill Execution**:
- Frequency: Quarterly (full test)
- Scope: Complete disaster recovery procedure
- Validation: All success criteria met
- Documentation: Comprehensive test report

---

## Continuous Improvement

**Post-Recovery Actions**:

1. **Incident Review**
   - Detailed analysis of what failed
   - Root cause identification
   - Contributing factors documented

2. **Procedure Updates**
   - Update documentation based on learnings
   - Add any discovered missing steps
   - Improve estimated recovery times

3. **Prevention Implementation**
   - Deploy monitoring improvements
   - Infrastructure hardening
   - Backup system enhancements

4. **Communication**
   - Customer communication about the incident
   - Transparency about root cause
   - Information about prevention measures

---

## Final Notes

This disaster recovery plan is a living document reviewed quarterly and updated after any recovery event. All team members should be familiar with their responsibilities in disaster recovery scenarios. Regular training and testing ensure we can execute these procedures under stress.

**Last Tested**: March 20, 2026
**Next Test**: June 20, 2026
**Approval**: Infrastructure Lead

For questions or updates: infrastructure@finault.com
