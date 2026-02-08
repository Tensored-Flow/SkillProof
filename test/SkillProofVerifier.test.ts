import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

// ─── Off-chain Merkle tree helpers (mirrors Solidity _buildMerkleRoot) ────────

function computeLeafHash(
  address: string, name: string, elo: number, percentile: number, matches: number
): string {
  return ethers.solidityPackedKeccak256(
    ["address", "string", "uint256", "uint256", "uint256"],
    [address, name, elo, percentile, matches]
  );
}

function computeThresholdLeafHash(
  address: string, threshold: number, meetsThreshold: boolean
): string {
  return ethers.solidityPackedKeccak256(
    ["address", "uint256", "bool"],
    [address, threshold, meetsThreshold]
  );
}

function buildMerkleTree(leaves: string[]): { root: string; proofs: Map<string, string[]> } {
  const n = leaves.length;
  let size = 1;
  while (size < n) size *= 2;

  const paddedLeaves = [...leaves];
  while (paddedLeaves.length < size) paddedLeaves.push(ethers.ZeroHash);

  // Build tree layers bottom-up
  const layers: string[][] = [paddedLeaves];
  let currentLayer = paddedLeaves;
  while (currentLayer.length > 1) {
    const nextLayer: string[] = [];
    for (let i = 0; i < currentLayer.length; i += 2) {
      const left = currentLayer[i];
      const right = currentLayer[i + 1];
      // Canonical ordering: smaller hash first
      const [first, second] = left <= right ? [left, right] : [right, left];
      nextLayer.push(ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [first, second]));
    }
    layers.push(nextLayer);
    currentLayer = nextLayer;
  }

  const root = layers[layers.length - 1][0];

  // Generate proofs for each original leaf
  const proofs = new Map<string, string[]>();
  for (let leafIndex = 0; leafIndex < n; leafIndex++) {
    const proof: string[] = [];
    let idx = leafIndex;
    for (let layer = 0; layer < layers.length - 1; layer++) {
      const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
      proof.push(layers[layer][siblingIdx]);
      idx = Math.floor(idx / 2);
    }
    proofs.set(leaves[leafIndex], proof);
  }

  return { root, proofs };
}

// ─── Test suite ──────────────────────────────────────────────────────────────

describe("SkillProofVerifier", function () {

  // Player credential data
  const PLAYERS = {
    p1: { name: "AlphaTrader",  elo: 1847, pct: 96, matches: 150, winRate: 68 },
    p2: { name: "BetaTrader",   elo: 1623, pct: 74, matches: 120, winRate: 61 },
    p3: { name: "GammaTrader",  elo: 2105, pct: 99, matches: 200, winRate: 72 },
    p4: { name: "DeltaTrader",  elo: 1456, pct: 58, matches: 80,  winRate: 55 },
  };

  async function deployVerifierFixture() {
    const [owner, player1, player2, player3, player4, unverified] = await ethers.getSigners();

    // 1. Deploy Registry
    const RegistryFactory = await ethers.getContractFactory("SkillProofRegistry");
    const registry = await RegistryFactory.deploy();

    // 2. Register issuer
    await registry.registerIssuer(owner.address, "FinCraft");

    // 3. Mint 4 credentials
    await registry.mintCredential(
      player1.address, PLAYERS.p1.name, PLAYERS.p1.elo, PLAYERS.p1.pct,
      ["market-making", "derivatives"], [1900, 1750], [97, 91],
      PLAYERS.p1.matches, PLAYERS.p1.winRate
    );
    await registry.mintCredential(
      player2.address, PLAYERS.p2.name, PLAYERS.p2.elo, PLAYERS.p2.pct,
      ["risk-management", "portfolio"], [1650, 1580], [76, 70],
      PLAYERS.p2.matches, PLAYERS.p2.winRate
    );
    await registry.mintCredential(
      player3.address, PLAYERS.p3.name, PLAYERS.p3.elo, PLAYERS.p3.pct,
      ["quant", "algo-trading"], [2200, 2000], [99, 98],
      PLAYERS.p3.matches, PLAYERS.p3.winRate
    );
    await registry.mintCredential(
      player4.address, PLAYERS.p4.name, PLAYERS.p4.elo, PLAYERS.p4.pct,
      ["fundamentals"], [1456], [58],
      PLAYERS.p4.matches, PLAYERS.p4.winRate
    );

    // 4. Deploy Verifier
    const VerifierFactory = await ethers.getContractFactory("SkillProofVerifier");
    const verifier = await VerifierFactory.deploy(await registry.getAddress());

    return { registry, verifier, owner, player1, player2, player3, player4, unverified };
  }

  // Helper: build credential leaves for all 4 players
  function buildCredentialLeaves(addresses: { p1: string; p2: string; p3: string; p4: string }) {
    return [
      computeLeafHash(addresses.p1, PLAYERS.p1.name, PLAYERS.p1.elo, PLAYERS.p1.pct, PLAYERS.p1.matches),
      computeLeafHash(addresses.p2, PLAYERS.p2.name, PLAYERS.p2.elo, PLAYERS.p2.pct, PLAYERS.p2.matches),
      computeLeafHash(addresses.p3, PLAYERS.p3.name, PLAYERS.p3.elo, PLAYERS.p3.pct, PLAYERS.p3.matches),
      computeLeafHash(addresses.p4, PLAYERS.p4.name, PLAYERS.p4.elo, PLAYERS.p4.pct, PLAYERS.p4.matches),
    ];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Deployment
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("Should set registry address correctly", async function () {
      const { registry, verifier } = await loadFixture(deployVerifierFixture);
      expect(await verifier.registry()).to.equal(await registry.getAddress());
    });

    it("Should set operator to deployer", async function () {
      const { verifier, owner } = await loadFixture(deployVerifierFixture);
      expect(await verifier.operator()).to.equal(owner.address);
    });

    it("Should start with zero merkle root", async function () {
      const { verifier } = await loadFixture(deployVerifierFixture);
      expect(await verifier.credentialMerkleRoot()).to.equal(ethers.ZeroHash);
    });

    it("Should start with zero verification count", async function () {
      const { verifier } = await loadFixture(deployVerifierFixture);
      expect(await verifier.getVerificationCount()).to.equal(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Credential Hashing
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Credential Hashing", function () {
    it("Should compute deterministic credential hashes", async function () {
      const { verifier, player1 } = await loadFixture(deployVerifierFixture);
      const hash1 = await verifier.computeCredentialHash(
        player1.address, PLAYERS.p1.name, PLAYERS.p1.elo, PLAYERS.p1.pct, PLAYERS.p1.matches
      );
      const hash2 = await verifier.computeCredentialHash(
        player1.address, PLAYERS.p1.name, PLAYERS.p1.elo, PLAYERS.p1.pct, PLAYERS.p1.matches
      );
      expect(hash1).to.equal(hash2);
    });

    it("Should compute different hashes for different credentials", async function () {
      const { verifier, player1, player2 } = await loadFixture(deployVerifierFixture);
      const hash1 = await verifier.computeCredentialHash(
        player1.address, PLAYERS.p1.name, PLAYERS.p1.elo, PLAYERS.p1.pct, PLAYERS.p1.matches
      );
      const hash2 = await verifier.computeCredentialHash(
        player2.address, PLAYERS.p2.name, PLAYERS.p2.elo, PLAYERS.p2.pct, PLAYERS.p2.matches
      );
      expect(hash1).to.not.equal(hash2);
    });

    it("Should match off-chain hash computation", async function () {
      const { verifier, player1 } = await loadFixture(deployVerifierFixture);
      const onChain = await verifier.computeCredentialHash(
        player1.address, PLAYERS.p1.name, PLAYERS.p1.elo, PLAYERS.p1.pct, PLAYERS.p1.matches
      );
      const offChain = computeLeafHash(
        player1.address, PLAYERS.p1.name, PLAYERS.p1.elo, PLAYERS.p1.pct, PLAYERS.p1.matches
      );
      expect(onChain).to.equal(offChain);
    });

    it("Should compute threshold hashes correctly", async function () {
      const { verifier, player1 } = await loadFixture(deployVerifierFixture);
      const onChain = await verifier.computeThresholdHash(player1.address, 1500, true);
      const offChain = computeThresholdLeafHash(player1.address, 1500, true);
      expect(onChain).to.equal(offChain);
    });

    it("Should produce different threshold hashes for true vs false", async function () {
      const { verifier, player1 } = await loadFixture(deployVerifierFixture);
      const hashTrue = await verifier.computeThresholdHash(player1.address, 1500, true);
      const hashFalse = await verifier.computeThresholdHash(player1.address, 1500, false);
      expect(hashTrue).to.not.equal(hashFalse);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Merkle Root Management
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Merkle Root Management", function () {
    it("Should allow operator to update merkle root", async function () {
      const { verifier, owner } = await loadFixture(deployVerifierFixture);
      const newRoot = ethers.id("test-root");
      await verifier.connect(owner).updateMerkleRoot(newRoot);
      expect(await verifier.credentialMerkleRoot()).to.equal(newRoot);
    });

    it("Should reject non-operator from updating root", async function () {
      const { verifier, player1 } = await loadFixture(deployVerifierFixture);
      await expect(
        verifier.connect(player1).updateMerkleRoot(ethers.id("bad-root"))
      ).to.be.revertedWith("Only operator");
    });

    it("Should emit MerkleRootUpdated event", async function () {
      const { verifier, owner } = await loadFixture(deployVerifierFixture);
      const newRoot = ethers.id("event-root");
      await expect(verifier.connect(owner).updateMerkleRoot(newRoot))
        .to.emit(verifier, "MerkleRootUpdated")
        .withArgs(ethers.ZeroHash, newRoot);
    });

    it("Should emit correct old root on second update", async function () {
      const { verifier, owner } = await loadFixture(deployVerifierFixture);
      const root1 = ethers.id("root-1");
      const root2 = ethers.id("root-2");
      await verifier.connect(owner).updateMerkleRoot(root1);
      await expect(verifier.connect(owner).updateMerkleRoot(root2))
        .to.emit(verifier, "MerkleRootUpdated")
        .withArgs(root1, root2);
    });

    it("Should update root from registry (on-chain tree build)", async function () {
      const { verifier, owner, player1, player2, player3, player4 } =
        await loadFixture(deployVerifierFixture);

      const users = [player1.address, player2.address, player3.address, player4.address];
      await verifier.connect(owner).updateMerkleRootFromRegistry(users);

      const root = await verifier.credentialMerkleRoot();
      expect(root).to.not.equal(ethers.ZeroHash);

      // Verify the on-chain root matches our off-chain computation
      const leaves = buildCredentialLeaves({
        p1: player1.address, p2: player2.address,
        p3: player3.address, p4: player4.address,
      });
      const { root: expectedRoot } = buildMerkleTree(leaves);
      expect(root).to.equal(expectedRoot);
    });

    it("Should reject non-operator from updateMerkleRootFromRegistry", async function () {
      const { verifier, player1 } = await loadFixture(deployVerifierFixture);
      await expect(
        verifier.connect(player1).updateMerkleRootFromRegistry([player1.address])
      ).to.be.revertedWith("Only operator");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Merkle Proof Verification
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Merkle Proof Verification", function () {
    it("Should verify valid credential proof", async function () {
      const { verifier, owner, player1, player2, player3, player4 } =
        await loadFixture(deployVerifierFixture);

      // Build tree off-chain
      const addresses = {
        p1: player1.address, p2: player2.address,
        p3: player3.address, p4: player4.address,
      };
      const leaves = buildCredentialLeaves(addresses);
      const { root, proofs } = buildMerkleTree(leaves);

      // Set root on-chain
      await verifier.connect(owner).updateMerkleRoot(root);

      // Verify player1's proof
      const leaf = leaves[0];
      const proof = proofs.get(leaf)!;
      expect(await verifier.verifyCredentialProof(leaf, proof, 0)).to.be.true;
    });

    it("Should verify proofs for all 4 players", async function () {
      const { verifier, owner, player1, player2, player3, player4 } =
        await loadFixture(deployVerifierFixture);

      const addresses = {
        p1: player1.address, p2: player2.address,
        p3: player3.address, p4: player4.address,
      };
      const leaves = buildCredentialLeaves(addresses);
      const { root, proofs } = buildMerkleTree(leaves);
      await verifier.connect(owner).updateMerkleRoot(root);

      for (const leaf of leaves) {
        const proof = proofs.get(leaf)!;
        expect(await verifier.verifyCredentialProof(leaf, proof, 0)).to.be.true;
      }
    });

    it("Should reject invalid proof (wrong leaf)", async function () {
      const { verifier, owner, player1, player2, player3, player4 } =
        await loadFixture(deployVerifierFixture);

      const addresses = {
        p1: player1.address, p2: player2.address,
        p3: player3.address, p4: player4.address,
      };
      const leaves = buildCredentialLeaves(addresses);
      const { root, proofs } = buildMerkleTree(leaves);
      await verifier.connect(owner).updateMerkleRoot(root);

      // Use player1's proof but a fake leaf
      const fakeLeaf = ethers.id("not-a-real-credential");
      const proof = proofs.get(leaves[0])!;
      expect(await verifier.verifyCredentialProof(fakeLeaf, proof, 0)).to.be.false;
    });

    it("Should reject proof against wrong root", async function () {
      const { verifier, owner, player1, player2, player3, player4 } =
        await loadFixture(deployVerifierFixture);

      const addresses = {
        p1: player1.address, p2: player2.address,
        p3: player3.address, p4: player4.address,
      };
      const leaves = buildCredentialLeaves(addresses);
      const { proofs } = buildMerkleTree(leaves);

      // Set a DIFFERENT root
      await verifier.connect(owner).updateMerkleRoot(ethers.id("wrong-root"));

      const leaf = leaves[0];
      const proof = proofs.get(leaf)!;
      expect(await verifier.verifyCredentialProof(leaf, proof, 0)).to.be.false;
    });

    it("Should record verification and increment count", async function () {
      const { verifier, owner, player1, player2, player3, player4 } =
        await loadFixture(deployVerifierFixture);

      const addresses = {
        p1: player1.address, p2: player2.address,
        p3: player3.address, p4: player4.address,
      };
      const leaves = buildCredentialLeaves(addresses);
      const { root, proofs } = buildMerkleTree(leaves);
      await verifier.connect(owner).updateMerkleRoot(root);

      const leaf = leaves[0];
      const proof = proofs.get(leaf)!;
      await verifier.connect(player1).verifyAndRecord(leaf, proof);

      expect(await verifier.getVerificationCount()).to.equal(1);
    });

    it("Should emit CredentialVerified on verifyAndRecord", async function () {
      const { verifier, owner, player1, player2, player3, player4 } =
        await loadFixture(deployVerifierFixture);

      const addresses = {
        p1: player1.address, p2: player2.address,
        p3: player3.address, p4: player4.address,
      };
      const leaves = buildCredentialLeaves(addresses);
      const { root, proofs } = buildMerkleTree(leaves);
      await verifier.connect(owner).updateMerkleRoot(root);

      const leaf = leaves[0];
      const proof = proofs.get(leaf)!;

      await expect(verifier.connect(player1).verifyAndRecord(leaf, proof))
        .to.emit(verifier, "CredentialVerified")
        .withArgs(player1.address, leaf);
    });

    it("Should prevent proof replay (same user, same leaf)", async function () {
      const { verifier, owner, player1, player2, player3, player4 } =
        await loadFixture(deployVerifierFixture);

      const addresses = {
        p1: player1.address, p2: player2.address,
        p3: player3.address, p4: player4.address,
      };
      const leaves = buildCredentialLeaves(addresses);
      const { root, proofs } = buildMerkleTree(leaves);
      await verifier.connect(owner).updateMerkleRoot(root);

      const leaf = leaves[0];
      const proof = proofs.get(leaf)!;

      // First verification succeeds
      await verifier.connect(player1).verifyAndRecord(leaf, proof);

      // Second attempt reverts
      await expect(
        verifier.connect(player1).verifyAndRecord(leaf, proof)
      ).to.be.revertedWith("Proof already used");
    });

    it("Should allow different users to verify the same leaf", async function () {
      const { verifier, owner, player1, player2, player3, player4 } =
        await loadFixture(deployVerifierFixture);

      const addresses = {
        p1: player1.address, p2: player2.address,
        p3: player3.address, p4: player4.address,
      };
      const leaves = buildCredentialLeaves(addresses);
      const { root, proofs } = buildMerkleTree(leaves);
      await verifier.connect(owner).updateMerkleRoot(root);

      const leaf = leaves[0];
      const proof = proofs.get(leaf)!;

      // player1 and player2 both verify the same leaf — different proofHash since msg.sender differs
      await verifier.connect(player1).verifyAndRecord(leaf, proof);
      await verifier.connect(player2).verifyAndRecord(leaf, proof);
      expect(await verifier.getVerificationCount()).to.equal(2);
    });

    it("Should reject verifyAndRecord with invalid proof", async function () {
      const { verifier, owner, player1, player2, player3, player4 } =
        await loadFixture(deployVerifierFixture);

      const addresses = {
        p1: player1.address, p2: player2.address,
        p3: player3.address, p4: player4.address,
      };
      const leaves = buildCredentialLeaves(addresses);
      const { root } = buildMerkleTree(leaves);
      await verifier.connect(owner).updateMerkleRoot(root);

      const fakeLeaf = ethers.id("fake");
      const fakeProof = [ethers.id("fake-sibling")];

      await expect(
        verifier.connect(player1).verifyAndRecord(fakeLeaf, fakeProof)
      ).to.be.revertedWith("Invalid proof");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Threshold Proofs
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Threshold Proofs", function () {
    const THRESHOLDS = [1000, 1200, 1500];

    // Helper: build a tree with credential + threshold leaves
    function buildTreeWithThresholds(
      addresses: { p1: string; p2: string; p3: string; p4: string }
    ) {
      const allLeaves: string[] = [];
      const players = [
        { addr: addresses.p1, ...PLAYERS.p1 },
        { addr: addresses.p2, ...PLAYERS.p2 },
        { addr: addresses.p3, ...PLAYERS.p3 },
        { addr: addresses.p4, ...PLAYERS.p4 },
      ];

      for (const p of players) {
        // Credential leaf
        allLeaves.push(computeLeafHash(p.addr, p.name, p.elo, p.pct, p.matches));
        // Threshold leaves — only for thresholds the player meets
        for (const t of THRESHOLDS) {
          if (p.elo >= t) {
            allLeaves.push(computeThresholdLeafHash(p.addr, t, true));
          }
        }
      }
      return buildMerkleTree(allLeaves);
    }

    it("Should verify threshold proof for user who meets threshold", async function () {
      const { verifier, owner, player1, player2, player3, player4 } =
        await loadFixture(deployVerifierFixture);

      const addresses = {
        p1: player1.address, p2: player2.address,
        p3: player3.address, p4: player4.address,
      };
      const { root, proofs } = buildTreeWithThresholds(addresses);
      await verifier.connect(owner).updateMerkleRoot(root);

      // player1 (ELO 1847) should have a threshold leaf for 1500
      const thresholdLeaf = computeThresholdLeafHash(player1.address, 1500, true);
      const proof = proofs.get(thresholdLeaf)!;
      expect(proof).to.not.be.undefined;

      await expect(
        verifier.connect(player1).verifyThresholdProof(player1.address, 1500, proof)
      ).to.not.be.reverted;
    });

    it("Should reject threshold proof for user who doesn't meet threshold", async function () {
      const { verifier, owner, player1, player2, player3, player4 } =
        await loadFixture(deployVerifierFixture);

      const addresses = {
        p1: player1.address, p2: player2.address,
        p3: player3.address, p4: player4.address,
      };
      const { root } = buildTreeWithThresholds(addresses);
      await verifier.connect(owner).updateMerkleRoot(root);

      // player4 (ELO 1456) does NOT meet 1500 threshold — no valid leaf in tree
      // Attempt with an empty proof (will fail verification)
      await expect(
        verifier.connect(player4).verifyThresholdProof(player4.address, 1500, [])
      ).to.be.revertedWith("Invalid threshold proof");
    });

    it("Should mark user as verifiedAboveThreshold after successful proof", async function () {
      const { verifier, owner, player1, player2, player3, player4 } =
        await loadFixture(deployVerifierFixture);

      const addresses = {
        p1: player1.address, p2: player2.address,
        p3: player3.address, p4: player4.address,
      };
      const { root, proofs } = buildTreeWithThresholds(addresses);
      await verifier.connect(owner).updateMerkleRoot(root);

      expect(await verifier.isVerifiedAboveThreshold(player1.address)).to.be.false;

      const thresholdLeaf = computeThresholdLeafHash(player1.address, 1500, true);
      const proof = proofs.get(thresholdLeaf)!;
      await verifier.connect(player1).verifyThresholdProof(player1.address, 1500, proof);

      expect(await verifier.isVerifiedAboveThreshold(player1.address)).to.be.true;
    });

    it("Should emit ThresholdVerified event", async function () {
      const { verifier, owner, player1, player2, player3, player4 } =
        await loadFixture(deployVerifierFixture);

      const addresses = {
        p1: player1.address, p2: player2.address,
        p3: player3.address, p4: player4.address,
      };
      const { root, proofs } = buildTreeWithThresholds(addresses);
      await verifier.connect(owner).updateMerkleRoot(root);

      const thresholdLeaf = computeThresholdLeafHash(player3.address, 1500, true);
      const proof = proofs.get(thresholdLeaf)!;

      await expect(
        verifier.connect(player3).verifyThresholdProof(player3.address, 1500, proof)
      ).to.emit(verifier, "ThresholdVerified")
        .withArgs(player3.address, 1500);
    });

    it("Should work with multiple threshold levels (1000, 1200, 1500)", async function () {
      const { verifier, owner, player1, player2, player3, player4 } =
        await loadFixture(deployVerifierFixture);

      const addresses = {
        p1: player1.address, p2: player2.address,
        p3: player3.address, p4: player4.address,
      };
      const { root, proofs } = buildTreeWithThresholds(addresses);
      await verifier.connect(owner).updateMerkleRoot(root);

      // player2 (ELO 1623) should have leaves for 1000, 1200, 1500
      for (const t of THRESHOLDS) {
        const leaf = computeThresholdLeafHash(player2.address, t, true);
        const proof = proofs.get(leaf)!;
        expect(proof).to.not.be.undefined;
        expect(
          await verifier.verifyCredentialProof(leaf, proof, 0)
        ).to.be.true;
      }
    });

    it("Should verify threshold via on-chain updateMerkleRootWithThresholds", async function () {
      const { verifier, owner, player1, player2, player3, player4 } =
        await loadFixture(deployVerifierFixture);

      const users = [player1.address, player2.address, player3.address, player4.address];
      await verifier.connect(owner).updateMerkleRootWithThresholds(users, THRESHOLDS);

      const onChainRoot = await verifier.credentialMerkleRoot();

      // Verify the on-chain root matches our off-chain tree
      const addresses = {
        p1: player1.address, p2: player2.address,
        p3: player3.address, p4: player4.address,
      };
      const { root: offChainRoot } = buildTreeWithThresholds(addresses);
      expect(onChainRoot).to.equal(offChainRoot);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Integration with Registry
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Integration with Registry", function () {
    it("Should build merkle root from live registry data", async function () {
      const { verifier, owner, player1, player2, player3, player4 } =
        await loadFixture(deployVerifierFixture);

      const users = [player1.address, player2.address, player3.address, player4.address];
      await verifier.connect(owner).updateMerkleRootFromRegistry(users);

      expect(await verifier.credentialMerkleRoot()).to.not.equal(ethers.ZeroHash);
    });

    it("Should verify credentials from registry via Merkle proof end-to-end", async function () {
      const { verifier, owner, player1, player2, player3, player4 } =
        await loadFixture(deployVerifierFixture);

      // Build tree on-chain from registry
      const users = [player1.address, player2.address, player3.address, player4.address];
      await verifier.connect(owner).updateMerkleRootFromRegistry(users);

      // Build matching tree off-chain to get proofs
      const addresses = {
        p1: player1.address, p2: player2.address,
        p3: player3.address, p4: player4.address,
      };
      const leaves = buildCredentialLeaves(addresses);
      const { proofs } = buildMerkleTree(leaves);

      // Verify each player's credential proof against the on-chain root
      for (const leaf of leaves) {
        const proof = proofs.get(leaf)!;
        expect(await verifier.verifyCredentialProof(leaf, proof, 0)).to.be.true;
      }
    });

    it("Should reject proof for user not in registry tree", async function () {
      const { verifier, owner, player1, player2, player3, player4, unverified } =
        await loadFixture(deployVerifierFixture);

      const users = [player1.address, player2.address, player3.address, player4.address];
      await verifier.connect(owner).updateMerkleRootFromRegistry(users);

      // unverified has no credential — fabricate a leaf and try to prove it
      const fakeLeaf = computeLeafHash(unverified.address, "Fake", 9999, 100, 500);
      expect(await verifier.verifyCredentialProof(fakeLeaf, [], 0)).to.be.false;
    });

    it("Should perform full threshold verification end-to-end via registry", async function () {
      const { verifier, owner, player1, player2, player3, player4 } =
        await loadFixture(deployVerifierFixture);

      const THRESHOLDS = [1000, 1200, 1500];
      const users = [player1.address, player2.address, player3.address, player4.address];
      await verifier.connect(owner).updateMerkleRootWithThresholds(users, THRESHOLDS);

      // Build off-chain tree to get proofs
      const addresses = {
        p1: player1.address, p2: player2.address,
        p3: player3.address, p4: player4.address,
      };
      const allLeaves: string[] = [];
      const players = [
        { addr: addresses.p1, ...PLAYERS.p1 },
        { addr: addresses.p2, ...PLAYERS.p2 },
        { addr: addresses.p3, ...PLAYERS.p3 },
        { addr: addresses.p4, ...PLAYERS.p4 },
      ];
      for (const p of players) {
        allLeaves.push(computeLeafHash(p.addr, p.name, p.elo, p.pct, p.matches));
        for (const t of THRESHOLDS) {
          if (p.elo >= t) {
            allLeaves.push(computeThresholdLeafHash(p.addr, t, true));
          }
        }
      }
      const { proofs } = buildMerkleTree(allLeaves);

      // player3 (ELO 2105) proves ELO >= 1500 — privacy preserved, exact ELO not revealed
      const thresholdLeaf = computeThresholdLeafHash(player3.address, 1500, true);
      const proof = proofs.get(thresholdLeaf)!;

      await verifier.connect(player3).verifyThresholdProof(player3.address, 1500, proof);
      expect(await verifier.isVerifiedAboveThreshold(player3.address)).to.be.true;

      // player4 (ELO 1456) cannot prove ELO >= 1500 — leaf doesn't exist in tree
      await expect(
        verifier.connect(player4).verifyThresholdProof(player4.address, 1500, [])
      ).to.be.revertedWith("Invalid threshold proof");
      expect(await verifier.isVerifiedAboveThreshold(player4.address)).to.be.false;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // View Functions
  // ═══════════════════════════════════════════════════════════════════════════

  describe("View Functions", function () {
    it("Should report correct isProofUsed status", async function () {
      const { verifier, owner, player1, player2, player3, player4 } =
        await loadFixture(deployVerifierFixture);

      const addresses = {
        p1: player1.address, p2: player2.address,
        p3: player3.address, p4: player4.address,
      };
      const leaves = buildCredentialLeaves(addresses);
      const { root, proofs } = buildMerkleTree(leaves);
      await verifier.connect(owner).updateMerkleRoot(root);

      const leaf = leaves[0];
      const proofHash = ethers.solidityPackedKeccak256(
        ["bytes32", "address"], [leaf, player1.address]
      );

      expect(await verifier.isProofUsed(proofHash)).to.be.false;

      const proof = proofs.get(leaf)!;
      await verifier.connect(player1).verifyAndRecord(leaf, proof);

      expect(await verifier.isProofUsed(proofHash)).to.be.true;
    });

    it("Should return merkle root via getMerkleRoot()", async function () {
      const { verifier, owner } = await loadFixture(deployVerifierFixture);
      const root = ethers.id("getter-test");
      await verifier.connect(owner).updateMerkleRoot(root);
      expect(await verifier.getMerkleRoot()).to.equal(root);
    });
  });
});
