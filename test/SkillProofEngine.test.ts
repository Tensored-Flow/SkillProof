import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("SkillProofEngine", function () {
  const BASE_ELO = 1200n;

  async function deployEngineFixture() {
    const [owner, reporter, playerA, playerB, playerC, unauthorized] =
      await ethers.getSigners();

    const Factory = await ethers.getContractFactory("SkillProofEngine");
    const engine = await Factory.deploy();

    // Add reporter
    await engine.addReporter(reporter.address);

    return { engine, owner, reporter, playerA, playerB, playerC, unauthorized };
  }

  async function registeredPlayersFixture() {
    const { engine, owner, reporter, playerA, playerB, playerC, unauthorized } =
      await loadFixture(deployEngineFixture);

    // Register players
    await engine.connect(playerA).registerPlayer(["market-making", "derivatives"]);
    await engine.connect(playerB).registerPlayer(["algo-trading", "risk-mgmt"]);
    await engine.connect(playerC).registerPlayer(["derivatives", "portfolio"]);

    return { engine, owner, reporter, playerA, playerB, playerC, unauthorized };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Player Registration
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Player Registration", function () {
    it("Should register with base ELO (1200)", async function () {
      const { engine, playerA } = await loadFixture(deployEngineFixture);

      await expect(
        engine.connect(playerA).registerPlayer(["quant"])
      )
        .to.emit(engine, "PlayerRegistered")
        .withArgs(playerA.address, BASE_ELO);

      const p = await engine.getPlayer(playerA.address);
      expect(p.elo).to.equal(BASE_ELO);
      expect(p.registered).to.be.true;
      expect(p.matchCount).to.equal(0);
    });

    it("Should reject double registration", async function () {
      const { engine, playerA } = await loadFixture(deployEngineFixture);

      await engine.connect(playerA).registerPlayer(["quant"]);
      await expect(
        engine.connect(playerA).registerPlayer(["quant"])
      ).to.be.revertedWith("Already registered");
    });

    it("Should register by address (reporter only)", async function () {
      const { engine, reporter, playerA, unauthorized } =
        await loadFixture(deployEngineFixture);

      await engine.connect(reporter).registerPlayerByAddress(
        playerA.address, 1500, ["market-making"]
      );

      const p = await engine.getPlayer(playerA.address);
      expect(p.elo).to.equal(1500);
      expect(p.registered).to.be.true;

      // Unauthorized should fail
      await expect(
        engine.connect(unauthorized).registerPlayerByAddress(
          unauthorized.address, 1500, ["quant"]
        )
      ).to.be.revertedWith("Not authorized");
    });

    it("Should initialize domain ELOs", async function () {
      const { engine, playerA } = await loadFixture(deployEngineFixture);

      await engine.connect(playerA).registerPlayer(["market-making", "derivatives"]);

      expect(await engine.getDomainElo(playerA.address, "market-making")).to.equal(BASE_ELO);
      expect(await engine.getDomainElo(playerA.address, "derivatives")).to.equal(BASE_ELO);
    });

    it("Should track player count and list", async function () {
      const { engine, playerA, playerB } = await loadFixture(deployEngineFixture);

      await engine.connect(playerA).registerPlayer(["quant"]);
      await engine.connect(playerB).registerPlayer(["quant"]);

      expect(await engine.getPlayerCount()).to.equal(2);
      expect(await engine.playerList(0)).to.equal(playerA.address);
      expect(await engine.playerList(1)).to.equal(playerB.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ELO Calculation
  // ═══════════════════════════════════════════════════════════════════════════

  describe("ELO Calculation", function () {
    it("Equal rating match: winner gains 16, loser loses 16", async function () {
      const { engine, reporter, playerA, playerB } =
        await loadFixture(registeredPlayersFixture);

      // Both at 1200, K=32
      // expected = 5000, actual_winner = 10000
      // change = 32 * (10000 - 5000) / 10000 = 16
      await engine.connect(reporter).recordMatch(
        playerA.address, playerB.address, 1, "market-making"
      );

      const pA = await engine.getPlayer(playerA.address);
      const pB = await engine.getPlayer(playerB.address);
      expect(pA.elo).to.equal(1216);
      expect(pB.elo).to.equal(1184);
    });

    it("Higher-rated beats lower: small gain, small loss", async function () {
      const { engine, reporter, playerA, playerB } =
        await loadFixture(deployEngineFixture);

      // Register A at 1400, B at 1000
      await engine.connect(reporter).registerPlayerByAddress(playerA.address, 1400, ["quant"]);
      await engine.connect(reporter).registerPlayerByAddress(playerB.address, 1000, ["quant"]);

      // diff = 400, expected1 = 9000
      // change1 = 32 * (10000 - 9000) / 10000 = 3
      await engine.connect(reporter).recordMatch(
        playerA.address, playerB.address, 1, "quant"
      );

      const pA = await engine.getPlayer(playerA.address);
      const pB = await engine.getPlayer(playerB.address);
      expect(pA.elo).to.equal(1403); // +3
      expect(pB.elo).to.equal(997);  // -3
    });

    it("Upset: lower-rated beats higher — big gain, big loss", async function () {
      const { engine, reporter, playerA, playerB } =
        await loadFixture(deployEngineFixture);

      // A at 1000, B at 1400 — A wins (upset)
      await engine.connect(reporter).registerPlayerByAddress(playerA.address, 1000, ["quant"]);
      await engine.connect(reporter).registerPlayerByAddress(playerB.address, 1400, ["quant"]);

      // diff for A = 1000 - 1400 = -400, expected_A = 1000
      // change_A = 32 * (10000 - 1000) / 10000 = 28
      await engine.connect(reporter).recordMatch(
        playerA.address, playerB.address, 1, "quant"
      );

      const pA = await engine.getPlayer(playerA.address);
      const pB = await engine.getPlayer(playerB.address);
      expect(pA.elo).to.equal(1028); // +28
      expect(pB.elo).to.equal(1372); // -28
    });

    it("Draw between equal players: no change", async function () {
      const { engine, reporter, playerA, playerB } =
        await loadFixture(registeredPlayersFixture);

      // Both at 1200, draw: actual = 5000, expected = 5000, change = 0
      await engine.connect(reporter).recordMatch(
        playerA.address, playerB.address, 3, "market-making"
      );

      const pA = await engine.getPlayer(playerA.address);
      const pB = await engine.getPlayer(playerB.address);
      expect(pA.elo).to.equal(1200);
      expect(pB.elo).to.equal(1200);
    });

    it("Draw between unequal players: lower gains, higher loses", async function () {
      const { engine, reporter, playerA, playerB } =
        await loadFixture(deployEngineFixture);

      await engine.connect(reporter).registerPlayerByAddress(playerA.address, 1400, ["quant"]);
      await engine.connect(reporter).registerPlayerByAddress(playerB.address, 1000, ["quant"]);

      // For A (1400): expected = 9000, actual = 5000
      // change_A = 32 * (5000 - 9000) / 10000 = -12
      // For B (1000): expected = 1000, actual = 5000
      // change_B = 32 * (5000 - 1000) / 10000 = 12
      await engine.connect(reporter).recordMatch(
        playerA.address, playerB.address, 3, "quant"
      );

      const pA = await engine.getPlayer(playerA.address);
      const pB = await engine.getPlayer(playerB.address);
      expect(pA.elo).to.equal(1388); // -12
      expect(pB.elo).to.equal(1012); // +12
    });

    it("ELO floor at 100 — cannot go below", async function () {
      const { engine, reporter, playerA, playerB } =
        await loadFixture(deployEngineFixture);

      // Register A at 102 (near floor), B at 1400
      // diff = -1298 clamped to -400, expected_A = 1000
      // A loses: change = 32 * (0 - 1000) / 10000 = -3
      // _applyChange(102, -3): decrease(3) >= 102-100(2) → floor at 100
      await engine.connect(reporter).registerPlayerByAddress(playerA.address, 102, ["quant"]);
      await engine.connect(reporter).registerPlayerByAddress(playerB.address, 1400, ["quant"]);

      await engine.connect(reporter).recordMatch(
        playerA.address, playerB.address, 2, "quant"
      );

      const pA = await engine.getPlayer(playerA.address);
      expect(pA.elo).to.equal(100);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // K-Factor
  // ═══════════════════════════════════════════════════════════════════════════

  describe("K-Factor", function () {
    it("New player (< 30 games): K=32", async function () {
      const { engine, reporter, playerA, playerB } =
        await loadFixture(registeredPlayersFixture);

      // Both new players at 1200, K=32. Winner gets +16.
      await engine.connect(reporter).recordMatch(
        playerA.address, playerB.address, 1, ""
      );

      const pA = await engine.getPlayer(playerA.address);
      expect(pA.elo).to.equal(1216); // +16 = K_NEW/2 = 32/2
    });

    it("Established player (30+ games): K=24", async function () {
      const { engine, reporter, playerA, playerB } =
        await loadFixture(registeredPlayersFixture);

      // Play 30 matches to make playerA established
      for (let i = 0; i < 30; i++) {
        await engine.connect(reporter).recordMatch(
          playerA.address, playerB.address, i % 2 === 0 ? 1 : 2, ""
        );
      }

      // After 30 alternating wins/losses, both should be near 1200 still
      const pABefore = await engine.getPlayer(playerA.address);
      expect(pABefore.matchCount).to.equal(30);

      // Now record one more — playerA has 30 games (K=24), playerB has 30 (K=24)
      // Both near 1200: change = 24 * 5000 / 10000 = 12
      const eloBefore = pABefore.elo;
      await engine.connect(reporter).recordMatch(
        playerA.address, playerB.address, 1, ""
      );

      const pAAfter = await engine.getPlayer(playerA.address);
      const gain = pAAfter.elo - eloBefore;
      // K=24, near-equal ratings: gain should be ~12
      expect(gain).to.equal(12);
    });

    it("Expert player (2000+ ELO): K=16", async function () {
      const { engine, reporter, playerA, playerB } =
        await loadFixture(deployEngineFixture);

      // Register A at 2100 (expert), B at 2100 (expert)
      await engine.connect(reporter).registerPlayerByAddress(playerA.address, 2100, ["quant"]);
      await engine.connect(reporter).registerPlayerByAddress(playerB.address, 2100, ["quant"]);

      // Both expert (K=16), equal ratings: change = 16 * 5000 / 10000 = 8
      await engine.connect(reporter).recordMatch(
        playerA.address, playerB.address, 1, "quant"
      );

      const pA = await engine.getPlayer(playerA.address);
      const pB = await engine.getPlayer(playerB.address);
      expect(pA.elo).to.equal(2108); // +8
      expect(pB.elo).to.equal(2092); // -8
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Match Recording
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Match Recording", function () {
    it("Should record match and update both players", async function () {
      const { engine, reporter, playerA, playerB } =
        await loadFixture(registeredPlayersFixture);

      await expect(
        engine.connect(reporter).recordMatch(playerA.address, playerB.address, 1, "market-making")
      ).to.emit(engine, "MatchRecorded");

      expect(await engine.getMatchCount()).to.equal(1);
      expect(await engine.totalMatches()).to.equal(1);
    });

    it("Should update win/loss/draw counters", async function () {
      const { engine, reporter, playerA, playerB, playerC } =
        await loadFixture(registeredPlayersFixture);

      // A wins vs B, A draws vs C, A loses vs B
      await engine.connect(reporter).recordMatch(playerA.address, playerB.address, 1, "");
      await engine.connect(reporter).recordMatch(playerA.address, playerC.address, 3, "");
      await engine.connect(reporter).recordMatch(playerA.address, playerB.address, 2, "");

      const pA = await engine.getPlayer(playerA.address);
      expect(pA.wins).to.equal(1);
      expect(pA.draws).to.equal(1);
      expect(pA.losses).to.equal(1);
      expect(pA.matchCount).to.equal(3);
    });

    it("Should track peak ELO", async function () {
      const { engine, reporter, playerA, playerB } =
        await loadFixture(registeredPlayersFixture);

      // A wins: ELO goes to 1216 (new peak)
      await engine.connect(reporter).recordMatch(playerA.address, playerB.address, 1, "");
      // A loses: ELO drops, but peak stays
      await engine.connect(reporter).recordMatch(playerA.address, playerB.address, 2, "");

      const pA = await engine.getPlayer(playerA.address);
      expect(pA.peakElo).to.equal(1216);
      expect(pA.elo).to.be.lt(1216n);
    });

    it("Should track win streaks", async function () {
      const { engine, reporter, playerA, playerB } =
        await loadFixture(registeredPlayersFixture);

      // A wins 3 in a row
      await engine.connect(reporter).recordMatch(playerA.address, playerB.address, 1, "");
      await engine.connect(reporter).recordMatch(playerA.address, playerB.address, 1, "");
      await engine.connect(reporter).recordMatch(playerA.address, playerB.address, 1, "");

      let pA = await engine.getPlayer(playerA.address);
      expect(pA.currentStreak).to.equal(3);
      expect(pA.longestStreak).to.equal(3);

      // A loses — streak resets
      await engine.connect(reporter).recordMatch(playerA.address, playerB.address, 2, "");

      pA = await engine.getPlayer(playerA.address);
      expect(pA.currentStreak).to.equal(0);
      expect(pA.longestStreak).to.equal(3); // longest preserved
    });

    it("Should update domain-specific ELO", async function () {
      const { engine, reporter, playerA, playerB } =
        await loadFixture(registeredPlayersFixture);

      await engine.connect(reporter).recordMatch(
        playerA.address, playerB.address, 1, "market-making"
      );

      expect(await engine.getDomainElo(playerA.address, "market-making")).to.equal(1216);
      expect(await engine.getDomainElo(playerB.address, "market-making")).to.equal(1184);
      // Other domains unchanged
      expect(await engine.getDomainElo(playerA.address, "derivatives")).to.equal(1200);
    });

    it("Should reject unauthorized reporters", async function () {
      const { engine, unauthorized, playerA, playerB } =
        await loadFixture(registeredPlayersFixture);

      await expect(
        engine.connect(unauthorized).recordMatch(playerA.address, playerB.address, 1, "")
      ).to.be.revertedWith("Not authorized");
    });

    it("Should reject unregistered players", async function () {
      const { engine, reporter, playerA, unauthorized } =
        await loadFixture(registeredPlayersFixture);

      await expect(
        engine.connect(reporter).recordMatch(playerA.address, unauthorized.address, 1, "")
      ).to.be.revertedWith("Player 2 not registered");
    });

    it("Should reject self-play", async function () {
      const { engine, reporter, playerA } =
        await loadFixture(registeredPlayersFixture);

      await expect(
        engine.connect(reporter).recordMatch(playerA.address, playerA.address, 1, "")
      ).to.be.revertedWith("Cannot play self");
    });

    it("Should reject invalid outcome", async function () {
      const { engine, reporter, playerA, playerB } =
        await loadFixture(registeredPlayersFixture);

      await expect(
        engine.connect(reporter).recordMatch(playerA.address, playerB.address, 0, "")
      ).to.be.revertedWith("Invalid outcome");

      await expect(
        engine.connect(reporter).recordMatch(playerA.address, playerB.address, 4, "")
      ).to.be.revertedWith("Invalid outcome");
    });

    it("Should store correct match details", async function () {
      const { engine, reporter, playerA, playerB } =
        await loadFixture(registeredPlayersFixture);

      await engine.connect(reporter).recordMatch(playerA.address, playerB.address, 1, "derivatives");

      const m = await engine.getMatch(0);
      expect(m.player1).to.equal(playerA.address);
      expect(m.player2).to.equal(playerB.address);
      expect(m.outcome).to.equal(1);
      expect(m.player1EloBefore).to.equal(1200);
      expect(m.player2EloBefore).to.equal(1200);
      expect(m.player1EloChange).to.equal(16);
      expect(m.player2EloChange).to.equal(-16);
      expect(m.domain).to.equal("derivatives");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Simulation
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Simulation", function () {
    it("simulateMatch should return correct hypothetical changes", async function () {
      const { engine, playerA, playerB } = await loadFixture(registeredPlayersFixture);

      // Equal ratings, player1 wins: +16, -16
      const [change1, change2] = await engine.simulateMatch(
        playerA.address, playerB.address, 1
      );

      expect(change1).to.equal(16);
      expect(change2).to.equal(-16);
    });

    it("Should not modify state", async function () {
      const { engine, playerA, playerB } = await loadFixture(registeredPlayersFixture);

      await engine.simulateMatch(playerA.address, playerB.address, 1);

      const pA = await engine.getPlayer(playerA.address);
      expect(pA.elo).to.equal(1200); // Unchanged
      expect(pA.matchCount).to.equal(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Statistics
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Statistics", function () {
    it("getWinRate returns correct percentage", async function () {
      const { engine, reporter, playerA, playerB } =
        await loadFixture(registeredPlayersFixture);

      // A wins 3, loses 1 = 75% = 7500 bps
      await engine.connect(reporter).recordMatch(playerA.address, playerB.address, 1, "");
      await engine.connect(reporter).recordMatch(playerA.address, playerB.address, 1, "");
      await engine.connect(reporter).recordMatch(playerA.address, playerB.address, 1, "");
      await engine.connect(reporter).recordMatch(playerA.address, playerB.address, 2, "");

      expect(await engine.getWinRate(playerA.address)).to.equal(7500);
    });

    it("getWinRate returns 0 for player with no matches", async function () {
      const { engine, playerA } = await loadFixture(registeredPlayersFixture);

      expect(await engine.getWinRate(playerA.address)).to.equal(0);
    });

    it("getPlayer returns full stats", async function () {
      const { engine, reporter, playerA, playerB } =
        await loadFixture(registeredPlayersFixture);

      await engine.connect(reporter).recordMatch(playerA.address, playerB.address, 1, "");

      const p = await engine.getPlayer(playerA.address);
      expect(p.elo).to.equal(1216);
      expect(p.wins).to.equal(1);
      expect(p.losses).to.equal(0);
      expect(p.draws).to.equal(0);
      expect(p.matchCount).to.equal(1);
      expect(p.peakElo).to.equal(1216);
      expect(p.currentStreak).to.equal(1);
      expect(p.longestStreak).to.equal(1);
      expect(p.registered).to.be.true;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Admin
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Admin", function () {
    it("Should allow owner to add reporter", async function () {
      const { engine, owner, unauthorized } = await loadFixture(deployEngineFixture);

      await engine.connect(owner).addReporter(unauthorized.address);
      expect(await engine.authorizedReporters(unauthorized.address)).to.be.true;
    });

    it("Should allow owner to remove reporter", async function () {
      const { engine, owner, reporter } = await loadFixture(deployEngineFixture);

      await engine.connect(owner).removeReporter(reporter.address);
      expect(await engine.authorizedReporters(reporter.address)).to.be.false;
    });

    it("Should reject non-owner from adding reporter", async function () {
      const { engine, unauthorized } = await loadFixture(deployEngineFixture);

      await expect(
        engine.connect(unauthorized).addReporter(unauthorized.address)
      ).to.be.revertedWith("Only owner");
    });
  });
});
