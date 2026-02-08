import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("SkillProofTreasury", function () {
  const CREDENTIAL_FEE = ethers.parseEther("0.01");
  const MARKET_FEE = ethers.parseEther("0.05");
  const VERIFICATION_FEE = ethers.parseEther("0.005");
  const BOUNTY_COMMISSION_BPS = 500n; // 5%

  async function deployTreasuryFixture() {
    const [owner, issuer, user, solver, unauthorized] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("SkillProofTreasury");
    const treasury = await Factory.deploy(
      CREDENTIAL_FEE,
      MARKET_FEE,
      VERIFICATION_FEE,
      BOUNTY_COMMISSION_BPS
    );

    return { treasury, owner, issuer, user, solver, unauthorized };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Fee Collection
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Fee Collection", function () {
    it("Should collect credential minting fee", async function () {
      const { treasury, issuer, user } = await loadFixture(deployTreasuryFixture);

      await expect(
        treasury.connect(issuer).payCredentialFee(user.address, { value: CREDENTIAL_FEE })
      )
        .to.emit(treasury, "CredentialFeeCollected")
        .withArgs(issuer.address, user.address, CREDENTIAL_FEE);

      expect(await treasury.totalCredentialFees()).to.equal(CREDENTIAL_FEE);
      expect(await treasury.totalRevenue()).to.equal(CREDENTIAL_FEE);
    });

    it("Should reject insufficient credential fee", async function () {
      const { treasury, issuer, user } = await loadFixture(deployTreasuryFixture);

      await expect(
        treasury.connect(issuer).payCredentialFee(user.address, { value: ethers.parseEther("0.001") })
      ).to.be.revertedWith("Insufficient credential fee");
    });

    it("Should collect market creation fee", async function () {
      const { treasury, user } = await loadFixture(deployTreasuryFixture);

      await expect(
        treasury.connect(user).payMarketFee({ value: MARKET_FEE })
      )
        .to.emit(treasury, "MarketFeeCollected")
        .withArgs(user.address, MARKET_FEE);

      expect(await treasury.totalMarketFees()).to.equal(MARKET_FEE);
      expect(await treasury.totalMarketsCreated()).to.equal(1);
    });

    it("Should collect verification fee", async function () {
      const { treasury, user } = await loadFixture(deployTreasuryFixture);

      await expect(
        treasury.connect(user).payVerificationFee({ value: VERIFICATION_FEE })
      )
        .to.emit(treasury, "VerificationFeeCollected")
        .withArgs(user.address, VERIFICATION_FEE);

      expect(await treasury.totalVerificationFees()).to.equal(VERIFICATION_FEE);
      expect(await treasury.totalVerificationsProcessed()).to.equal(1);
    });

    it("Should track per-issuer revenue", async function () {
      const { treasury, issuer, user } = await loadFixture(deployTreasuryFixture);

      await treasury.connect(issuer).payCredentialFee(user.address, { value: CREDENTIAL_FEE });
      await treasury.connect(issuer).payCredentialFee(user.address, { value: CREDENTIAL_FEE });

      expect(await treasury.issuerFeesGenerated(issuer.address)).to.equal(CREDENTIAL_FEE * 2n);
    });

    it("Should update counters correctly", async function () {
      const { treasury, issuer, user } = await loadFixture(deployTreasuryFixture);

      await treasury.connect(issuer).payCredentialFee(user.address, { value: CREDENTIAL_FEE });
      await treasury.connect(issuer).payCredentialFee(user.address, { value: CREDENTIAL_FEE });
      await treasury.connect(user).payMarketFee({ value: MARKET_FEE });
      await treasury.connect(user).payVerificationFee({ value: VERIFICATION_FEE });

      expect(await treasury.totalCredentialsMinted()).to.equal(2);
      expect(await treasury.totalMarketsCreated()).to.equal(1);
      expect(await treasury.totalVerificationsProcessed()).to.equal(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Bounty Commission
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Bounty Commission", function () {
    it("Should take correct commission percentage", async function () {
      const { treasury, user, solver } = await loadFixture(deployTreasuryFixture);

      const bountyTotal = ethers.parseEther("1.0");
      const expectedCommission = (bountyTotal * BOUNTY_COMMISSION_BPS) / 10000n;

      await expect(
        treasury.connect(user).processBountyCommission(solver.address, { value: bountyTotal })
      )
        .to.emit(treasury, "BountyCommissionCollected")
        .withArgs(solver.address, expectedCommission, bountyTotal);

      expect(await treasury.totalBountyCommissions()).to.equal(expectedCommission);
    });

    it("Should forward remainder to solver", async function () {
      const { treasury, user, solver } = await loadFixture(deployTreasuryFixture);

      const bountyTotal = ethers.parseEther("1.0");
      const expectedCommission = (bountyTotal * BOUNTY_COMMISSION_BPS) / 10000n;
      const expectedPayout = bountyTotal - expectedCommission;

      const balBefore = await ethers.provider.getBalance(solver.address);
      await treasury.connect(user).processBountyCommission(solver.address, { value: bountyTotal });
      const balAfter = await ethers.provider.getBalance(solver.address);

      expect(balAfter - balBefore).to.equal(expectedPayout);
    });

    it("Should reject zero bounty", async function () {
      const { treasury, user, solver } = await loadFixture(deployTreasuryFixture);

      await expect(
        treasury.connect(user).processBountyCommission(solver.address, { value: 0 })
      ).to.be.revertedWith("No bounty to process");
    });

    it("Should track commission total", async function () {
      const { treasury, user, solver } = await loadFixture(deployTreasuryFixture);

      const bounty1 = ethers.parseEther("1.0");
      const bounty2 = ethers.parseEther("2.0");

      await treasury.connect(user).processBountyCommission(solver.address, { value: bounty1 });
      await treasury.connect(user).processBountyCommission(solver.address, { value: bounty2 });

      const commission1 = (bounty1 * BOUNTY_COMMISSION_BPS) / 10000n;
      const commission2 = (bounty2 * BOUNTY_COMMISSION_BPS) / 10000n;

      expect(await treasury.totalBountyCommissions()).to.equal(commission1 + commission2);
      expect(await treasury.totalBountiesProcessed()).to.equal(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Revenue Analytics
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Revenue Analytics", function () {
    it("Should take snapshots", async function () {
      const { treasury, issuer, user } = await loadFixture(deployTreasuryFixture);

      await treasury.connect(issuer).payCredentialFee(user.address, { value: CREDENTIAL_FEE });

      await expect(treasury.takeSnapshot())
        .to.emit(treasury, "RevenueSnapshotTaken")
        .withArgs(0, CREDENTIAL_FEE);

      expect(await treasury.getSnapshotCount()).to.equal(1);
    });

    it("Should calculate period revenue correctly", async function () {
      const { treasury, issuer, user } = await loadFixture(deployTreasuryFixture);

      // Period 1: credential fee
      await treasury.connect(issuer).payCredentialFee(user.address, { value: CREDENTIAL_FEE });
      await treasury.takeSnapshot();

      // Period 2: market fee
      await treasury.connect(user).payMarketFee({ value: MARKET_FEE });
      await treasury.takeSnapshot();

      const snap0 = await treasury.snapshots(0);
      const snap1 = await treasury.snapshots(1);

      expect(snap0.periodRevenue).to.equal(CREDENTIAL_FEE);
      expect(snap1.periodRevenue).to.equal(MARKET_FEE);
      expect(snap1.cumulativeRevenue).to.equal(CREDENTIAL_FEE + MARKET_FEE);
    });

    it("Should return correct breakdown", async function () {
      const { treasury, issuer, user, solver } = await loadFixture(deployTreasuryFixture);

      await treasury.connect(issuer).payCredentialFee(user.address, { value: CREDENTIAL_FEE });
      await treasury.connect(user).payMarketFee({ value: MARKET_FEE });
      await treasury.connect(user).payVerificationFee({ value: VERIFICATION_FEE });
      await treasury.connect(user).processBountyCommission(solver.address, { value: ethers.parseEther("1.0") });

      const bountyCommission = (ethers.parseEther("1.0") * BOUNTY_COMMISSION_BPS) / 10000n;
      const expectedTotal = CREDENTIAL_FEE + MARKET_FEE + VERIFICATION_FEE + bountyCommission;

      const [credentials, markets, verifications, bounties, total] =
        await treasury.getRevenueBreakdown();

      expect(credentials).to.equal(CREDENTIAL_FEE);
      expect(markets).to.equal(MARKET_FEE);
      expect(verifications).to.equal(VERIFICATION_FEE);
      expect(bounties).to.equal(bountyCommission);
      expect(total).to.equal(expectedTotal);
    });

    it("Should return correct protocol metrics", async function () {
      const { treasury, issuer, user, solver } = await loadFixture(deployTreasuryFixture);

      await treasury.connect(issuer).payCredentialFee(user.address, { value: CREDENTIAL_FEE });
      await treasury.connect(user).payMarketFee({ value: MARKET_FEE });
      await treasury.connect(user).payVerificationFee({ value: VERIFICATION_FEE });
      await treasury.connect(user).processBountyCommission(solver.address, { value: ethers.parseEther("1.0") });
      await treasury.takeSnapshot();

      const [credCount, marketCount, verifyCount, bountyCount, revenue, snapCount] =
        await treasury.getProtocolMetrics();

      expect(credCount).to.equal(1);
      expect(marketCount).to.equal(1);
      expect(verifyCount).to.equal(1);
      expect(bountyCount).to.equal(1);
      expect(snapCount).to.equal(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Treasury Management
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Treasury Management", function () {
    it("Should allow owner to withdraw", async function () {
      const { treasury, owner, issuer, user } = await loadFixture(deployTreasuryFixture);

      await treasury.connect(issuer).payCredentialFee(user.address, { value: CREDENTIAL_FEE });

      const balBefore = await ethers.provider.getBalance(owner.address);
      const tx = await treasury.connect(owner).withdrawFees();
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(owner.address);

      expect(balAfter - balBefore + gasCost).to.equal(CREDENTIAL_FEE);
    });

    it("Should allow feeRecipient to withdraw", async function () {
      const { treasury, owner, issuer, user, solver } = await loadFixture(deployTreasuryFixture);

      // Set solver as feeRecipient
      await treasury.connect(owner).setFeeRecipient(solver.address);
      await treasury.connect(issuer).payCredentialFee(user.address, { value: CREDENTIAL_FEE });

      const balBefore = await ethers.provider.getBalance(solver.address);
      const tx = await treasury.connect(solver).withdrawFees();
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(solver.address);

      expect(balAfter - balBefore + gasCost).to.equal(CREDENTIAL_FEE);
    });

    it("Should reject unauthorized withdrawal", async function () {
      const { treasury, issuer, user, unauthorized } = await loadFixture(deployTreasuryFixture);

      await treasury.connect(issuer).payCredentialFee(user.address, { value: CREDENTIAL_FEE });

      await expect(
        treasury.connect(unauthorized).withdrawFees()
      ).to.be.revertedWith("Unauthorized");
    });

    it("Should update fee schedule", async function () {
      const { treasury, owner } = await loadFixture(deployTreasuryFixture);

      const newCredFee = ethers.parseEther("0.02");
      const newMarketFee = ethers.parseEther("0.1");
      const newVerifyFee = ethers.parseEther("0.01");
      const newBountyBps = 1000n;

      await expect(
        treasury.connect(owner).updateFeeSchedule(newCredFee, newMarketFee, newVerifyFee, newBountyBps)
      )
        .to.emit(treasury, "FeeScheduleUpdated")
        .withArgs(newCredFee, newMarketFee, newVerifyFee, newBountyBps);

      expect(await treasury.credentialMintFee()).to.equal(newCredFee);
      expect(await treasury.marketCreationFee()).to.equal(newMarketFee);
      expect(await treasury.verificationFee()).to.equal(newVerifyFee);
      expect(await treasury.bountyCommissionBps()).to.equal(newBountyBps);
    });

    it("Should reject commission > 20%", async function () {
      const { treasury, owner } = await loadFixture(deployTreasuryFixture);

      await expect(
        treasury.connect(owner).updateFeeSchedule(0, 0, 0, 2001)
      ).to.be.revertedWith("Commission too high");
    });

    it("Should reject setting zero address as fee recipient", async function () {
      const { treasury, owner } = await loadFixture(deployTreasuryFixture);

      await expect(
        treasury.connect(owner).setFeeRecipient(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid recipient");
    });

    it("Should reject withdrawal when no fees accrued", async function () {
      const { treasury, owner } = await loadFixture(deployTreasuryFixture);

      await expect(
        treasury.connect(owner).withdrawFees()
      ).to.be.revertedWith("No fees to withdraw");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Integration
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Integration", function () {
    it("Full flow: mint + market + verify + bounty → check total revenue", async function () {
      const { treasury, issuer, user, solver } = await loadFixture(deployTreasuryFixture);

      // 1. Credential minting fee
      await treasury.connect(issuer).payCredentialFee(user.address, { value: CREDENTIAL_FEE });

      // 2. Market creation fee
      await treasury.connect(user).payMarketFee({ value: MARKET_FEE });

      // 3. Verification fee
      await treasury.connect(user).payVerificationFee({ value: VERIFICATION_FEE });

      // 4. Bounty commission (1 FLR bounty, 5% commission = 0.05 FLR)
      const bountyTotal = ethers.parseEther("1.0");
      await treasury.connect(user).processBountyCommission(solver.address, { value: bountyTotal });

      const bountyCommission = (bountyTotal * BOUNTY_COMMISSION_BPS) / 10000n;

      // Total revenue = credential + market + verification + bounty commission
      const expectedTotal = CREDENTIAL_FEE + MARKET_FEE + VERIFICATION_FEE + bountyCommission;
      expect(await treasury.totalRevenue()).to.equal(expectedTotal);

      // Contract balance = fees kept (bounty payout was forwarded to solver)
      const expectedBalance = CREDENTIAL_FEE + MARKET_FEE + VERIFICATION_FEE + bountyCommission;
      expect(await treasury.getBalance()).to.equal(expectedBalance);
    });

    it("Revenue breakdown matches sum of individual fees", async function () {
      const { treasury, issuer, user, solver } = await loadFixture(deployTreasuryFixture);

      // Multiple of each type
      await treasury.connect(issuer).payCredentialFee(user.address, { value: CREDENTIAL_FEE });
      await treasury.connect(issuer).payCredentialFee(user.address, { value: CREDENTIAL_FEE });
      await treasury.connect(user).payMarketFee({ value: MARKET_FEE });
      await treasury.connect(user).payVerificationFee({ value: VERIFICATION_FEE });
      await treasury.connect(user).payVerificationFee({ value: VERIFICATION_FEE });
      await treasury.connect(user).processBountyCommission(solver.address, { value: ethers.parseEther("2.0") });

      const [credentials, markets, verifications, bounties, total] =
        await treasury.getRevenueBreakdown();

      expect(total).to.equal(credentials + markets + verifications + bounties);
    });
  });
});
