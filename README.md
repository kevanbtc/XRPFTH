# XRPFTH — Professional Program Specs

[![Status: In Progress](https://img.shields.io/badge/Status-In%20Progress-yellow)](#overview)
[![Docs](https://img.shields.io/badge/Docs-Index-blue)](./docs/INDEX.md)
[![Architecture](https://img.shields.io/badge/Architecture-Diagrams-purple)](./docs/DIAGRAMS.md)

This repository is the professionally organized, boardroom‑ready documentation hub for the XRPFTH program. It includes:

- System specification and readiness gates
- Independent technical evaluation and cost/appraisal
- Color‑coded architecture diagrams and flow charts (Mermaid)
- Clear table of contents and navigable documentation structure

It intentionally contains specifications, designs, and runbooks — not production code.

---

## Table of Contents

- [Overview](#overview)
- [Key Documents](#key-documents)
- [Architecture & Diagrams](#architecture--diagrams)
- [Infrastructure Overview](#infrastructure-overview)
- [Repository Structure](#repository-structure)
- [How to Use](#how-to-use)
- [Roadmap Snapshot](#roadmap-snapshot)

---

## Overview

XRPFTH covers:

- FTH Dubai Shariah Gold (FTHS)
- TGUSD Stablecoin
- FTHUSD / USDF overlay rails
- Banking, KYC/AML, custody, compliance

This documentation defines what must exist and when it’s safe to launch.

---

## Key Documents

- LAUNCH READINESS: see `LAUNCH_READINESS.md` — the gatekeeper for production readiness (green = go)
- INDEPENDENT APPRAISAL: `INDEPENDENT_TECHNICAL_EVALUATION.md` — architecture, security, economics, build/replacement costs, ratings, boardroom narrative

See the full docs index at `docs/INDEX.md`.

---

## Architecture & Diagrams

High‑level architecture and flows are captured in `docs/DIAGRAMS.md`. Below is the top‑level system view:

```mermaid
flowchart LR
   subgraph Clients
      A[Wallets & Apps]
   end

   subgraph XRPL[XRPL Layer]
      I[(Issuers)]
      T[Trustlines]
      P[Payments]
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

---

## Infrastructure Overview

Detailed, color‑coded infra diagrams and flows live in `docs/INFRASTRUCTURE_OVERVIEW.md`.

---

## Repository Structure

```text
fth-program-specs/
├─ README.md                        # You are here – overview + TOC
├─ LAUNCH_READINESS.md              # Launch gates, risks, timelines
├─ INDEPENDENT_TECHNICAL_EVALUATION.md # Independent appraisal & costs
├─ docs/
│  ├─ INDEX.md                      # Documentation table of contents
│  ├─ DIAGRAMS.md                   # Architecture + flow charts (Mermaid)
│  └─ INFRASTRUCTURE_OVERVIEW.md    # Environments, topology, ops
├─ contracts/                       # Contract‑level specs & mapping
├─ scripts/                         # CLI / automation design (specs)
└─ ...                              # Additional design docs
```

---

## How to Use

1. Start with `LAUNCH_READINESS.md` — treat it as a PM board; each bullet can be an issue.
2. Map design to implementation via `contracts/README.md`.
3. Keep this repo implementation‑agnostic; production code lives elsewhere.
4. Update after every material decision (banks, KYC, custody, contract deltas).

---

## Roadmap Snapshot

Near‑term focus:

1. Harden and test the current contract stack on testnets.
2. Stand up one banking relationship and one KYC/AML flow.
3. Minimal UX for FTHUSD/MyUSDF (onboard, deposit/withdraw, balances).
4. Tiny internal pilot; iterate.

This repo ensures the warp drive passes safety inspection before launch.
