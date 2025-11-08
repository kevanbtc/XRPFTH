# XRPFTH Infrastructure Overview

This document provides a color‑coded overview of environments, topology, operational controls, and monitoring flows supporting XRPFTH.

## 1) Environment Layers

```mermaid
flowchart LR
  DEV[Dev / Local] --> TST[Testnet]
  TST --> STG[Staging]
  STG --> PRD[Production]

  classDef dev fill:#6A5ACD,color:#fff;
  classDef tst fill:#2D9CDB,color:#fff;
  classDef stg fill:#F39C12,color:#fff;
  classDef prd fill:#27AE60,color:#fff;

  class DEV dev;
  class TST tst;
  class STG stg;
  class PRD prd;
```

## 2) Production Topology (Simplified)

```mermaid
flowchart TB
  subgraph XRPLCluster[XRPL Validator Cluster]
    V1[Validator 1]
    V2[Validator 2]
    V3[Validator 3]
  end

  LB[HAProxy / Load Balancer] --> XRPLCluster
  API[Service API Layer] --> LB
  OPS[Ops Tooling / Admin] --> API
  MON[Monitoring / Metrics] --> API
  BKP[Backup & Snapshot] --> XRPLCluster

  classDef val fill:#00A1E0,color:#fff;
  classDef svc fill:#6A5ACD,color:#fff;
  classDef infra fill:#8E44AD,color:#fff;
  classDef mon fill:#2D9CDB,color:#fff;
  classDef bkp fill:#A66B00,color:#fff;

  class V1,V2,V3 val;
  class API svc;
  class LB infra;
  class OPS infra;
  class MON mon;
  class BKP bkp;
```

## 3) Operational Controls Flow

```mermaid
flowchart LR
  CHG[Change Request] --> REV[Review & Approval]
  REV --> DEP[Deploy]
  DEP --> VER[Post-Deploy Verification]
  VER --> MON[Continuous Monitoring]
  MON --> FEED[Metrics / Alerts]
  FEED --> RESP[Incident Response]

  classDef step fill:#6A5ACD,color:#fff;
  class CHG,REV,DEP,VER,MON,FEED,RESP step;
```

## 4) Monitoring Data Flow

```mermaid
flowchart TB
  XRPL[XRPL Nodes] --> EXP[Exporters]
  SVC[Services] --> EXP
  EXP --> PROM[Prometheus]
  PROM --> GRAF[Grafana]
  PROM --> ALERT[Alertmanager]
  ALERT --> OPS[Ops Team]

  classDef xrpl fill:#00A1E0,color:#fff;
  classDef svc fill:#6A5ACD,color:#fff;
  classDef exp fill:#8E44AD,color:#fff;
  classDef prom fill:#2D9CDB,color:#fff;
  classDef graf fill:#27AE60,color:#fff;
  classDef alert fill:#E74C3C,color:#fff;

  class XRPL xrpl;
  class SVC svc;
  class EXP exp;
  class PROM prom;
  class GRAF graf;
  class ALERT alert;
  class OPS alert;
```

## 5) Backup & DR Overview

```mermaid
flowchart LR
  PROD[(Prod Ledger + DB)] --> SNAP[Daily Snapshots]
  SNAP --> STORE[Immutable Storage]
  STORE --> VERIFY[Retention & Integrity Checks]
  STORE --> RESTORE[Recovery Procedure]
  RESTORE --> DR[DR Environment]

  classDef prod fill:#27AE60,color:#fff;
  classDef snap fill:#F39C12,color:#fff;
  classDef store fill:#6A5ACD,color:#fff;
  classDef verify fill:#2D9CDB,color:#fff;
  classDef restore fill:#00A1E0,color:#fff;
  classDef dr fill:#8E44AD,color:#fff;

  class PROD prod;
  class SNAP snap;
  class STORE store;
  class VERIFY verify;
  class RESTORE restore;
  class DR dr;
```

## Notes

- Color coding is consistent across diagrams for quick visual parsing.
- Detailed runbooks and thresholds should be appended as readiness matures.
- All production changes must flow through the Operational Controls pipeline.
