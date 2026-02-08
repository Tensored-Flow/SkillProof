import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("SkillProofAggregator", function () {
  async function deployAggregatorFixture() {
    const [owner, issuerFinCraft, issuerChess, primary, altAddr1, altAddr2, stranger] =
      await ethers.getSigners();

    // Deploy Registry
    const RegistryFactory = await ethers.getContractFactory("SkillProofRegistry");
    const registry = await RegistryFactory.deploy();

    // Register 2 issuers
    await registry.registerIssuer(issuerFinCraft.address, "FinCraft");
    await registry.registerIssuer(issuerChess.address, "ChessArena");

    // FinCraft mints credential for primary: ELO 1847, percentile 96
    await registry.connect(issuerFinCraft).mintCredential(
      primary.address, "AlphaTrader", 1847, 96,
      ["market-making", "derivatives"], [1900, 1750], [97, 91], 150, 68
    );

    // ChessArena mints credential for altAddr1: ELO 1600, percentile 80
    await registry.connect(issuerChess).mintCredential(
      altAddr1.address, "AlphaChess", 1600, 80,
      ["tactics", "endgame", "opening"], [1700, 1500, 1550], [85, 72, 78], 200, 55
    );

    // FinCraft mints credential for altAddr2: ELO 1200, percentile 45
    await registry.connect(issuerFinCraft).mintCredential(
      altAddr2.address, "AltAccount", 1200, 45,
      ["risk-management"], [1200], [45], 30, 50
    );

    // Deploy Aggregator
    const AggFactory = await ethers.getContractFactory("SkillProofAggregator");
    const aggregator = await AggFactory.deploy(await registry.getAddress());

    return { registry, aggregator, owner, issuerFinCraft, issuerChess, primary, altAddr1, altAddr2, stranger };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Deployment
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("Should set registry address correctly", async function () {
      const { registry, aggregator } = await loadFixture(deployAggregatorFixture);
      expect(await aggregator.registry()).to.equal(await registry.getAddress());
    });

    it("Should set deployer as owner", async function () {
      const { aggregator, owner } = await loadFixture(deployAggregatorFixture);
      expect(await aggregator.owner()).to.equal(owner.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Address Linking
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Address Linking", function () {
    it("Should allow owner to link addresses", async function () {
      const { aggregator, owner, primary, altAddr1 } = await loadFixture(deployAggregatorFixture);

      await expect(aggregator.connect(owner).linkAddress(primary.address, altAddr1.address))
        .to.emit(aggregator, "AddressLinked")
        .withArgs(primary.address, altAddr1.address);

      const linked = await aggregator.getLinkedAddresses(primary.address);
      // primary auto-added as first + altAddr1
      expect(linked.length).to.equal(2);
      expect(linked[0]).to.equal(primary.address);
      expect(linked[1]).to.equal(altAddr1.address);
    });

    it("Should allow the linked address itself to self-link", async function () {
      const { aggregator, primary, altAddr1 } = await loadFixture(deployAggregatorFixture);

      await aggregator.connect(altAddr1).linkAddress(primary.address, altAddr1.address);

      expect(await aggregator.primaryOf(altAddr1.address)).to.equal(primary.address);
    });

    it("Should reject linking from unauthorized address", async function () {
      const { aggregator, primary, altAddr1, stranger } = await loadFixture(deployAggregatorFixture);

      await expect(
        aggregator.connect(stranger).linkAddress(primary.address, altAddr1.address)
      ).to.be.revertedWith("Unauthorized");
    });

    it("Should reject double-linking an address", async function () {
      const { aggregator, owner, primary, altAddr1 } = await loadFixture(deployAggregatorFixture);

      await aggregator.connect(owner).linkAddress(primary.address, altAddr1.address);

      await expect(
        aggregator.connect(owner).linkAddress(primary.address, altAddr1.address)
      ).to.be.revertedWith("Already linked");
    });

    it("Should auto-add primary on first link and not duplicate it", async function () {
      const { aggregator, owner, primary } = await loadFixture(deployAggregatorFixture);

      // Link primary to itself (just to register)
      await aggregator.connect(owner).linkAddress(primary.address, primary.address);

      const linked = await aggregator.getLinkedAddresses(primary.address);
      expect(linked.length).to.equal(1); // only one entry: primary
      expect(linked[0]).to.equal(primary.address);
    });

    it("Should return correct linked count", async function () {
      const { aggregator, owner, primary, altAddr1, altAddr2 } = await loadFixture(deployAggregatorFixture);

      await aggregator.connect(owner).linkAddress(primary.address, altAddr1.address);
      await aggregator.connect(owner).linkAddress(primary.address, altAddr2.address);

      expect(await aggregator.getLinkedCount(primary.address)).to.equal(3); // primary + 2 linked
    });

    it("Should allow owner to unlink an address", async function () {
      const { aggregator, owner, primary, altAddr1 } = await loadFixture(deployAggregatorFixture);

      await aggregator.connect(owner).linkAddress(primary.address, altAddr1.address);
      expect(await aggregator.getLinkedCount(primary.address)).to.equal(2);

      await expect(aggregator.connect(owner).unlinkAddress(primary.address, altAddr1.address))
        .to.emit(aggregator, "AddressUnlinked")
        .withArgs(primary.address, altAddr1.address);

      expect(await aggregator.getLinkedCount(primary.address)).to.equal(1);
      expect(await aggregator.primaryOf(altAddr1.address)).to.equal(ethers.ZeroAddress);
    });

    it("Should reject unlinking the primary itself", async function () {
      const { aggregator, owner, primary, altAddr1 } = await loadFixture(deployAggregatorFixture);

      await aggregator.connect(owner).linkAddress(primary.address, altAddr1.address);

      await expect(
        aggregator.connect(owner).unlinkAddress(primary.address, primary.address)
      ).to.be.revertedWith("Cannot unlink primary");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Aggregate Score — Single Issuer
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Aggregate Score — Single Issuer", function () {
    it("Should return single credential score for unlinked address with credential", async function () {
      const { aggregator, primary } = await loadFixture(deployAggregatorFixture);

      // primary has a credential but no linked addresses — fallback to direct lookup
      const score = await aggregator.getAggregateScore(primary.address);

      expect(score.compositeElo).to.equal(1847);
      expect(score.compositePercentile).to.equal(96);
      expect(score.totalMatches).to.equal(150);
      expect(score.issuerCount).to.equal(1);
      expect(score.domainCount).to.equal(2); // market-making, derivatives
      expect(score.crossDomainBonus).to.equal(0);
      expect(score.overallScore).to.equal(1847);
    });

    it("Should return zeros for address with no credential and no links", async function () {
      const { aggregator, stranger } = await loadFixture(deployAggregatorFixture);

      const score = await aggregator.getAggregateScore(stranger.address);

      expect(score.compositeElo).to.equal(0);
      expect(score.issuerCount).to.equal(0);
      expect(score.overallScore).to.equal(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Aggregate Score — Multi-Issuer
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Aggregate Score — Multi-Issuer", function () {
    it("Should compute composite ELO as average across 2 issuers with cross-domain bonus", async function () {
      const { aggregator, owner, primary, altAddr1 } = await loadFixture(deployAggregatorFixture);

      // Link altAddr1 (ChessArena, ELO 1600) to primary (FinCraft, ELO 1847)
      await aggregator.connect(owner).linkAddress(primary.address, altAddr1.address);

      const score = await aggregator.getAggregateScore(primary.address);

      // Composite ELO = (1847 + 1600) / 2 = 1723 (integer division)
      expect(score.compositeElo).to.equal(1723);
      // Composite percentile = (96 + 80) / 2 = 88
      expect(score.compositePercentile).to.equal(88);
      // Total matches = 150 + 200 = 350
      expect(score.totalMatches).to.equal(350);
      expect(score.issuerCount).to.equal(2);
      // Domains: 2 (FinCraft) + 3 (ChessArena) = 5
      expect(score.domainCount).to.equal(5);
      // Cross-domain bonus: (2 - 1) * 50 = 50
      expect(score.crossDomainBonus).to.equal(50);
      // Overall = 1723 + 50 = 1773
      expect(score.overallScore).to.equal(1773);
    });

    it("Should compute composite across 3 credentials with 100 bonus", async function () {
      const { aggregator, owner, primary, altAddr1, altAddr2 } = await loadFixture(deployAggregatorFixture);

      // Link both alt addresses
      await aggregator.connect(owner).linkAddress(primary.address, altAddr1.address);
      await aggregator.connect(owner).linkAddress(primary.address, altAddr2.address);

      const score = await aggregator.getAggregateScore(primary.address);

      // Composite ELO = (1847 + 1600 + 1200) / 3 = 1549
      expect(score.compositeElo).to.equal(1549);
      // Composite percentile = (96 + 80 + 45) / 3 = 73 (integer division)
      expect(score.compositePercentile).to.equal(73);
      // Total matches = 150 + 200 + 30 = 380
      expect(score.totalMatches).to.equal(380);
      expect(score.issuerCount).to.equal(3);
      // Domains: 2 + 3 + 1 = 6
      expect(score.domainCount).to.equal(6);
      // Cross-domain bonus: (3 - 1) * 50 = 100
      expect(score.crossDomainBonus).to.equal(100);
      // Overall = 1549 + 100 = 1649
      expect(score.overallScore).to.equal(1649);
    });

    it("Should skip revoked credentials in aggregate", async function () {
      const { registry, aggregator, owner, primary, altAddr1 } = await loadFixture(deployAggregatorFixture);

      await aggregator.connect(owner).linkAddress(primary.address, altAddr1.address);

      // Revoke altAddr1's credential
      await registry.revokeCredential(altAddr1.address);

      const score = await aggregator.getAggregateScore(primary.address);

      // Only primary's credential is valid
      expect(score.compositeElo).to.equal(1847);
      expect(score.issuerCount).to.equal(1);
      expect(score.crossDomainBonus).to.equal(0);
      expect(score.overallScore).to.equal(1847);
    });

    it("Should return zeros when all linked credentials are revoked", async function () {
      const { registry, aggregator, owner, primary, altAddr1 } = await loadFixture(deployAggregatorFixture);

      await aggregator.connect(owner).linkAddress(primary.address, altAddr1.address);

      // Revoke both
      await registry.revokeCredential(primary.address);
      await registry.revokeCredential(altAddr1.address);

      const score = await aggregator.getAggregateScore(primary.address);

      expect(score.compositeElo).to.equal(0);
      expect(score.issuerCount).to.equal(0);
      expect(score.overallScore).to.equal(0);
    });
  });
});
