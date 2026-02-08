import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("SkillProofDecay", function () {
  const DAY = 86400;
  const DECAY_RATE = 100; // 1% per day (100 bps)
  const MIN_MULTIPLIER = 5000; // 50% floor

  async function deployDecayFixture() {
    const [owner, issuer, player1, player2, stranger] = await ethers.getSigners();

    // Deploy Registry
    const RegistryFactory = await ethers.getContractFactory("SkillProofRegistry");
    const registry = await RegistryFactory.deploy();

    // Register issuer
    await registry.registerIssuer(issuer.address, "FinCraft");

    // Mint credential for player1: ELO 1847, percentile 96
    await registry.connect(issuer).mintCredential(
      player1.address, "AlphaTrader", 1847, 96,
      ["market-making", "derivatives"], [1900, 1750], [97, 91], 150, 68
    );

    // Mint credential for player2: ELO 1000, percentile 50
    await registry.connect(issuer).mintCredential(
      player2.address, "BetaTrader", 1000, 50,
      ["general"], [1000], [50], 30, 52
    );

    // Deploy Decay contract
    const DecayFactory = await ethers.getContractFactory("SkillProofDecay");
    const decay = await DecayFactory.deploy(
      await registry.getAddress(), DECAY_RATE, MIN_MULTIPLIER
    );

    return { registry, decay, owner, issuer, player1, player2, stranger };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Deployment
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("Should set registry address correctly", async function () {
      const { registry, decay } = await loadFixture(deployDecayFixture);
      expect(await decay.registry()).to.equal(await registry.getAddress());
    });

    it("Should set decay rate correctly", async function () {
      const { decay } = await loadFixture(deployDecayFixture);
      expect(await decay.decayRatePerDay()).to.equal(DECAY_RATE);
    });

    it("Should set minimum multiplier correctly", async function () {
      const { decay } = await loadFixture(deployDecayFixture);
      expect(await decay.minimumMultiplierBps()).to.equal(MIN_MULTIPLIER);
    });

    it("Should set deployer as owner", async function () {
      const { decay, owner } = await loadFixture(deployDecayFixture);
      expect(await decay.owner()).to.equal(owner.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Decay Multiplier Calculation
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Decay Multiplier", function () {
    it("Should return 10000 (100%) for fresh credential (0 days elapsed)", async function () {
      const { decay, player1 } = await loadFixture(deployDecayFixture);
      expect(await decay.getDecayMultiplier(player1.address)).to.equal(10000);
    });

    it("Should return 9000 (90%) after 10 days at 1% daily decay", async function () {
      const { decay, player1 } = await loadFixture(deployDecayFixture);
      await time.increase(10 * DAY);
      expect(await decay.getDecayMultiplier(player1.address)).to.equal(9000);
    });

    it("Should return 7000 (70%) after 30 days at 1% daily decay", async function () {
      const { decay, player1 } = await loadFixture(deployDecayFixture);
      await time.increase(30 * DAY);
      expect(await decay.getDecayMultiplier(player1.address)).to.equal(7000);
    });

    it("Should floor at 5000 (50%) after 50 days at 1% daily decay", async function () {
      const { decay, player1 } = await loadFixture(deployDecayFixture);
      await time.increase(50 * DAY);
      expect(await decay.getDecayMultiplier(player1.address)).to.equal(5000);
    });

    it("Should remain at floor after 100 days (well past floor)", async function () {
      const { decay, player1 } = await loadFixture(deployDecayFixture);
      await time.increase(100 * DAY);
      expect(await decay.getDecayMultiplier(player1.address)).to.equal(5000);
    });

    it("Should revert for user with no credential", async function () {
      const { decay, stranger } = await loadFixture(deployDecayFixture);
      await expect(
        decay.getDecayMultiplier(stranger.address)
      ).to.be.revertedWith("No credential");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Decayed ELO
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Decayed ELO", function () {
    it("Should return full ELO for fresh credential", async function () {
      const { decay, player1 } = await loadFixture(deployDecayFixture);
      expect(await decay.getDecayedElo(player1.address)).to.equal(1847);
    });

    it("Should return 1662 for ELO 1847 after 10 days (90% multiplier)", async function () {
      const { decay, player1 } = await loadFixture(deployDecayFixture);
      await time.increase(10 * DAY);
      // 1847 * 9000 / 10000 = 1662.3 → truncates to 1662
      expect(await decay.getDecayedElo(player1.address)).to.equal(1662);
    });

    it("Should return 923 for ELO 1847 at 50% floor", async function () {
      const { decay, player1 } = await loadFixture(deployDecayFixture);
      await time.increase(60 * DAY);
      // 1847 * 5000 / 10000 = 923.5 → truncates to 923
      expect(await decay.getDecayedElo(player1.address)).to.equal(923);
    });

    it("Should decay player2 ELO correctly (1000 * 0.90 = 900)", async function () {
      const { decay, player2 } = await loadFixture(deployDecayFixture);
      await time.increase(10 * DAY);
      expect(await decay.getDecayedElo(player2.address)).to.equal(900);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Decayed Percentile
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Decayed Percentile", function () {
    it("Should return full percentile for fresh credential", async function () {
      const { decay, player1 } = await loadFixture(deployDecayFixture);
      expect(await decay.getDecayedPercentile(player1.address)).to.equal(96);
    });

    it("Should decay percentile after 10 days (96 * 0.90 = 86)", async function () {
      const { decay, player1 } = await loadFixture(deployDecayFixture);
      await time.increase(10 * DAY);
      // 96 * 9000 / 10000 = 86.4 → truncates to 86
      expect(await decay.getDecayedPercentile(player1.address)).to.equal(86);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Days Since Update
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Days Since Update", function () {
    it("Should return 0 for fresh credential", async function () {
      const { decay, player1 } = await loadFixture(deployDecayFixture);
      expect(await decay.getDaysSinceUpdate(player1.address)).to.equal(0);
    });

    it("Should return correct days after time passes", async function () {
      const { decay, player1 } = await loadFixture(deployDecayFixture);
      await time.increase(25 * DAY);
      expect(await decay.getDaysSinceUpdate(player1.address)).to.equal(25);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Credential Refresh
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Credential Refresh", function () {
    it("Should allow issuer to refresh a credential", async function () {
      const { decay, issuer, player1 } = await loadFixture(deployDecayFixture);
      await time.increase(20 * DAY);
      expect(await decay.getDecayMultiplier(player1.address)).to.equal(8000);

      await expect(decay.connect(issuer).refreshCredential(player1.address))
        .to.emit(decay, "CredentialRefreshed");

      // After refresh, decay resets — multiplier back to 10000
      expect(await decay.getDecayMultiplier(player1.address)).to.equal(10000);
    });

    it("Should reset days since update after refresh", async function () {
      const { decay, issuer, player1 } = await loadFixture(deployDecayFixture);
      await time.increase(15 * DAY);
      expect(await decay.getDaysSinceUpdate(player1.address)).to.equal(15);

      await decay.connect(issuer).refreshCredential(player1.address);
      expect(await decay.getDaysSinceUpdate(player1.address)).to.equal(0);
    });

    it("Should reject refresh from non-issuer", async function () {
      const { decay, stranger, player1 } = await loadFixture(deployDecayFixture);
      await expect(
        decay.connect(stranger).refreshCredential(player1.address)
      ).to.be.revertedWith("Only issuer can refresh");
    });

    it("Should reject refresh for non-existent credential", async function () {
      const { decay, issuer, stranger } = await loadFixture(deployDecayFixture);
      await expect(
        decay.connect(issuer).refreshCredential(stranger.address)
      ).to.be.revertedWith("No credential");
    });

    it("Should decay again after refresh from the new refresh time", async function () {
      const { decay, issuer, player1 } = await loadFixture(deployDecayFixture);

      // Let 20 days pass → 80% multiplier
      await time.increase(20 * DAY);
      expect(await decay.getDecayMultiplier(player1.address)).to.equal(8000);

      // Refresh
      await decay.connect(issuer).refreshCredential(player1.address);
      expect(await decay.getDecayMultiplier(player1.address)).to.equal(10000);

      // Let 5 more days pass → 95% multiplier (from refresh point)
      await time.increase(5 * DAY);
      expect(await decay.getDecayMultiplier(player1.address)).to.equal(9500);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Parameter Updates
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Parameter Updates", function () {
    it("Should allow owner to update decay parameters", async function () {
      const { decay, owner } = await loadFixture(deployDecayFixture);

      await expect(decay.connect(owner).updateDecayParameters(200, 3000))
        .to.emit(decay, "DecayParametersUpdated")
        .withArgs(200, 3000);

      expect(await decay.decayRatePerDay()).to.equal(200);
      expect(await decay.minimumMultiplierBps()).to.equal(3000);
    });

    it("Should reject parameter update from non-owner", async function () {
      const { decay, stranger } = await loadFixture(deployDecayFixture);
      await expect(
        decay.connect(stranger).updateDecayParameters(200, 3000)
      ).to.be.revertedWith("Only owner");
    });

    it("Should reject decay rate above 1000 (10% per day)", async function () {
      const { decay, owner } = await loadFixture(deployDecayFixture);
      await expect(
        decay.connect(owner).updateDecayParameters(1001, 5000)
      ).to.be.revertedWith("Decay rate too high");
    });

    it("Should reject minimum multiplier above BPS", async function () {
      const { decay, owner } = await loadFixture(deployDecayFixture);
      await expect(
        decay.connect(owner).updateDecayParameters(100, 10001)
      ).to.be.revertedWith("Invalid minimum");
    });

    it("Should apply new decay rate to calculations", async function () {
      const { decay, owner, player1 } = await loadFixture(deployDecayFixture);

      // Change to 2% per day (200 bps)
      await decay.connect(owner).updateDecayParameters(200, 5000);

      // After 10 days at 2%: multiplier = 10000 - 2000 = 8000 (80%)
      await time.increase(10 * DAY);
      expect(await decay.getDecayMultiplier(player1.address)).to.equal(8000);

      // ELO 1847 * 80% = 1477
      expect(await decay.getDecayedElo(player1.address)).to.equal(1477);
    });
  });
});
