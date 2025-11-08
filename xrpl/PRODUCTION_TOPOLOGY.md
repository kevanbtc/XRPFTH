# XRPL Production Topology & Operations

**Status:** 🔄 PLANNING (Issue #3)  
**Priority:** MEDIUM  
**Last Updated:** 2025-11-08

---

## 1. Executive Summary

This document defines the production XRPL infrastructure topology for the FTH Program. A single-node setup is **inadequate for production** due to availability, performance, and data integrity risks. This topology provides:

- **High Availability**: Multi-node cluster with automatic failover
- **Data Integrity**: Full-history nodes for complete audit trail
- **Performance**: Load balancing across multiple nodes
- **Disaster Recovery**: Geographic distribution and backup strategies
- **Monitoring**: Real-time health checks and alerting

---

## 2. Production Architecture

### 2.1 Node Topology

```
┌─────────────────────────────────────────────────────────────┐
│                    XRPL Production Cluster                   │
└─────────────────────────────────────────────────────────────┘

        ┌──────────────────────────────────────┐
        │        Load Balancer (HAProxy)        │
        │      ripple.fth.internal:51234        │
        └──────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼─────┐  ┌─────▼──────┐  ┌────▼───────┐
│  PRIMARY    │  │  SECONDARY │  │  WITNESS   │
│  xrpld-01   │  │  xrpld-02  │  │  xrpld-03  │
│  us-east-1a │  │  us-east-1b│  │  us-west-2a│
│  Full Hist. │  │  Full Hist.│  │  Recent    │
│  RW         │  │  RW        │  │  RO        │
└─────────────┘  └────────────┘  └────────────┘
      │                │                │
      └────────────────┴────────────────┘
                       │
              ┌────────▼────────┐
              │  Backup Storage │
              │  S3 / Glacier   │
              │  Daily Snapshots│
              └─────────────────┘
```

### 2.2 Node Roles

| Node | Role | Region | History | Connection | Purpose |
|------|------|--------|---------|------------|---------|
| **xrpld-01** | Primary | us-east-1a | Full | Read/Write | Active transaction submission |
| **xrpld-02** | Secondary | us-east-1b | Full | Read/Write | Failover + load balancing |
| **xrpld-03** | Witness | us-west-2a | Recent (30d) | Read-Only | Geographic redundancy, queries |

### 2.3 Infrastructure Specifications

**Primary & Secondary Nodes:**
- **Instance Type**: AWS c5.2xlarge (8 vCPU, 16GB RAM)
- **Storage**: 1TB NVMe SSD (EBS gp3, 16,000 IOPS)
- **Network**: 10 Gbps, dedicated VPC
- **OS**: Ubuntu 22.04 LTS
- **rippled Version**: Latest stable (≥1.12.0)

**Witness Node:**
- **Instance Type**: AWS c5.xlarge (4 vCPU, 8GB RAM)
- **Storage**: 500GB NVMe SSD
- **Network**: 10 Gbps

---

## 3. High Availability Configuration

### 3.1 Load Balancer Setup

**HAProxy Configuration** (`/etc/haproxy/haproxy.cfg`):

```haproxy
global
    log /dev/log local0
    log /dev/log local1 notice
    maxconn 4096
    user haproxy
    group haproxy
    daemon

defaults
    log     global
    mode    http
    option  httplog
    option  dontlognull
    timeout connect 5000
    timeout client  50000
    timeout server  50000

frontend xrpl_websocket
    bind *:51234 ssl crt /etc/ssl/certs/ripple.fth.internal.pem
    mode http
    option forwardfor
    default_backend xrpl_nodes

backend xrpl_nodes
    mode http
    balance roundrobin
    option httpchk GET /health
    http-check expect status 200
    
    # Primary node (higher weight)
    server xrpld-01 10.0.1.10:51234 check weight 100 ssl verify none
    
    # Secondary node
    server xrpld-02 10.0.1.20:51234 check weight 100 ssl verify none
    
    # Witness node (read-only, lower weight)
    server xrpld-03 10.0.2.10:51234 check weight 50 ssl verify none backup
```

### 3.2 Failover Strategy

**Automatic Failover:**

1. **Health Checks**: HAProxy polls `/health` endpoint every 2 seconds
2. **Failure Detection**: 3 consecutive failures trigger node removal
3. **Traffic Rerouting**: Requests automatically route to healthy nodes
4. **Recovery**: Failed node rejoins pool after passing health checks

**Manual Failover:**

```bash
# Drain traffic from primary node
sudo systemctl stop haproxy
sudo haproxy -f /etc/haproxy/haproxy.cfg -D -sf $(cat /var/run/haproxy.pid)

# Verify secondary is handling traffic
curl -s https://ripple.fth.internal:51234/health

# Maintenance on primary
sudo systemctl stop rippled
# Perform maintenance
sudo systemctl start rippled

# Re-enable primary in HAProxy
sudo systemctl restart haproxy
```

### 3.3 Connection String

**Application Configuration:**

```typescript
// Single connection string for all environments
const XRPL_RPC_URL = process.env.XRPL_RPC_URL || 'wss://ripple.fth.internal:51234';

// Automatic failover handled by load balancer
const client = new xrpl.Client(XRPL_RPC_URL, {
  connectionTimeout: 10000,
  maxConnectionAttempts: 3,
});
```

---

## 4. Full-History Strategy

### 4.1 Rationale

**Why Full History?**

- **Compliance**: Complete audit trail for all FTHUSD/USDF transactions
- **Proof of Reserves**: Historical balance queries for any ledger
- **Dispute Resolution**: Reconstruct transaction history from genesis
- **Regulatory Requirements**: 7-year retention for financial records

### 4.2 Storage Requirements

| Ledger Range | Size | Node | Purpose |
|--------------|------|------|---------|
| Full History (2012-present) | ~600 GB | Primary, Secondary | Complete audit trail |
| Recent (30 days) | ~15 GB | Witness | Fast queries |
| Snapshots (daily) | ~600 GB/snapshot | S3 Glacier | Disaster recovery |

### 4.3 Full-History Configuration

**rippled.cfg** for Primary/Secondary:

```ini
[node_db]
type=NuDB
path=/var/lib/rippled/db/nudb
online_delete=0
advisory_delete=0

[database_path]
/var/lib/rippled/db

[ledger_history]
full

[fetch_depth]
full
```

### 4.4 History Backfill

**Initial Sync:**

```bash
# Start with recent ledgers
sudo systemctl start rippled

# Monitor sync progress
watch -n 5 'rippled server_info | grep complete_ledgers'

# Full history sync takes 7-14 days on fast hardware
# Monitor disk usage
df -h /var/lib/rippled
```

**Accelerated Sync** (using snapshot):

```bash
# Download validated snapshot from Ripple
wget https://s3.amazonaws.com/ripple-snapshots/mainnet/latest.tar.gz

# Extract to rippled data directory
sudo systemctl stop rippled
sudo tar -xzf latest.tar.gz -C /var/lib/rippled/db/
sudo chown -R rippled:rippled /var/lib/rippled/db/
sudo systemctl start rippled
```

---

## 5. Monitoring & Alerting

### 5.1 Metrics to Monitor

| Metric | Threshold | Severity | Action |
|--------|-----------|----------|--------|
| **Ledger Sync Lag** | > 5 ledgers | WARNING | Investigate network/CPU |
| **Ledger Sync Lag** | > 20 ledgers | CRITICAL | Failover to secondary |
| **Memory Usage** | > 80% | WARNING | Consider upgrade |
| **Memory Usage** | > 95% | CRITICAL | Immediate restart |
| **Disk Usage** | > 80% | WARNING | Plan expansion |
| **Disk Usage** | > 90% | CRITICAL | Emergency cleanup |
| **Peer Count** | < 5 peers | WARNING | Check network config |
| **API Response Time** | > 2 seconds | WARNING | Performance degradation |
| **Failed Transactions** | > 5% rate | CRITICAL | Investigation required |

### 5.2 Health Check Endpoints

**Custom Health Script** (`/usr/local/bin/xrpl-health.sh`):

```bash
#!/bin/bash

# Query rippled server info
SERVER_INFO=$(rippled server_info 2>&1)

# Extract key metrics
COMPLETE_LEDGERS=$(echo "$SERVER_INFO" | jq -r '.result.info.complete_ledgers // "0-0"')
VALIDATED_LEDGER=$(echo "$SERVER_INFO" | jq -r '.result.info.validated_ledger.seq // 0')
PEER_COUNT=$(echo "$SERVER_INFO" | jq -r '.result.info.peers // 0')
SERVER_STATE=$(echo "$SERVER_INFO" | jq -r '.result.info.server_state // "unknown"')

# Health checks
if [ "$SERVER_STATE" != "full" ] && [ "$SERVER_STATE" != "validating" ]; then
    echo "UNHEALTHY: server_state=$SERVER_STATE"
    exit 1
fi

if [ "$PEER_COUNT" -lt 5 ]; then
    echo "WARNING: low peer count ($PEER_COUNT)"
    exit 1
fi

if [ "$VALIDATED_LEDGER" -eq 0 ]; then
    echo "UNHEALTHY: no validated ledger"
    exit 1
fi

echo "HEALTHY: state=$SERVER_STATE, ledger=$VALIDATED_LEDGER, peers=$PEER_COUNT"
exit 0
```

### 5.3 Monitoring Tools

**Prometheus + Grafana Stack:**

**prometheus.yml:**

```yaml
scrape_configs:
  - job_name: 'xrpld'
    static_configs:
      - targets:
          - 'xrpld-01:9100'
          - 'xrpld-02:9100'
          - 'xrpld-03:9100'
    metrics_path: '/metrics'
    scrape_interval: 15s
```

**Grafana Dashboard:**
- Ledger sync status
- Transaction throughput
- API latency (p50, p95, p99)
- Memory/CPU/Disk usage
- Peer connectivity graph

### 5.4 Alerting Rules

**PagerDuty / OpsGenie Integration:**

```yaml
# alertmanager.yml
route:
  receiver: 'pagerduty'
  group_by: ['alertname', 'instance']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

receivers:
  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: '<PAGERDUTY_SERVICE_KEY>'
        severity: 'critical'

  - name: 'slack'
    slack_configs:
      - api_url: '<SLACK_WEBHOOK_URL>'
        channel: '#xrpl-alerts'
```

**Alert Conditions:**

```yaml
groups:
  - name: xrpl_alerts
    rules:
      - alert: XRPLNodeDown
        expr: up{job="xrpld"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "XRPL node {{ $labels.instance }} is down"

      - alert: XRPLLedgerLag
        expr: xrpl_ledger_lag > 20
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "XRPL node {{ $labels.instance }} is behind by {{ $value }} ledgers"

      - alert: XRPLHighMemory
        expr: node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes < 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "XRPL node {{ $labels.instance }} memory usage critical"
```

---

## 6. Disaster Recovery

### 6.1 Backup Strategy

**Daily Snapshots:**

```bash
#!/bin/bash
# /usr/local/bin/xrpl-backup.sh

DATE=$(date +%Y%m%d)
BACKUP_DIR="/backup/xrpl-$DATE"
S3_BUCKET="s3://fth-xrpl-backups"

# Stop rippled gracefully
sudo systemctl stop rippled

# Create backup
mkdir -p "$BACKUP_DIR"
sudo tar -czf "$BACKUP_DIR/nudb-$DATE.tar.gz" /var/lib/rippled/db/nudb/
sudo tar -czf "$BACKUP_DIR/config-$DATE.tar.gz" /etc/opt/ripple/

# Upload to S3
aws s3 sync "$BACKUP_DIR" "$S3_BUCKET/$DATE/" --storage-class GLACIER

# Restart rippled
sudo systemctl start rippled

# Cleanup local backups older than 7 days
find /backup -type d -mtime +7 -exec rm -rf {} \;
```

**Backup Schedule:**
- **Daily**: Full database snapshot to S3 Glacier
- **Hourly**: Config files to S3 Standard
- **Retention**: 90 days S3 Glacier, 7 years compliance archive

### 6.2 Recovery Procedures

**Scenario 1: Single Node Failure**

```bash
# 1. Provision new instance
aws ec2 run-instances --image-id ami-xxx --instance-type c5.2xlarge

# 2. Restore from backup
aws s3 cp s3://fth-xrpl-backups/20251108/nudb-20251108.tar.gz /tmp/
sudo tar -xzf /tmp/nudb-20251108.tar.gz -C /var/lib/rippled/

# 3. Start rippled
sudo systemctl start rippled

# 4. Verify sync
rippled server_info | jq '.result.info.server_state'

# 5. Re-add to load balancer
# Update HAProxy config and reload
```

**Scenario 2: Complete Cluster Failure**

```bash
# 1. Restore primary node from most recent backup
# 2. Allow primary to sync to network (may take hours)
# 3. Restore secondary nodes from primary snapshot
# 4. Bring up load balancer
# 5. Verify all issuer accounts and transaction history
```

**Scenario 3: Data Corruption**

```bash
# 1. Stop corrupted node
sudo systemctl stop rippled

# 2. Verify corruption
rippled --conf=/etc/opt/ripple/rippled.cfg --ledger validate

# 3. Restore from last known good backup
# 4. Alternative: Resync from healthy secondary node
rsync -avz xrpld-02:/var/lib/rippled/db/ /var/lib/rippled/db/
```

### 6.3 Recovery Time Objectives (RTO)

| Scenario | RTO | RPO | Procedure |
|----------|-----|-----|-----------|
| Single node failure | < 5 minutes | 0 (no data loss) | Automatic failover via HAProxy |
| Primary node failure | < 15 minutes | 0 | Manual failover to secondary |
| Complete cluster failure | < 2 hours | < 1 hour | Restore from S3 backup |
| Data corruption | < 4 hours | < 24 hours | Restore from daily snapshot |
| Regional outage | < 8 hours | < 24 hours | Failover to witness node in us-west-2 |

---

## 7. Operational Runbooks

### 7.1 Node Upgrade Procedure

**Rolling Upgrade (Zero Downtime):**

```bash
# 1. Upgrade witness node first (read-only)
ssh xrpld-03
sudo systemctl stop rippled
sudo apt update && sudo apt upgrade rippled
sudo systemctl start rippled
# Verify: rippled server_info

# 2. Upgrade secondary node
# Remove from HAProxy pool
ssh xrpld-02
sudo systemctl stop rippled
sudo apt upgrade rippled
sudo systemctl start rippled
# Wait for sync, re-add to HAProxy

# 3. Upgrade primary node
# Failover to secondary first
# Follow same procedure as step 2
```

### 7.2 Configuration Changes

**Safe Configuration Update:**

```bash
# 1. Test on witness node first
ssh xrpld-03
sudo vi /etc/opt/ripple/rippled.cfg
sudo systemctl restart rippled
# Monitor logs: tail -f /var/log/rippled/debug.log

# 2. If stable, apply to secondary
# 3. Finally, apply to primary
```

### 7.3 Network Partition Response

**Detection:**

```bash
# Check peer connectivity
rippled peers | jq '.result.peers | length'

# Check ledger consensus
rippled server_info | jq '.result.info.validated_ledger'
```

**Response:**

1. **Identify**: Determine which nodes are partitioned
2. **Isolate**: Remove partitioned nodes from load balancer
3. **Investigate**: Check network ACLs, security groups, routing
4. **Resolve**: Fix network issue
5. **Resync**: Allow nodes to catch up
6. **Restore**: Re-add to load balancer pool

### 7.4 Transaction Submission Failure

**Diagnosis:**

```bash
# Check last validated ledger
rippled ledger validated

# Check fee escalation
rippled fee

# Check transaction queue
rippled server_info | jq '.result.info.load_factor'
```

**Remediation:**

1. **High Load**: Wait for load to decrease, retry with higher fee
2. **Network Issue**: Failover to secondary node
3. **Account Issue**: Verify account sequence number, reserve requirements
4. **Invalid TX**: Review transaction construction, check flags/paths

---

## 8. Security Considerations

### 8.1 Network Security

**VPC Configuration:**

- **Private Subnet**: XRPL nodes in private subnet (no internet access)
- **NAT Gateway**: Outbound traffic for XRPL network peering
- **Security Groups**:
  - Port 51235 (peer protocol): Allow from XRPL network
  - Port 51234 (WebSocket): Allow from application subnet only
  - Port 22 (SSH): Bastion host only

**Firewall Rules:**

```bash
# Allow XRPL peer protocol
sudo ufw allow 51235/tcp

# Allow WebSocket from application subnet only
sudo ufw allow from 10.0.3.0/24 to any port 51234

# Allow monitoring
sudo ufw allow from 10.0.4.0/24 to any port 9100

# Default deny
sudo ufw default deny incoming
sudo ufw enable
```

### 8.2 Access Control

**SSH Access:**

- **Bastion Host**: Single entry point, MFA required
- **SSH Keys**: Ed25519 keys, rotated quarterly
- **Audit Logging**: All SSH sessions logged to CloudWatch

**rippled Admin API:**

- **Disabled**: Admin commands disabled on production nodes
- **Read-Only**: Only read-only RPC methods exposed
- **Rate Limiting**: 100 req/sec per IP

### 8.3 TLS Configuration

**Certificate Management:**

```bash
# Use Let's Encrypt for internal certificates
sudo certbot certonly --standalone -d ripple.fth.internal

# Auto-renewal
sudo crontab -e
0 3 * * * certbot renew --quiet --deploy-hook "systemctl reload haproxy"
```

---

## 9. Cost Analysis

### 9.1 Monthly Infrastructure Costs (AWS us-east-1)

| Resource | Quantity | Unit Cost | Monthly Cost |
|----------|----------|-----------|--------------|
| EC2 c5.2xlarge (Primary) | 1 | $0.34/hr | $245 |
| EC2 c5.2xlarge (Secondary) | 1 | $0.34/hr | $245 |
| EC2 c5.xlarge (Witness) | 1 | $0.17/hr | $122 |
| EBS gp3 1TB (Primary) | 1 | $80/mo | $80 |
| EBS gp3 1TB (Secondary) | 1 | $80/mo | $80 |
| EBS gp3 500GB (Witness) | 1 | $40/mo | $40 |
| S3 Glacier (backups) | 5 TB | $0.004/GB | $20 |
| Data Transfer | 500 GB | $0.09/GB | $45 |
| Load Balancer | 1 | $16/mo | $16 |
| CloudWatch Logs | - | - | $25 |
| **Total** | | | **~$918/month** |

### 9.2 Cost Optimization

**Reserved Instances**: 40% savings on EC2 costs ($918 → $600/month)

**Spot Instances**: Use for witness node ($122 → $40/month)

**Storage Tiering**: Move old backups to Glacier Deep Archive

---

## 10. Implementation Checklist

### 10.1 Phase 1: Infrastructure Setup (Week 1)

- [ ] Provision EC2 instances (Primary, Secondary, Witness)
- [ ] Configure VPC, subnets, security groups
- [ ] Set up NAT gateway and routing tables
- [ ] Install rippled on all nodes
- [ ] Configure full-history on Primary & Secondary
- [ ] Install HAProxy load balancer

### 10.2 Phase 2: Initial Sync (Week 2-3)

- [ ] Start rippled on Primary node
- [ ] Monitor full-history sync (7-14 days)
- [ ] Start Secondary node, sync from Primary
- [ ] Start Witness node (recent history only)
- [ ] Verify all nodes reach "full" state

### 10.3 Phase 3: HA Configuration (Week 4)

- [ ] Configure HAProxy with all nodes
- [ ] Test automatic failover scenarios
- [ ] Set up SSL/TLS certificates
- [ ] Configure health check endpoints
- [ ] Update application connection strings

### 10.4 Phase 4: Monitoring & Backup (Week 5)

- [ ] Deploy Prometheus + Grafana stack
- [ ] Configure alerting (PagerDuty/Slack)
- [ ] Set up daily S3 backup jobs
- [ ] Test backup restoration procedures
- [ ] Create operational runbooks

### 10.5 Phase 5: Testing & Validation (Week 6)

- [ ] Load testing with realistic transaction volume
- [ ] Chaos testing (kill nodes, network partitions)
- [ ] Verify failover times meet RTO requirements
- [ ] Validate full-history queries work correctly
- [ ] Security audit (penetration testing)

### 10.6 Phase 6: Production Cutover (Week 7)

- [ ] Update DNS to point to load balancer
- [ ] Migrate issuer operations to production cluster
- [ ] Monitor for 48 hours before declaring success
- [ ] Document lessons learned
- [ ] Schedule quarterly DR drills

---

## 11. Maintenance Schedule

### 11.1 Regular Maintenance

| Task | Frequency | Downtime | Owner |
|------|-----------|----------|-------|
| OS security patches | Monthly | Rolling (zero) | DevOps |
| rippled version upgrade | Quarterly | Rolling (zero) | DevOps |
| SSL certificate renewal | Every 90 days | None | Automated |
| Backup verification | Weekly | None | DevOps |
| DR drill | Quarterly | Planned | Ops Team |
| Security audit | Annually | None | Security Team |

### 11.2 Maintenance Windows

**Preferred Window**: Sunday 02:00-06:00 UTC (low transaction volume)

**Change Freeze**: No changes 48 hours before major releases

---

## 12. Next Steps

1. **Immediate** (This Sprint):
   - [ ] Provision AWS infrastructure
   - [ ] Deploy rippled nodes
   - [ ] Begin full-history sync

2. **Short-Term** (Next Month):
   - [ ] Complete HA setup
   - [ ] Implement monitoring
   - [ ] Test failover procedures

3. **Medium-Term** (Next Quarter):
   - [ ] Migrate from development to production cluster
   - [ ] Complete first DR drill
   - [ ] Optimize costs with reserved instances

---

## 13. References

- **XRPL Docs**: [rippled Server Modes](https://xrpl.org/rippled-server-modes.html)
- **Ripple Best Practices**: [Capacity Planning](https://xrpl.org/capacity-planning.html)
- **Audit Report**: `xrpl/XRPL_AUDIT_REPORT.md` (Issue #3)
- **Security Plan**: `xrpl/SECURITY_PLAN.md`

---

**Document Status:** DRAFT - Requires approval from DevOps & Security teams before implementation
