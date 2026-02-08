# SkillProof SDK

Integrate skill-based access control into any protocol in 3 lines.

## Quick Start

```typescript
import { SkillProof } from "@skillproof/sdk";

const sdk = new SkillProof("https://coston2-api.flare.network/ext/C/rpc");

// Check if a user has ELO >= 1500 with time decay applied
const result = await sdk.checkGate(userAddress, {
  minElo: 1500,
  useDecayedElo: true,
});

if (result.passed) {
  // Grant access
} else {
  console.log(result.reason); // "ELO 923 below minimum 1500"
}
```

## Use Cases

### Skill-Gated DeFi

```typescript
// Only let skilled traders access leveraged pools
const canTrade = await sdk.checkGate(user, {
  minElo: 1800,
  requiredDomains: ["derivatives", "risk-mgmt"],
  useEffectiveElo: true, // includes reputation bonus
});
```

### Weighted Governance

```typescript
// Weight DAO votes by verified skill
const votingPower = await sdk.getEffectiveVotingPower(voter);
const cred = await sdk.getCredential(voter);
// votingPower = ELO-weighted, sybil-resistant
```

### Time-Decayed Access

```typescript
// Stale credentials lose access over time
const gate = await sdk.checkGate(user, {
  minElo: 1200,
  useDecayedElo: true, // ELO decays if credential not refreshed
});
```

### Cross-Issuer Identity

```typescript
// Aggregate scores across multiple game platforms
const aggregate = await sdk.getAggregateScore(user);
console.log(aggregate.overallScore); // composite ELO + cross-domain bonus
console.log(aggregate.issuerCount); // number of linked issuers
```

### ZK-Verified Thresholds

```typescript
// Check if user proved ELO >= threshold without revealing exact score
const isVerified = await sdk.isZKVerified(user);
const threshold = await sdk.getVerifiedThreshold(user);
```

## API Reference

### Core

| Method | Returns | Description |
|--------|---------|-------------|
| `getCredential(addr)` | `SkillCredential \| null` | Full on-chain credential (ELO, percentile, domains, scores) |
| `hasCredential(addr)` | `boolean` | Quick existence check |
| `checkGate(addr, config)` | `GateResult` | One-call skill gate check |

### ELO Variants

| Method | Returns | Description |
|--------|---------|-------------|
| `getEffectiveElo(addr)` | `number` | Base ELO + reputation bonus from Hub activity |
| `getDecayedElo(addr)` | `number` | Base ELO * time decay multiplier |
| `getReputationBonus(addr)` | `number` | Net reputation from predictions/bounties (can be negative) |
| `getDecayMultiplier(addr)` | `number` | Decay multiplier in basis points (10000 = 100%) |
| `getEffectiveVotingPower(addr)` | `number` | ELO-weighted governance power |

### Aggregation

| Method | Returns | Description |
|--------|---------|-------------|
| `getAggregateScore(addr)` | `AggregateScore` | Cross-issuer composite score |
| `getLinkedAddresses(addr)` | `string[]` | All linked identity addresses |

### ZK Proofs

| Method | Returns | Description |
|--------|---------|-------------|
| `isZKVerified(addr)` | `boolean` | Has a verified Groth16 threshold proof |
| `getVerifiedThreshold(addr)` | `number` | The threshold proven via ZK-SNARK |

### Protocol

| Method | Returns | Description |
|--------|---------|-------------|
| `getLeaderboard(start, count)` | `string[]` | Paginated leaderboard addresses |
| `getProtocolStats()` | `ProtocolStats` | Merkle/ZK verifications, markets, bounties, proposals |

## Gate Config Options

```typescript
interface SkillGateConfig {
  minElo?: number;          // Minimum ELO score
  minPercentile?: number;   // Minimum percentile rank
  requiredDomains?: string[]; // Must have all listed domains
  useDecayedElo?: boolean;  // Apply time decay to ELO
  useEffectiveElo?: boolean; // Include reputation bonus in ELO
}
```

## Custom Addresses

```typescript
// Override any contract address
const sdk = new SkillProof(provider, {
  registry: "0x...",
  hub: "0x...",
});
```

## Deployed on Flare Coston2

8 contracts. 138+ tests. 3 FTSO feeds. 4 cryptographic primitives (Merkle, Groth16, commit-reveal, ZK-SNARKs).
