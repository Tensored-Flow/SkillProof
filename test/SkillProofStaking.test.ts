import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("SkillProofStaking", function () {
  const MINIMUM_STAKE = ethers.parseEther("0.1");
  const SLASH_PERCENTAGE = 5000n; // 50%
  const SEVEN_DAYS = 7 * 24 * 60 * 60;

  async function deployStakingFixture() {
    const [owner, issuer1, issuer2, nonIssuer, arbiter] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("SkillProofStaking");
    const staking = await Factory.deploy(MINIMUM_STAKE, SLASH_PERCENTAGE);

    return { staking, owner, issuer1, issuer2, nonIssuer, arbiter };
  }

  async function stakedFixture() {
    const { staking, owner, issuer1, issuer2, nonIssuer, arbiter } =
      await loadFixture(deployStakingFixture);

    await staking.connect(issuer1).stake("FinCraft", { value: MINIMUM_STAKE });
    await staking.connect(issuer2).stake("ChessArena", { value: ethers.parseEther("0.2") });

    return { staking, owner, issuer1, issuer2, nonIssuer, arbiter };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Staking
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Staking", function () {
    it("Should allow staking with sufficient value", async function () {
      const { staking, issuer1 } = await loadFixture(deployStakingFixture);

      await expect(staking.connect(issuer1).stake("FinCraft", { value: MINIMUM_STAKE }))
        .to.emit(staking, "Staked")
        .withArgs(issuer1.address, MINIMUM_STAKE, "FinCraft");

      const s = await staking.getStake(issuer1.address);
      expect(s.amount).to.equal(MINIMUM_STAKE);
      expect(s.isActive).to.be.true;
      expect(s.issuerName).to.equal("FinCraft");
      expect(s.slashCount).to.equal(0);
    });

    it("Should reject staking below minimum", async function () {
      const { staking, issuer1 } = await loadFixture(deployStakingFixture);

      await expect(
        staking.connect(issuer1).stake("TooLow", { value: ethers.parseEther("0.01") })
      ).to.be.revertedWith("Below minimum stake");
    });

    it("Should reject double staking", async function () {
      const { staking, issuer1 } = await loadFixture(stakedFixture);

      await expect(
        staking.connect(issuer1).stake("Duplicate", { value: MINIMUM_STAKE })
      ).to.be.revertedWith("Already staked");
    });

    it("Should track totalStaked correctly", async function () {
      const { staking } = await loadFixture(stakedFixture);

      // issuer1 staked 0.1, issuer2 staked 0.2
      expect(await staking.totalStaked()).to.equal(ethers.parseEther("0.3"));
    });

    it("Should track stakedIssuers array", async function () {
      const { staking, issuer1, issuer2 } = await loadFixture(stakedFixture);

      expect(await staking.getStakedIssuerCount()).to.equal(2);
      expect(await staking.stakedIssuers(0)).to.equal(issuer1.address);
      expect(await staking.stakedIssuers(1)).to.equal(issuer2.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Unstaking
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Unstaking", function () {
    it("Should allow unstaking after lock period", async function () {
      const { staking, issuer1 } = await loadFixture(stakedFixture);

      await time.increase(SEVEN_DAYS);

      const balBefore = await ethers.provider.getBalance(issuer1.address);
      const tx = await staking.connect(issuer1).unstake();
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(issuer1.address);

      expect(balAfter - balBefore + gasCost).to.equal(MINIMUM_STAKE);

      const s = await staking.getStake(issuer1.address);
      expect(s.isActive).to.be.false;
      expect(s.amount).to.equal(0);
    });

    it("Should reject unstaking during lock period", async function () {
      const { staking, issuer1 } = await loadFixture(stakedFixture);

      await expect(staking.connect(issuer1).unstake()).to.be.revertedWith(
        "Lock period not elapsed"
      );
    });

    it("Should reject unstaking from non-staker", async function () {
      const { staking, nonIssuer } = await loadFixture(stakedFixture);

      await expect(staking.connect(nonIssuer).unstake()).to.be.revertedWith("Not staked");
    });

    it("Should update totalStaked on unstake", async function () {
      const { staking, issuer1 } = await loadFixture(stakedFixture);

      await time.increase(SEVEN_DAYS);
      await staking.connect(issuer1).unstake();

      // Only issuer2's 0.2 ETH remains
      expect(await staking.totalStaked()).to.equal(ethers.parseEther("0.2"));
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Slashing
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Slashing", function () {
    it("Should slash correct percentage", async function () {
      const { staking, owner, issuer2 } = await loadFixture(stakedFixture);

      // issuer2 staked 0.2 ETH, slash 50% = 0.1 ETH
      await expect(
        staking.connect(owner).slash(issuer2.address, "Fraudulent ELO inflation")
      )
        .to.emit(staking, "Slashed")
        .withArgs(issuer2.address, ethers.parseEther("0.1"), "Fraudulent ELO inflation");

      const s = await staking.getStake(issuer2.address);
      expect(s.amount).to.equal(ethers.parseEther("0.1"));
    });

    it("Should only allow arbiter to slash", async function () {
      const { staking, issuer1, issuer2 } = await loadFixture(stakedFixture);

      await expect(
        staking.connect(issuer1).slash(issuer2.address, "Unauthorized")
      ).to.be.revertedWith("Only arbiter");
    });

    it("Should deactivate issuer if stake falls below minimum", async function () {
      const { staking, owner, issuer1 } = await loadFixture(stakedFixture);

      // issuer1 staked exactly the minimum (0.1 ETH). Slash 50% -> 0.05 < 0.1 minimum
      await staking.connect(owner).slash(issuer1.address, "Fake credentials");

      const s = await staking.getStake(issuer1.address);
      expect(s.isActive).to.be.false;
      expect(await staking.isValidIssuer(issuer1.address)).to.be.false;
    });

    it("Should track slashCount", async function () {
      const { staking, owner, issuer2 } = await loadFixture(stakedFixture);

      await staking.connect(owner).slash(issuer2.address, "First offense");
      await staking.connect(owner).slash(issuer2.address, "Second offense");

      const s = await staking.getStake(issuer2.address);
      expect(s.slashCount).to.equal(2);
    });

    it("Should update totalSlashed", async function () {
      const { staking, owner, issuer2 } = await loadFixture(stakedFixture);

      // Slash issuer2 (0.2 ETH * 50% = 0.1 ETH)
      await staking.connect(owner).slash(issuer2.address, "Fraud");

      expect(await staking.totalSlashed()).to.equal(ethers.parseEther("0.1"));
    });

    it("Should send slashed funds to owner", async function () {
      const { staking, owner, issuer2 } = await loadFixture(stakedFixture);

      const balBefore = await ethers.provider.getBalance(owner.address);
      const tx = await staking.connect(owner).slash(issuer2.address, "Fraud");
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(owner.address);

      // Owner receives 0.1 ETH minus gas cost
      expect(balAfter - balBefore + gasCost).to.equal(ethers.parseEther("0.1"));
    });

    it("Should reject slashing non-staker", async function () {
      const { staking, owner, nonIssuer } = await loadFixture(stakedFixture);

      await expect(
        staking.connect(owner).slash(nonIssuer.address, "Not staked")
      ).to.be.revertedWith("Not staked");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Validation
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Validation", function () {
    it("Should return true for active stakers above minimum", async function () {
      const { staking, issuer1, issuer2 } = await loadFixture(stakedFixture);

      expect(await staking.isValidIssuer(issuer1.address)).to.be.true;
      expect(await staking.isValidIssuer(issuer2.address)).to.be.true;
    });

    it("Should return false for slashed-below-minimum issuers", async function () {
      const { staking, owner, issuer1 } = await loadFixture(stakedFixture);

      await staking.connect(owner).slash(issuer1.address, "Fraud");
      expect(await staking.isValidIssuer(issuer1.address)).to.be.false;
    });

    it("Should return false for non-stakers", async function () {
      const { staking, nonIssuer } = await loadFixture(stakedFixture);

      expect(await staking.isValidIssuer(nonIssuer.address)).to.be.false;
    });

    it("Should return false after unstaking", async function () {
      const { staking, issuer1 } = await loadFixture(stakedFixture);

      await time.increase(SEVEN_DAYS);
      await staking.connect(issuer1).unstake();

      expect(await staking.isValidIssuer(issuer1.address)).to.be.false;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Increase Stake
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Increase Stake", function () {
    it("Should allow increasing stake", async function () {
      const { staking, issuer1 } = await loadFixture(stakedFixture);

      await expect(
        staking.connect(issuer1).increaseStake({ value: ethers.parseEther("0.05") })
      )
        .to.emit(staking, "StakeIncreased")
        .withArgs(issuer1.address, ethers.parseEther("0.15"));

      const s = await staking.getStake(issuer1.address);
      expect(s.amount).to.equal(ethers.parseEther("0.15"));
    });

    it("Should reject non-stakers from increasing", async function () {
      const { staking, nonIssuer } = await loadFixture(stakedFixture);

      await expect(
        staking.connect(nonIssuer).increaseStake({ value: ethers.parseEther("0.1") })
      ).to.be.revertedWith("Not staked");
    });

    it("Should allow recovery from slashing via increaseStake", async function () {
      const { staking, owner, issuer2 } = await loadFixture(stakedFixture);

      // Slash issuer2: 0.2 -> 0.1 (still active, at minimum)
      await staking.connect(owner).slash(issuer2.address, "Warning");

      expect(await staking.isValidIssuer(issuer2.address)).to.be.true;

      // Increase back above minimum
      await staking.connect(issuer2).increaseStake({ value: ethers.parseEther("0.1") });

      const s = await staking.getStake(issuer2.address);
      expect(s.amount).to.equal(ethers.parseEther("0.2"));
      expect(await staking.isValidIssuer(issuer2.address)).to.be.true;
    });

    it("Should update totalStaked on increase", async function () {
      const { staking, issuer1 } = await loadFixture(stakedFixture);

      await staking.connect(issuer1).increaseStake({ value: ethers.parseEther("0.05") });
      expect(await staking.totalStaked()).to.equal(ethers.parseEther("0.35"));
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Admin
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Admin", function () {
    it("Should allow owner to set arbiter", async function () {
      const { staking, owner, arbiter } = await loadFixture(deployStakingFixture);

      await staking.connect(owner).setArbiter(arbiter.address);
      expect(await staking.arbiter()).to.equal(arbiter.address);
    });

    it("Should allow new arbiter to slash", async function () {
      const { staking, owner, issuer1, arbiter } = await loadFixture(stakedFixture);

      await staking.connect(owner).setArbiter(arbiter.address);

      await expect(
        staking.connect(arbiter).slash(issuer1.address, "Arbiter slash")
      ).to.emit(staking, "Slashed");
    });

    it("Should reject non-owner from setting arbiter", async function () {
      const { staking, issuer1, arbiter } = await loadFixture(deployStakingFixture);

      await expect(
        staking.connect(issuer1).setArbiter(arbiter.address)
      ).to.be.revertedWith("Only owner");
    });

    it("Should allow owner to update minimum stake", async function () {
      const { staking, owner } = await loadFixture(deployStakingFixture);

      await staking.connect(owner).setMinimumStake(ethers.parseEther("0.5"));
      expect(await staking.minimumStake()).to.equal(ethers.parseEther("0.5"));
    });
  });
});
