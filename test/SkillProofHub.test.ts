import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { SkillProofRegistry, SkillProofHub } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("SkillProofHub", function () {
  const FLR_USD_FEED_ID = "0x01464c522f55534400000000000000000000000000";
  const VAULT_ELO_THRESHOLD = 1500;

  async function deployHubFixture() {
    const [owner, player1, player2, unverified, extra] = await ethers.getSigners();

    // 1. Deploy Registry
    const RegistryFactory = await ethers.getContractFactory("SkillProofRegistry");
    const registry = await RegistryFactory.deploy();

    // 2. Register "FinCraft" as issuer (owner acts as issuer)
    await registry.registerIssuer(owner.address, "FinCraft");

    // 3. Mint credential for player1: ELO 1847, percentile 96
    await registry.mintCredential(
      player1.address, "AlphaTrader", 1847, 96,
      ["market-making", "derivatives"], [1900, 1750], [97, 91], 150, 68
    );

    // 4. Mint credential for player2: ELO 1623, percentile 74
    await registry.mintCredential(
      player2.address, "BetaTrader", 1623, 74,
      ["risk-management", "portfolio"], [1650, 1580], [76, 70], 120, 61
    );

    // 5. Deploy Hub (attestor = zero address — not needed for unit tests)
    const HubFactory = await ethers.getContractFactory("SkillProofHub");
    const hub = await HubFactory.deploy(
      await registry.getAddress(),
      ethers.ZeroAddress,
      VAULT_ELO_THRESHOLD
    );

    return { registry, hub, owner, player1, player2, unverified, extra };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Deployment
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("Should set registry address correctly", async function () {
      const { registry, hub } = await loadFixture(deployHubFixture);
      expect(await hub.registry()).to.equal(await registry.getAddress());
    });

    it("Should set vault ELO threshold correctly", async function () {
      const { hub } = await loadFixture(deployHubFixture);
      expect(await hub.vaultEloThreshold()).to.equal(VAULT_ELO_THRESHOLD);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Module 1 — Vault
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Vault Module", function () {
    it("Should allow anyone to deposit", async function () {
      const { hub, unverified } = await loadFixture(deployHubFixture);
      const amount = ethers.parseEther("1.0");
      await hub.connect(unverified).deposit({ value: amount });
      expect(await hub.balances(unverified.address)).to.equal(amount);
    });

    it("Should emit Deposited and Withdrawn events", async function () {
      const { hub, player1 } = await loadFixture(deployHubFixture);
      const amount = ethers.parseEther("1.0");

      await expect(hub.connect(player1).deposit({ value: amount }))
        .to.emit(hub, "Deposited")
        .withArgs(player1.address, amount);

      await expect(hub.connect(player1).withdraw(amount))
        .to.emit(hub, "Withdrawn")
        .withArgs(player1.address, amount);
    });

    it("Should allow qualified player (ELO >= threshold) to withdraw", async function () {
      const { hub, player1 } = await loadFixture(deployHubFixture);
      const amount = ethers.parseEther("2.0");
      await hub.connect(player1).deposit({ value: amount });
      await hub.connect(player1).withdraw(amount);
      expect(await hub.balances(player1.address)).to.equal(0);
    });

    it("Should reject withdrawal for unverified address (no credential)", async function () {
      const { hub, unverified } = await loadFixture(deployHubFixture);
      await hub.connect(unverified).deposit({ value: ethers.parseEther("1.0") });
      await expect(
        hub.connect(unverified).withdraw(ethers.parseEther("1.0"))
      ).to.be.revertedWith("No credential");
    });

    it("Should reject withdrawal for player below ELO threshold", async function () {
      const { registry, player2 } = await loadFixture(deployHubFixture);
      // Deploy a hub with higher threshold (1700) so player2 (ELO 1623) is below
      const HubFactory = await ethers.getContractFactory("SkillProofHub");
      const strictHub = await HubFactory.deploy(
        await registry.getAddress(), ethers.ZeroAddress, 1700
      );
      await strictHub.connect(player2).deposit({ value: ethers.parseEther("1.0") });
      await expect(
        strictHub.connect(player2).withdraw(ethers.parseEther("1.0"))
      ).to.be.revertedWith("Effective ELO below threshold");
    });

    it("Should reject withdrawal exceeding deposited balance", async function () {
      const { hub, player1 } = await loadFixture(deployHubFixture);
      await hub.connect(player1).deposit({ value: ethers.parseEther("1.0") });
      await expect(
        hub.connect(player1).withdraw(ethers.parseEther("5.0"))
      ).to.be.revertedWith("Insufficient balance");
    });

    it("Should track balances correctly after deposit and withdrawal", async function () {
      const { hub, player1 } = await loadFixture(deployHubFixture);
      await hub.connect(player1).deposit({ value: ethers.parseEther("3.0") });
      expect(await hub.balances(player1.address)).to.equal(ethers.parseEther("3.0"));

      await hub.connect(player1).withdraw(ethers.parseEther("1.0"));
      expect(await hub.balances(player1.address)).to.equal(ethers.parseEther("2.0"));
      expect(await hub.getVaultBalance()).to.equal(ethers.parseEther("2.0"));
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Module 2 — Govern
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Govern Module", function () {
    it("Should allow credentialed user to create proposal", async function () {
      const { hub, player1 } = await loadFixture(deployHubFixture);
      const now = await time.latest();
      const deadline = now + 3600;

      await hub.connect(player1).createProposal("Increase vault threshold", deadline);

      const proposal = await hub.getProposal(0);
      expect(proposal.description).to.equal("Increase vault threshold");
      expect(proposal.proposer).to.equal(player1.address);
      expect(proposal.deadline).to.equal(deadline);
      expect(proposal.yesWeight).to.equal(0);
      expect(proposal.noWeight).to.equal(0);
    });

    it("Should emit ProposalCreated event", async function () {
      const { hub, player1 } = await loadFixture(deployHubFixture);
      const now = await time.latest();

      await expect(hub.connect(player1).createProposal("Test proposal", now + 3600))
        .to.emit(hub, "ProposalCreated")
        .withArgs(0, "Test proposal", player1.address);
    });

    it("Should reject proposal from unverified user", async function () {
      const { hub, unverified } = await loadFixture(deployHubFixture);
      const now = await time.latest();
      await expect(
        hub.connect(unverified).createProposal("Bad proposal", now + 3600)
      ).to.be.revertedWith("No credential");
    });

    it("Should allow skill-weighted voting (weight = percentile)", async function () {
      const { hub, player1 } = await loadFixture(deployHubFixture);
      const now = await time.latest();
      await hub.connect(player1).createProposal("Test", now + 3600);

      // player1 has percentile 96 — vote weight should be 96
      await expect(hub.connect(player1).vote(0, true))
        .to.emit(hub, "Voted")
        .withArgs(0, player1.address, true, 96);

      const proposal = await hub.getProposal(0);
      expect(proposal.yesWeight).to.equal(96);
    });

    it("Should reject double voting", async function () {
      const { hub, player1 } = await loadFixture(deployHubFixture);
      const now = await time.latest();
      await hub.connect(player1).createProposal("Test", now + 3600);
      await hub.connect(player1).vote(0, true);

      await expect(
        hub.connect(player1).vote(0, false)
      ).to.be.revertedWith("Already voted");
    });

    it("Should reject voting after deadline", async function () {
      const { hub, player1 } = await loadFixture(deployHubFixture);
      const now = await time.latest();
      await hub.connect(player1).createProposal("Test", now + 3600);

      await time.increase(3601);

      await expect(
        hub.connect(player1).vote(0, true)
      ).to.be.revertedWith("Voting ended");
    });

    it("Should correctly tally weighted votes from multiple voters", async function () {
      const { hub, player1, player2 } = await loadFixture(deployHubFixture);
      const now = await time.latest();
      await hub.connect(player1).createProposal("Multi-vote test", now + 3600);

      // player1 (percentile 96) votes yes, player2 (percentile 74) votes no
      await hub.connect(player1).vote(0, true);
      await hub.connect(player2).vote(0, false);

      const proposal = await hub.getProposal(0);
      expect(proposal.yesWeight).to.equal(96);
      expect(proposal.noWeight).to.equal(74);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Module 3 — Predict
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Predict Module", function () {
    const TARGET_PRICE = 25000;

    it("Should allow credentialed user to create market", async function () {
      const { hub, player1 } = await loadFixture(deployHubFixture);
      const now = await time.latest();

      await hub.connect(player1).createMarket(
        "Will FLR exceed $0.025?", FLR_USD_FEED_ID, TARGET_PRICE,
        now + 3600, now + 7200
      );

      expect(await hub.marketCount()).to.equal(1);
    });

    it("Should emit MarketCreated event", async function () {
      const { hub, player1 } = await loadFixture(deployHubFixture);
      const now = await time.latest();

      await expect(
        hub.connect(player1).createMarket(
          "Will FLR exceed $0.025?", FLR_USD_FEED_ID, TARGET_PRICE,
          now + 3600, now + 7200
        )
      ).to.emit(hub, "MarketCreated")
        .withArgs(0, "Will FLR exceed $0.025?");
    });

    it("Should reject market creation from unverified user", async function () {
      const { hub, unverified } = await loadFixture(deployHubFixture);
      const now = await time.latest();

      await expect(
        hub.connect(unverified).createMarket(
          "Bad market", FLR_USD_FEED_ID, TARGET_PRICE, now + 3600, now + 7200
        )
      ).to.be.revertedWith("No credential");
    });

    it("Should allow commit during commit phase", async function () {
      const { hub, player1, player2 } = await loadFixture(deployHubFixture);
      const now = await time.latest();
      await hub.connect(player1).createMarket(
        "Test market", FLR_USD_FEED_ID, TARGET_PRICE, now + 3600, now + 7200
      );

      const salt = ethers.id("player2-salt");
      const commitHash = ethers.solidityPackedKeccak256(
        ["bool", "bytes32"], [true, salt]
      );

      await expect(hub.connect(player2).commitPrediction(0, commitHash))
        .to.emit(hub, "PredictionCommitted")
        .withArgs(0, player2.address);
    });

    it("Should reject commit after commit deadline", async function () {
      const { hub, player1, player2 } = await loadFixture(deployHubFixture);
      const now = await time.latest();
      await hub.connect(player1).createMarket(
        "Test market", FLR_USD_FEED_ID, TARGET_PRICE, now + 3600, now + 7200
      );

      await time.increase(3601);

      const salt = ethers.id("late-salt");
      const commitHash = ethers.solidityPackedKeccak256(
        ["bool", "bytes32"], [true, salt]
      );

      await expect(
        hub.connect(player2).commitPrediction(0, commitHash)
      ).to.be.revertedWith("Commit phase ended");
    });

    it("Should reject commit from unverified user", async function () {
      const { hub, player1, unverified } = await loadFixture(deployHubFixture);
      const now = await time.latest();
      await hub.connect(player1).createMarket(
        "Test market", FLR_USD_FEED_ID, TARGET_PRICE, now + 3600, now + 7200
      );

      const commitHash = ethers.id("some-hash");

      await expect(
        hub.connect(unverified).commitPrediction(0, commitHash)
      ).to.be.revertedWith("No credential");
    });

    it("Should allow reveal after commit deadline with correct hash", async function () {
      const { hub, player1 } = await loadFixture(deployHubFixture);
      const now = await time.latest();
      await hub.connect(player1).createMarket(
        "Test market", FLR_USD_FEED_ID, TARGET_PRICE, now + 3600, now + 7200
      );

      const prediction = true;
      const salt = ethers.id("reveal-salt");
      const commitHash = ethers.solidityPackedKeccak256(
        ["bool", "bytes32"], [prediction, salt]
      );

      await hub.connect(player1).commitPrediction(0, commitHash);

      // Advance past commit deadline but before reveal deadline
      await time.increase(3601);

      await expect(hub.connect(player1).revealPrediction(0, prediction, salt))
        .to.emit(hub, "PredictionRevealed")
        .withArgs(0, player1.address, prediction);
    });

    it("Should reject reveal with wrong hash", async function () {
      const { hub, player1 } = await loadFixture(deployHubFixture);
      const now = await time.latest();
      await hub.connect(player1).createMarket(
        "Test market", FLR_USD_FEED_ID, TARGET_PRICE, now + 3600, now + 7200
      );

      const salt = ethers.id("mismatch-salt");
      const commitHash = ethers.solidityPackedKeccak256(
        ["bool", "bytes32"], [true, salt]
      );

      await hub.connect(player1).commitPrediction(0, commitHash);
      await time.increase(3601);

      // Reveal with wrong prediction value (false instead of true)
      await expect(
        hub.connect(player1).revealPrediction(0, false, salt)
      ).to.be.revertedWith("Hash mismatch");
    });

    it("Should reject reveal before commit deadline", async function () {
      const { hub, player1 } = await loadFixture(deployHubFixture);
      const now = await time.latest();
      await hub.connect(player1).createMarket(
        "Test market", FLR_USD_FEED_ID, TARGET_PRICE, now + 3600, now + 7200
      );

      const prediction = true;
      const salt = ethers.id("early-salt");
      const commitHash = ethers.solidityPackedKeccak256(
        ["bool", "bytes32"], [prediction, salt]
      );

      await hub.connect(player1).commitPrediction(0, commitHash);

      // Do NOT advance time — still in commit phase
      await expect(
        hub.connect(player1).revealPrediction(0, prediction, salt)
      ).to.be.revertedWith("Commit phase not ended");
    });

    // Oracle resolution requires live Flare Coston2 — skipped for local Hardhat tests.
    // Tested on Coston2 via seed script.
    it.skip("Should resolve market via Flare FTSO oracle (Coston2 only)", async function () {
      // resolveMarket() calls ContractRegistry.getTestFtsoV2() → getFeedById()
      // which requires the live Flare contract registry at 0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Module 4 — Arena
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Arena Module", function () {
    it("Should allow posting bounty with reward", async function () {
      const { hub, owner } = await loadFixture(deployHubFixture);
      const now = await time.latest();
      const reward = ethers.parseEther("5.0");

      await expect(
        hub.connect(owner).postBounty("Build a DEX", now + 3600, now + 7200, { value: reward })
      ).to.emit(hub, "BountyPosted")
        .withArgs(0, "Build a DEX", reward);

      expect(await hub.bountyCount()).to.equal(1);
    });

    it("Should allow credentialed user to commit solution", async function () {
      const { hub, owner, player1 } = await loadFixture(deployHubFixture);
      const now = await time.latest();
      await hub.connect(owner).postBounty("Solve this", now + 3600, now + 7200, {
        value: ethers.parseEther("1.0"),
      });

      const salt = ethers.id("solution-salt");
      const commitHash = ethers.solidityPackedKeccak256(
        ["string", "bytes32"], ["my-solution", salt]
      );

      await expect(hub.connect(player1).commitSolution(0, commitHash))
        .to.emit(hub, "SolutionCommitted")
        .withArgs(0, player1.address);
    });

    it("Should reject commit from unverified user", async function () {
      const { hub, owner, unverified } = await loadFixture(deployHubFixture);
      const now = await time.latest();
      await hub.connect(owner).postBounty("Solve this", now + 3600, now + 7200, {
        value: ethers.parseEther("1.0"),
      });

      const commitHash = ethers.id("fake-hash");

      await expect(
        hub.connect(unverified).commitSolution(0, commitHash)
      ).to.be.revertedWith("No credential");
    });

    it("Should allow reveal after commit deadline", async function () {
      const { hub, owner, player1 } = await loadFixture(deployHubFixture);
      const now = await time.latest();
      await hub.connect(owner).postBounty("Solve this", now + 3600, now + 7200, {
        value: ethers.parseEther("1.0"),
      });

      const solution = "my-solution";
      const salt = ethers.id("reveal-bounty-salt");
      const commitHash = ethers.solidityPackedKeccak256(
        ["string", "bytes32"], [solution, salt]
      );

      await hub.connect(player1).commitSolution(0, commitHash);
      await time.increase(3601);

      await expect(hub.connect(player1).revealSolution(0, solution, salt))
        .to.emit(hub, "SolutionRevealed")
        .withArgs(0, player1.address);
    });

    it("Should allow poster to award bounty and transfer funds", async function () {
      const { hub, owner, player1 } = await loadFixture(deployHubFixture);
      const now = await time.latest();
      const reward = ethers.parseEther("2.0");

      await hub.connect(owner).postBounty("Solve this", now + 3600, now + 7200, {
        value: reward,
      });

      const solution = "winning-solution";
      const salt = ethers.id("award-salt");
      const commitHash = ethers.solidityPackedKeccak256(
        ["string", "bytes32"], [solution, salt]
      );

      await hub.connect(player1).commitSolution(0, commitHash);
      await time.increase(3601);
      await hub.connect(player1).revealSolution(0, solution, salt);

      // player1 receives reward — check balance change
      const balBefore = await ethers.provider.getBalance(player1.address);

      await expect(hub.connect(owner).awardBounty(0, player1.address))
        .to.emit(hub, "BountyAwarded")
        .withArgs(0, player1.address, reward);

      const balAfter = await ethers.provider.getBalance(player1.address);
      expect(balAfter - balBefore).to.equal(reward);
    });

    it("Should reject award by non-poster", async function () {
      const { hub, owner, player1, player2 } = await loadFixture(deployHubFixture);
      const now = await time.latest();
      await hub.connect(owner).postBounty("Solve this", now + 3600, now + 7200, {
        value: ethers.parseEther("1.0"),
      });

      const solution = "some-solution";
      const salt = ethers.id("non-poster-salt");
      const commitHash = ethers.solidityPackedKeccak256(
        ["string", "bytes32"], [solution, salt]
      );

      await hub.connect(player1).commitSolution(0, commitHash);
      await time.increase(3601);
      await hub.connect(player1).revealSolution(0, solution, salt);

      await expect(
        hub.connect(player2).awardBounty(0, player1.address)
      ).to.be.revertedWith("Only poster can award");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Module 5 — Reputation
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Reputation Module", function () {
    it("Should start with 0 reputation bonus for all users", async function () {
      const { hub, player1, player2, unverified } = await loadFixture(deployHubFixture);
      expect(await hub.getReputation(player1.address)).to.equal(0);
      expect(await hub.getReputation(player2.address)).to.equal(0);
      expect(await hub.getReputation(unverified.address)).to.equal(0);
    });

    it("Should return correct effectiveElo (baseElo + reputationBonus)", async function () {
      const { hub, player1 } = await loadFixture(deployHubFixture);
      // player1 base ELO = 1847, reputation = 0 → effective = 1847
      expect(await hub.getEffectiveElo(player1.address)).to.equal(1847);
    });

    it("Should return 0 effectiveElo for unverified users", async function () {
      const { hub, unverified } = await loadFixture(deployHubFixture);
      expect(await hub.getEffectiveElo(unverified.address)).to.equal(0);
    });

    it("Should register participants on first interaction", async function () {
      const { hub, player1 } = await loadFixture(deployHubFixture);
      expect(await hub.participantCount()).to.equal(0);

      await hub.connect(player1).deposit({ value: ethers.parseEther("0.1") });
      expect(await hub.participantCount()).to.equal(1);
      expect(await hub.isParticipant(player1.address)).to.be.true;
      expect(await hub.getParticipant(0)).to.equal(player1.address);
    });

    it("Should not double-register participants", async function () {
      const { hub, player1 } = await loadFixture(deployHubFixture);
      await hub.connect(player1).deposit({ value: ethers.parseEther("0.1") });
      await hub.connect(player1).deposit({ value: ethers.parseEther("0.2") });
      expect(await hub.participantCount()).to.equal(1);
    });

    it("Should return participant list via getParticipant() and participantCount", async function () {
      const { hub, player1, player2, unverified } = await loadFixture(deployHubFixture);
      // Three different users deposit
      await hub.connect(player1).deposit({ value: ethers.parseEther("0.1") });
      await hub.connect(player2).deposit({ value: ethers.parseEther("0.1") });
      await hub.connect(unverified).deposit({ value: ethers.parseEther("0.1") });

      expect(await hub.participantCount()).to.equal(3);
      expect(await hub.getParticipant(0)).to.equal(player1.address);
      expect(await hub.getParticipant(1)).to.equal(player2.address);
      expect(await hub.getParticipant(2)).to.equal(unverified.address);
    });

    it("Should emit ParticipantRegistered event on first interaction", async function () {
      const { hub, player1 } = await loadFixture(deployHubFixture);
      await expect(hub.connect(player1).deposit({ value: ethers.parseEther("0.1") }))
        .to.emit(hub, "ParticipantRegistered")
        .withArgs(player1.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Reputation Flywheel — Predictions
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Reputation Flywheel — Predictions", function () {
    const TARGET_PRICE = 100000; // target: $1.00 (5 decimals)

    // Helper: create market, commit, reveal, then testResolve
    async function setupAndResolveMarket(
      hub: SkillProofHub,
      creator: HardhatEthersSigner,
      predictor: HardhatEthersSigner,
      owner: HardhatEthersSigner,
      prediction: boolean,
      mockPrice: number,
    ) {
      const now = await time.latest();
      await hub.connect(creator).createMarket(
        "FLR price test", FLR_USD_FEED_ID, TARGET_PRICE,
        now + 3600, now + 7200
      );
      const marketId = Number(await hub.marketCount()) - 1;

      const salt = ethers.id(`salt-${marketId}-${predictor.address}`);
      const commitHash = ethers.solidityPackedKeccak256(
        ["bool", "bytes32"], [prediction, salt]
      );
      await hub.connect(predictor).commitPrediction(marketId, commitHash);

      // Advance past commit deadline into reveal phase
      await time.increase(3601);
      await hub.connect(predictor).revealPrediction(marketId, prediction, salt);

      // Advance past reveal deadline
      await time.increase(3601);

      // Resolve with mock price (owner only)
      await hub.connect(owner).testResolveMarket(marketId, mockPrice);
      return marketId;
    }

    it("Should increase reputation by +10 for correct prediction after market resolution", async function () {
      const { hub, owner, player1 } = await loadFixture(deployHubFixture);
      expect(await hub.getReputation(player1.address)).to.equal(0);

      // player1 predicts true (above target), price resolves above target → correct
      await setupAndResolveMarket(hub, player1, player1, owner, true, 120000);

      expect(await hub.getReputation(player1.address)).to.equal(10);
    });

    it("Should decrease reputation by -5 for wrong prediction after market resolution", async function () {
      const { hub, owner, player1 } = await loadFixture(deployHubFixture);

      // player1 predicts true (above target), price resolves below target → wrong
      await setupAndResolveMarket(hub, player1, player1, owner, true, 80000);

      expect(await hub.getReputation(player1.address)).to.equal(-5);
    });

    it("Should only update reputation for revealed predictions (not unrevealed)", async function () {
      const { hub, owner, player1, player2 } = await loadFixture(deployHubFixture);
      const now = await time.latest();

      // Create market
      await hub.connect(player1).createMarket(
        "Reveal test", FLR_USD_FEED_ID, TARGET_PRICE, now + 3600, now + 7200
      );

      // player1 commits and reveals, player2 only commits (no reveal)
      const salt1 = ethers.id("p1-salt");
      const hash1 = ethers.solidityPackedKeccak256(["bool", "bytes32"], [true, salt1]);
      await hub.connect(player1).commitPrediction(0, hash1);

      const salt2 = ethers.id("p2-salt");
      const hash2 = ethers.solidityPackedKeccak256(["bool", "bytes32"], [true, salt2]);
      await hub.connect(player2).commitPrediction(0, hash2);

      // Advance to reveal phase — only player1 reveals
      await time.increase(3601);
      await hub.connect(player1).revealPrediction(0, true, salt1);
      // player2 does NOT reveal

      // Advance past reveal deadline and resolve
      await time.increase(3601);
      await hub.connect(owner).testResolveMarket(0, 120000); // above target

      // player1 revealed + correct → +10, player2 unrevealed → 0
      expect(await hub.getReputation(player1.address)).to.equal(10);
      expect(await hub.getReputation(player2.address)).to.equal(0);
    });

    it("Should emit ReputationUpdated events on market resolution", async function () {
      const { hub, owner, player1 } = await loadFixture(deployHubFixture);
      const now = await time.latest();

      await hub.connect(player1).createMarket(
        "Event test", FLR_USD_FEED_ID, TARGET_PRICE, now + 3600, now + 7200
      );

      const salt = ethers.id("event-salt");
      const hash = ethers.solidityPackedKeccak256(["bool", "bytes32"], [true, salt]);
      await hub.connect(player1).commitPrediction(0, hash);
      await time.increase(3601);
      await hub.connect(player1).revealPrediction(0, true, salt);
      await time.increase(3601);

      await expect(hub.connect(owner).testResolveMarket(0, 120000))
        .to.emit(hub, "ReputationUpdated")
        .withArgs(player1.address, 10);
    });

    it("Should accumulate reputation across multiple markets", async function () {
      const { hub, owner, player1 } = await loadFixture(deployHubFixture);

      // Win first prediction: +10
      await setupAndResolveMarket(hub, player1, player1, owner, true, 120000);
      expect(await hub.getReputation(player1.address)).to.equal(10);

      // Win second prediction: +10 = 20 total
      await setupAndResolveMarket(hub, player1, player1, owner, false, 80000);
      expect(await hub.getReputation(player1.address)).to.equal(20);

      // Lose third prediction: -5 = 15 total
      await setupAndResolveMarket(hub, player1, player1, owner, true, 80000);
      expect(await hub.getReputation(player1.address)).to.equal(15);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Reputation Flywheel — Bounties
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Reputation Flywheel — Bounties", function () {
    it("Should increase winner reputation by +15 when bounty is awarded", async function () {
      const { hub, owner, player1 } = await loadFixture(deployHubFixture);
      const now = await time.latest();
      const reward = ethers.parseEther("1.0");

      await hub.connect(owner).postBounty("Rep bounty", now + 3600, now + 7200, { value: reward });

      const solution = "bounty-solution";
      const salt = ethers.id("rep-bounty-salt");
      const commitHash = ethers.solidityPackedKeccak256(
        ["string", "bytes32"], [solution, salt]
      );

      await hub.connect(player1).commitSolution(0, commitHash);
      await time.increase(3601);
      await hub.connect(player1).revealSolution(0, solution, salt);

      expect(await hub.getReputation(player1.address)).to.equal(0);

      await hub.connect(owner).awardBounty(0, player1.address);

      expect(await hub.getReputation(player1.address)).to.equal(15);
    });

    it("Should emit ReputationUpdated when bounty is awarded", async function () {
      const { hub, owner, player1 } = await loadFixture(deployHubFixture);
      const now = await time.latest();

      await hub.connect(owner).postBounty("Event bounty", now + 3600, now + 7200, {
        value: ethers.parseEther("1.0"),
      });

      const solution = "event-solution";
      const salt = ethers.id("event-bounty-salt");
      const commitHash = ethers.solidityPackedKeccak256(
        ["string", "bytes32"], [solution, salt]
      );

      await hub.connect(player1).commitSolution(0, commitHash);
      await time.increase(3601);
      await hub.connect(player1).revealSolution(0, solution, salt);

      await expect(hub.connect(owner).awardBounty(0, player1.address))
        .to.emit(hub, "ReputationUpdated")
        .withArgs(player1.address, 15);
    });

    it("Should reflect bounty reputation in effectiveElo", async function () {
      const { hub, owner, player1 } = await loadFixture(deployHubFixture);
      const now = await time.latest();

      // player1 base ELO = 1847
      expect(await hub.getEffectiveElo(player1.address)).to.equal(1847);

      await hub.connect(owner).postBounty("ELO bounty", now + 3600, now + 7200, {
        value: ethers.parseEther("1.0"),
      });

      const solution = "elo-solution";
      const salt = ethers.id("elo-bounty-salt");
      const commitHash = ethers.solidityPackedKeccak256(
        ["string", "bytes32"], [solution, salt]
      );

      await hub.connect(player1).commitSolution(0, commitHash);
      await time.increase(3601);
      await hub.connect(player1).revealSolution(0, solution, salt);
      await hub.connect(owner).awardBounty(0, player1.address);

      // Effective ELO = 1847 + 15 = 1862
      expect(await hub.getEffectiveElo(player1.address)).to.equal(1862);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Reputation Flywheel — Vault Access (THE FLYWHEEL DEMO)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Reputation Flywheel — Vault Access", function () {
    it("Should allow withdrawal when reputation pushes effectiveElo above threshold", async function () {
      // THE FLYWHEEL DEMO TEST:
      // Player has base ELO 1450 (below 1500 threshold).
      // Wins 6 predictions → +60 reputation → effective ELO = 1510 → withdrawal succeeds.
      const { registry, owner, extra } = await loadFixture(deployHubFixture);

      // Mint credential for extra: ELO 1450, percentile 60 (below vault threshold of 1500)
      await registry.mintCredential(
        extra.address, "UnderThreshold", 1450, 60,
        ["general"], [1450], [60], 50, 55
      );

      // Deploy a fresh hub so extra starts with 0 reputation
      const HubFactory = await ethers.getContractFactory("SkillProofHub");
      const hub = await HubFactory.deploy(
        await registry.getAddress(), ethers.ZeroAddress, VAULT_ELO_THRESHOLD
      );

      // Verify: base ELO below threshold → withdrawal fails
      await hub.connect(extra).deposit({ value: ethers.parseEther("1.0") });
      await expect(
        hub.connect(extra).withdraw(ethers.parseEther("0.5"))
      ).to.be.revertedWith("Effective ELO below threshold");

      // Win 6 predictions to earn +60 reputation
      const TARGET_PRICE = 100000;
      for (let i = 0; i < 6; i++) {
        const now = await time.latest();
        await hub.connect(extra).createMarket(
          `Flywheel test ${i}`, FLR_USD_FEED_ID, TARGET_PRICE,
          now + 3600, now + 7200
        );
        const salt = ethers.id(`flywheel-salt-${i}`);
        const commitHash = ethers.solidityPackedKeccak256(
          ["bool", "bytes32"], [true, salt]
        );
        await hub.connect(extra).commitPrediction(i, commitHash);
        await time.increase(3601);
        await hub.connect(extra).revealPrediction(i, true, salt);
        await time.increase(3601);
        // Resolve above target → correct prediction → +10 rep each
        await hub.connect(owner).testResolveMarket(i, 120000);
      }

      // Verify: reputation = +60, effective ELO = 1450 + 60 = 1510 (above 1500)
      expect(await hub.getReputation(extra.address)).to.equal(60);
      expect(await hub.getEffectiveElo(extra.address)).to.equal(1510);

      // NOW withdrawal succeeds — THE FLYWHEEL WORKS
      await hub.connect(extra).withdraw(ethers.parseEther("0.5"));
      expect(await hub.balances(extra.address)).to.equal(ethers.parseEther("0.5"));
    });

    it("Should deny vault withdrawal when effectiveElo drops below threshold", async function () {
      const { registry, hub, owner, player2 } = await loadFixture(deployHubFixture);
      // player2 base ELO = 1623 (above 1500 threshold)
      // Deploy a hub with threshold 1620 so player2 is barely above
      const HubFactory = await ethers.getContractFactory("SkillProofHub");
      const tightHub = await HubFactory.deploy(
        await registry.getAddress(), ethers.ZeroAddress, 1620
      );

      await tightHub.connect(player2).deposit({ value: ethers.parseEther("1.0") });

      // Verify: initially can withdraw (1623 >= 1620)
      await tightHub.connect(player2).withdraw(ethers.parseEther("0.1"));

      // Lose predictions to push reputation negative
      // Need effective ELO < 1620, so need reputation < -3
      // 1 wrong prediction = -5 → effective = 1623 + (-5) = 1618 < 1620
      const now = await time.latest();
      await tightHub.connect(player2).createMarket(
        "Drop test", FLR_USD_FEED_ID, 100000, now + 3600, now + 7200
      );
      const salt = ethers.id("drop-salt");
      const commitHash = ethers.solidityPackedKeccak256(
        ["bool", "bytes32"], [true, salt]
      );
      await tightHub.connect(player2).commitPrediction(0, commitHash);
      await time.increase(3601);
      await tightHub.connect(player2).revealPrediction(0, true, salt);
      await time.increase(3601);
      // Resolve below target → wrong prediction → -5 rep
      await tightHub.connect(owner).testResolveMarket(0, 80000);

      expect(await tightHub.getReputation(player2.address)).to.equal(-5);
      expect(await tightHub.getEffectiveElo(player2.address)).to.equal(1618);

      // Now withdrawal should fail (1618 < 1620)
      await expect(
        tightHub.connect(player2).withdraw(ethers.parseEther("0.5"))
      ).to.be.revertedWith("Effective ELO below threshold");
    });

    it("Should floor effectiveElo at 0 if reputation is deeply negative", async function () {
      const { registry, owner, extra } = await loadFixture(deployHubFixture);

      // Mint credential with low ELO
      await registry.mintCredential(
        extra.address, "LowElo", 10, 5,
        ["general"], [10], [5], 5, 20
      );

      const HubFactory = await ethers.getContractFactory("SkillProofHub");
      const hub = await HubFactory.deploy(
        await registry.getAddress(), ethers.ZeroAddress, VAULT_ELO_THRESHOLD
      );

      // Lose 3 predictions: -15 reputation. ELO 10 + (-15) would be -5 → floor to 0
      for (let i = 0; i < 3; i++) {
        const now = await time.latest();
        await hub.connect(extra).createMarket(
          `Floor test ${i}`, FLR_USD_FEED_ID, 100000, now + 3600, now + 7200
        );
        const salt = ethers.id(`floor-salt-${i}`);
        const commitHash = ethers.solidityPackedKeccak256(
          ["bool", "bytes32"], [true, salt]
        );
        await hub.connect(extra).commitPrediction(i, commitHash);
        await time.increase(3601);
        await hub.connect(extra).revealPrediction(i, true, salt);
        await time.increase(3601);
        await hub.connect(owner).testResolveMarket(i, 80000); // wrong → -5 each
      }

      expect(await hub.getReputation(extra.address)).to.equal(-15);
      expect(await hub.getEffectiveElo(extra.address)).to.equal(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Reputation Flywheel — Governance
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Reputation Flywheel — Governance", function () {
    it("Should give higher voting power to users with positive reputation", async function () {
      const { hub, owner, player1 } = await loadFixture(deployHubFixture);

      // player1 base percentile = 96, reputation = 0 → voting power = 96
      expect(await hub.getEffectiveVotingPower(player1.address)).to.equal(96);

      // Win a prediction for +10 reputation
      const now = await time.latest();
      await hub.connect(player1).createMarket(
        "Gov power test", FLR_USD_FEED_ID, 100000, now + 3600, now + 7200
      );
      const salt = ethers.id("gov-salt");
      const commitHash = ethers.solidityPackedKeccak256(
        ["bool", "bytes32"], [true, salt]
      );
      await hub.connect(player1).commitPrediction(0, commitHash);
      await time.increase(3601);
      await hub.connect(player1).revealPrediction(0, true, salt);
      await time.increase(3601);
      await hub.connect(owner).testResolveMarket(0, 120000);

      // Reputation = +10 → voting power = 96 + (10/10) = 97
      expect(await hub.getReputation(player1.address)).to.equal(10);
      expect(await hub.getEffectiveVotingPower(player1.address)).to.equal(97);
    });

    it("Should not reduce voting power below base percentile for negative reputation", async function () {
      const { hub, owner, player1 } = await loadFixture(deployHubFixture);

      // Lose a prediction for -5 reputation
      const now = await time.latest();
      await hub.connect(player1).createMarket(
        "Gov neg test", FLR_USD_FEED_ID, 100000, now + 3600, now + 7200
      );
      const salt = ethers.id("gov-neg-salt");
      const commitHash = ethers.solidityPackedKeccak256(
        ["bool", "bytes32"], [true, salt]
      );
      await hub.connect(player1).commitPrediction(0, commitHash);
      await time.increase(3601);
      await hub.connect(player1).revealPrediction(0, true, salt);
      await time.increase(3601);
      await hub.connect(owner).testResolveMarket(0, 80000); // wrong → -5

      // Reputation = -5, but voting power should NOT decrease below base percentile (96)
      expect(await hub.getReputation(player1.address)).to.equal(-5);
      expect(await hub.getEffectiveVotingPower(player1.address)).to.equal(96);
    });

    it("Should use effective voting power in actual vote weight", async function () {
      const { hub, owner, player1 } = await loadFixture(deployHubFixture);

      // Win 3 predictions for +30 reputation → voting power = 96 + 3 = 99
      for (let i = 0; i < 3; i++) {
        const now = await time.latest();
        await hub.connect(player1).createMarket(
          `Vote weight ${i}`, FLR_USD_FEED_ID, 100000, now + 3600, now + 7200
        );
        const salt = ethers.id(`vote-weight-salt-${i}`);
        const commitHash = ethers.solidityPackedKeccak256(
          ["bool", "bytes32"], [true, salt]
        );
        await hub.connect(player1).commitPrediction(i, commitHash);
        await time.increase(3601);
        await hub.connect(player1).revealPrediction(i, true, salt);
        await time.increase(3601);
        await hub.connect(owner).testResolveMarket(i, 120000);
      }

      expect(await hub.getEffectiveVotingPower(player1.address)).to.equal(99);

      // Create proposal and vote — weight should be 99
      const now = await time.latest();
      await hub.connect(player1).createProposal("Boosted vote", now + 3600);

      await expect(hub.connect(player1).vote(0, true))
        .to.emit(hub, "Voted")
        .withArgs(0, player1.address, true, 99);

      const proposal = await hub.getProposal(0);
      expect(proposal.yesWeight).to.equal(99);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Leaderboard
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Leaderboard", function () {
    it("Should track all unique participants across modules", async function () {
      const { hub, owner, player1, player2, unverified } = await loadFixture(deployHubFixture);
      const now = await time.latest();

      // player1 deposits (vault)
      await hub.connect(player1).deposit({ value: ethers.parseEther("0.1") });
      // player2 creates proposal (govern)
      await hub.connect(player2).createProposal("Leaderboard test", now + 3600);
      // unverified deposits (vault) — anyone can deposit
      await hub.connect(unverified).deposit({ value: ethers.parseEther("0.1") });
      // owner posts bounty (arena)
      await hub.connect(owner).postBounty("LB bounty", now + 3600, now + 7200, {
        value: ethers.parseEther("0.1"),
      });

      expect(await hub.participantCount()).to.equal(4);
    });

    it("Should return correct participant count", async function () {
      const { hub, player1, player2 } = await loadFixture(deployHubFixture);
      expect(await hub.participantCount()).to.equal(0);

      await hub.connect(player1).deposit({ value: ethers.parseEther("0.1") });
      expect(await hub.participantCount()).to.equal(1);

      await hub.connect(player2).deposit({ value: ethers.parseEther("0.1") });
      expect(await hub.participantCount()).to.equal(2);
    });

    it("Should return participants via getLeaderboard()", async function () {
      const { hub, player1, player2, unverified } = await loadFixture(deployHubFixture);

      await hub.connect(player1).deposit({ value: ethers.parseEther("0.1") });
      await hub.connect(player2).deposit({ value: ethers.parseEther("0.1") });
      await hub.connect(unverified).deposit({ value: ethers.parseEther("0.1") });

      // Full leaderboard
      const full = await hub.getLeaderboard(0, 10);
      expect(full.length).to.equal(3);
      expect(full[0]).to.equal(player1.address);
      expect(full[1]).to.equal(player2.address);
      expect(full[2]).to.equal(unverified.address);
    });

    it("Should paginate leaderboard correctly", async function () {
      const { hub, player1, player2, unverified, extra } = await loadFixture(deployHubFixture);

      await hub.connect(player1).deposit({ value: ethers.parseEther("0.1") });
      await hub.connect(player2).deposit({ value: ethers.parseEther("0.1") });
      await hub.connect(unverified).deposit({ value: ethers.parseEther("0.1") });
      await hub.connect(extra).deposit({ value: ethers.parseEther("0.1") });

      // Page 1: items 0-1
      const page1 = await hub.getLeaderboard(0, 2);
      expect(page1.length).to.equal(2);
      expect(page1[0]).to.equal(player1.address);

      // Page 2: items 2-3
      const page2 = await hub.getLeaderboard(2, 2);
      expect(page2.length).to.equal(2);
      expect(page2[0]).to.equal(unverified.address);

      // Beyond range: empty
      const empty = await hub.getLeaderboard(10, 5);
      expect(empty.length).to.equal(0);
    });

    it("Should cap leaderboard to actual participantCount", async function () {
      const { hub, player1 } = await loadFixture(deployHubFixture);
      await hub.connect(player1).deposit({ value: ethers.parseEther("0.1") });

      // Request 100 but only 1 exists
      const result = await hub.getLeaderboard(0, 100);
      expect(result.length).to.equal(1);
    });
  });
});
