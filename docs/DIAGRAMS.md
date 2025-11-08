# XRPFTH Architecture & Flow Diagrams

## 1) System Architecture (color‑coded)

```mermaid
flowchart LR
  subgraph Clients
    A[Wallets & Apps]
  end

  subgraph XRPL[XRPL Layer]
    I[(Issuers)]
    T[Trustlines]
    P[Payments]
    SEC[Security Flags]
  end

  subgraph Services[XRPFTH Services]
    KYC[KYC/AML]
    GOLD[Gold Ops]
    TRE[Treasury]
    POR[Proof of Reserves]
  end

  subgraph EVM[EVM Sidecar]
    ORA[Oracle]
    REG[PoR Registry]
  end

  subgraph Ops[Operations]
    MON[Monitoring]
    BKP[Backups]
    DR[DR Runbooks]
  end

  A --> P
  I --> T --> P
  Services --> XRPL
  POR --> EVM
  Ops --> Services

  classDef xrpl fill:#00A1E0,stroke:#003B5C,color:#fff;
  classDef svc fill:#6A5ACD,stroke:#2F2B8A,color:#fff;
  classDef evm fill:#F39C12,stroke:#A66B00,color:#fff;
  classDef ops fill:#27AE60,stroke:#0E6B36,color:#fff;

  class XRPL xrpl;
  class Services svc;
  class EVM evm;
  class Ops ops;
```

## 2) XRPL Payment Security Flow

```mermaid
flowchart TD
  S[Start Payment] --> V1{Issuer Flags OK?}
  V1 -- No --> E1[Reject: RequireAuth/NoRipple missing]
  V1 -- Yes --> V2{Invariants OK?}
  V2 -- No --> E2[Reject: No Paths / No Partial]
  V2 -- Yes --> V3{Trustline Limits OK?}
  V3 -- No --> E3[Reject: Risk/limit]
  V3 -- Yes --> X[Submit Payment]

  classDef ok fill:#27AE60,color:#fff;
  classDef warn fill:#F39C12,color:#fff;
  classDef bad fill:#E74C3C,color:#fff;

  class V1,V2,V3 ok;
  class E1,E2,E3 bad;
```

## 3) Proof‑of‑Reserves Snapshot Pipeline

```mermaid
flowchart LR
  D[(Custody Data)] --> C[Compose Snapshot]
  L[(Ledger Data)] --> C
  C --> V[Validate Invariants]
  V --> R[Publish to Registry]
  R --> G[Grafana/Alerts]

  classDef step fill:#6A5ACD,color:#fff;
  classDef data fill:#00A1E0,color:#fff;

  class C,V,R,G step;
  class D,L data;
```

## 4) CI Pipeline (XRPL Integration Tests)

```mermaid
flowchart LR
  P[Push/PR] --> B[Build]
  B --> T[XRPL Integration Tests]
  T --> S{Security Checks}
  S -- pass --> G[Green]
  S -- fail --> R[Reject]

  classDef build fill:#2D9CDB,color:#fff;
  classDef test fill:#27AE60,color:#fff;
  classDef gate fill:#8E44AD,color:#fff;
  classDef red fill:#E74C3C,color:#fff;

  class B build;
  class T test;
  class S gate;
  class R red;
```