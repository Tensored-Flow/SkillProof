import { expect } from "chai";
import { ethers } from "hardhat";
import { SkillProofRegistry } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("SkillProofRegistry", function () {
  let registry: SkillProofRegistry;
  let owner: HardhatEthersSigner;
  let issuer: HardhatEthersSigner;
  let player1: HardhatEthersSigner;
  let player2: HardhatEthersSigner;
  let randomUser: HardhatEthersSigner;

  // Mock data
  const issuerName = "FinCraft Platform";
  const playerName = "TestPlayer";
  const overallElo = 1847;
  const percentile = 96;
  const skillDomains = ["Options Pricing", "Statistical Arbitrage", "Risk Management"];
  const skillScores = [1920, 1750, 1880];
  const skillPercentiles = [95, 78, 91];
  const totalMatches = 342;
  const winRate = 6420;

  beforeEach(async function () {
    [owner, issuer, player1, player2, randomUser] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("SkillProofRegistry");
    registry = await Factory.deploy();

    // Register issuer by default
    await registry.registerIssuer(issuer.address, issuerName);
  });

  describe("Deployment", function () {
    it("should set the deployer as owner", async function () {
      expect(await registry.owner()).to.equal(owner.address);
    });
  });

  describe("Issuer Management", function () {
    it("should allow owner to register an issuer", async function () {
      const [name, isActive] = await registry.getIssuer(issuer.address);
      expect(name).to.equal(issuerName);
      expect(isActive).to.equal(true);
    });

    it("should not allow non-owner to register an issuer", async function () {
      await expect(
        registry.connect(randomUser).registerIssuer(player1.address, "Rogue Issuer")
      ).to.be.revertedWith("Only owner");
    });

    it("should allow owner to revoke an issuer", async function () {
      await registry.revokeIssuer(issuer.address);
      const [, isActive] = await registry.getIssuer(issuer.address);
      expect(isActive).to.equal(false);
    });

    it("should emit IssuerRegistered event", async function () {
      await expect(registry.registerIssuer(player1.address, "New Issuer"))
        .to.emit(registry, "IssuerRegistered")
        .withArgs(player1.address, "New Issuer");
    });

    it("should emit IssuerRevoked event", async function () {
      await expect(registry.revokeIssuer(issuer.address))
        .to.emit(registry, "IssuerRevoked")
        .withArgs(issuer.address);
    });
  });

  describe("Minting Credentials", function () {
    it("should allow a registered issuer to mint a credential", async function () {
      await registry.connect(issuer).mintCredential(
        player1.address, playerName, overallElo, percentile,
        skillDomains, skillScores, skillPercentiles, totalMatches, winRate
      );

      const cred = await registry.getCredential(player1.address);
      expect(cred.playerName).to.equal(playerName);
      expect(cred.isValid).to.equal(true);
    });

    it("should not allow a non-issuer to mint", async function () {
      await expect(
        registry.connect(randomUser).mintCredential(
          player1.address, playerName, overallElo, percentile,
          skillDomains, skillScores, skillPercentiles, totalMatches, winRate
        )
      ).to.be.revertedWith("Not active issuer");
    });

    it("should not allow a revoked issuer to mint", async function () {
      await registry.revokeIssuer(issuer.address);
      await expect(
        registry.connect(issuer).mintCredential(
          player1.address, playerName, overallElo, percentile,
          skillDomains, skillScores, skillPercentiles, totalMatches, winRate
        )
      ).to.be.revertedWith("Not active issuer");
    });

    it("should not allow duplicate credential for the same player", async function () {
      await registry.connect(issuer).mintCredential(
        player1.address, playerName, overallElo, percentile,
        skillDomains, skillScores, skillPercentiles, totalMatches, winRate
      );

      await expect(
        registry.connect(issuer).mintCredential(
          player1.address, playerName, overallElo, percentile,
          skillDomains, skillScores, skillPercentiles, totalMatches, winRate
        )
      ).to.be.revertedWith("Credential already exists");
    });

    it("should store credential data correctly", async function () {
      await registry.connect(issuer).mintCredential(
        player1.address, playerName, overallElo, percentile,
        skillDomains, skillScores, skillPercentiles, totalMatches, winRate
      );

      const cred = await registry.getCredential(player1.address);
      expect(cred.playerName).to.equal(playerName);
      expect(cred.overallElo).to.equal(overallElo);
      expect(cred.percentile).to.equal(percentile);
      expect(cred.skillDomains).to.deep.equal(skillDomains);
      expect(cred.skillScores.map(Number)).to.deep.equal(skillScores);
      expect(cred.skillPercentiles.map(Number)).to.deep.equal(skillPercentiles);
      expect(cred.totalMatches).to.equal(totalMatches);
      expect(cred.winRate).to.equal(winRate);
      expect(cred.issuer).to.equal(issuer.address);
      expect(cred.issuedAt).to.be.greaterThan(0);
      expect(cred.isValid).to.equal(true);
    });

    it("should set hasCredential to true after minting", async function () {
      expect(await registry.hasCredential(player1.address)).to.equal(false);

      await registry.connect(issuer).mintCredential(
        player1.address, playerName, overallElo, percentile,
        skillDomains, skillScores, skillPercentiles, totalMatches, winRate
      );

      expect(await registry.hasCredential(player1.address)).to.equal(true);
    });

    it("should emit CredentialMinted event with correct args", async function () {
      await expect(
        registry.connect(issuer).mintCredential(
          player1.address, playerName, overallElo, percentile,
          skillDomains, skillScores, skillPercentiles, totalMatches, winRate
        )
      )
        .to.emit(registry, "CredentialMinted")
        .withArgs(player1.address, issuer.address, overallElo);
    });

    it("should revert on skillDomains/skillScores length mismatch", async function () {
      await expect(
        registry.connect(issuer).mintCredential(
          player1.address, playerName, overallElo, percentile,
          skillDomains, [1920, 1750], // only 2 scores vs 3 domains
          skillPercentiles, totalMatches, winRate
        )
      ).to.be.revertedWith("Array length mismatch");
    });

    it("should revert on skillDomains/skillPercentiles length mismatch", async function () {
      await expect(
        registry.connect(issuer).mintCredential(
          player1.address, playerName, overallElo, percentile,
          skillDomains, skillScores,
          [95, 78], // only 2 percentiles vs 3 domains
          totalMatches, winRate
        )
      ).to.be.revertedWith("Array length mismatch");
    });
  });

  describe("Updating Credentials", function () {
    const updatedElo = 1920;
    const updatedPercentile = 98;
    const updatedSkillScores = [1980, 1820, 1950];
    const updatedSkillPercentiles = [97, 85, 94];
    const updatedTotalMatches = 400;
    const updatedWinRate = 6700;

    beforeEach(async function () {
      await registry.connect(issuer).mintCredential(
        player1.address, playerName, overallElo, percentile,
        skillDomains, skillScores, skillPercentiles, totalMatches, winRate
      );
    });

    it("should allow the original issuer to update a credential", async function () {
      await registry.connect(issuer).updateCredential(
        player1.address, updatedElo, updatedPercentile,
        updatedSkillScores, updatedSkillPercentiles, updatedTotalMatches, updatedWinRate
      );

      const cred = await registry.getCredential(player1.address);
      expect(cred.overallElo).to.equal(updatedElo);
      expect(cred.percentile).to.equal(updatedPercentile);
      expect(cred.totalMatches).to.equal(updatedTotalMatches);
      expect(cred.winRate).to.equal(updatedWinRate);
    });

    it("should not allow a different issuer to update someone else's credential", async function () {
      // Register a second issuer
      await registry.registerIssuer(randomUser.address, "Other Issuer");

      await expect(
        registry.connect(randomUser).updateCredential(
          player1.address, updatedElo, updatedPercentile,
          updatedSkillScores, updatedSkillPercentiles, updatedTotalMatches, updatedWinRate
        )
      ).to.be.revertedWith("Not original issuer");
    });

    it("should not allow updating a non-existent credential", async function () {
      await expect(
        registry.connect(issuer).updateCredential(
          player2.address, updatedElo, updatedPercentile,
          updatedSkillScores, updatedSkillPercentiles, updatedTotalMatches, updatedWinRate
        )
      ).to.be.revertedWith("Not original issuer");
    });

    it("should not allow updating a revoked credential", async function () {
      await registry.connect(issuer).revokeCredential(player1.address);

      await expect(
        registry.connect(issuer).updateCredential(
          player1.address, updatedElo, updatedPercentile,
          updatedSkillScores, updatedSkillPercentiles, updatedTotalMatches, updatedWinRate
        )
      ).to.be.revertedWith("Invalid credential");
    });

    it("should correctly update only the mutable fields", async function () {
      await registry.connect(issuer).updateCredential(
        player1.address, updatedElo, updatedPercentile,
        updatedSkillScores, updatedSkillPercentiles, updatedTotalMatches, updatedWinRate
      );

      const cred = await registry.getCredential(player1.address);
      expect(cred.overallElo).to.equal(updatedElo);
      expect(cred.skillScores.map(Number)).to.deep.equal(updatedSkillScores);
      expect(cred.skillPercentiles.map(Number)).to.deep.equal(updatedSkillPercentiles);
    });

    it("should leave playerName and skillDomains unchanged after update", async function () {
      await registry.connect(issuer).updateCredential(
        player1.address, updatedElo, updatedPercentile,
        updatedSkillScores, updatedSkillPercentiles, updatedTotalMatches, updatedWinRate
      );

      const cred = await registry.getCredential(player1.address);
      expect(cred.playerName).to.equal(playerName);
      expect(cred.skillDomains).to.deep.equal(skillDomains);
      expect(cred.issuer).to.equal(issuer.address);
    });

    it("should emit CredentialUpdated event", async function () {
      await expect(
        registry.connect(issuer).updateCredential(
          player1.address, updatedElo, updatedPercentile,
          updatedSkillScores, updatedSkillPercentiles, updatedTotalMatches, updatedWinRate
        )
      )
        .to.emit(registry, "CredentialUpdated")
        .withArgs(player1.address, updatedElo);
    });
  });

  describe("Revoking Credentials", function () {
    beforeEach(async function () {
      await registry.connect(issuer).mintCredential(
        player1.address, playerName, overallElo, percentile,
        skillDomains, skillScores, skillPercentiles, totalMatches, winRate
      );
    });

    it("should allow the original issuer to revoke", async function () {
      await registry.connect(issuer).revokeCredential(player1.address);
      const cred = await registry.getCredential(player1.address);
      expect(cred.isValid).to.equal(false);
    });

    it("should allow the owner to revoke any credential", async function () {
      await registry.connect(owner).revokeCredential(player1.address);
      const cred = await registry.getCredential(player1.address);
      expect(cred.isValid).to.equal(false);
    });

    it("should not allow a random address to revoke", async function () {
      await expect(
        registry.connect(randomUser).revokeCredential(player1.address)
      ).to.be.revertedWith("Not authorized");
    });

    it("should set isValid to false after revocation", async function () {
      const credBefore = await registry.getCredential(player1.address);
      expect(credBefore.isValid).to.equal(true);

      await registry.connect(issuer).revokeCredential(player1.address);

      const credAfter = await registry.getCredential(player1.address);
      expect(credAfter.isValid).to.equal(false);
    });

    it("should emit CredentialRevoked event", async function () {
      await expect(registry.connect(issuer).revokeCredential(player1.address))
        .to.emit(registry, "CredentialRevoked")
        .withArgs(player1.address);
    });
  });

  describe("Reading Credentials", function () {
    it("should return the correct full struct via getCredential", async function () {
      await registry.connect(issuer).mintCredential(
        player1.address, playerName, overallElo, percentile,
        skillDomains, skillScores, skillPercentiles, totalMatches, winRate
      );

      const cred = await registry.getCredential(player1.address);
      expect(cred.playerName).to.equal(playerName);
      expect(cred.overallElo).to.equal(overallElo);
      expect(cred.percentile).to.equal(percentile);
      expect(cred.skillDomains).to.deep.equal(skillDomains);
      expect(cred.skillScores.map(Number)).to.deep.equal(skillScores);
      expect(cred.skillPercentiles.map(Number)).to.deep.equal(skillPercentiles);
      expect(cred.totalMatches).to.equal(totalMatches);
      expect(cred.winRate).to.equal(winRate);
      expect(cred.issuer).to.equal(issuer.address);
      expect(cred.issuedAt).to.be.greaterThan(0);
      expect(cred.isValid).to.equal(true);
    });

    it("should return default/empty struct for non-existent player", async function () {
      const cred = await registry.getCredential(randomUser.address);
      expect(cred.playerName).to.equal("");
      expect(cred.overallElo).to.equal(0);
      expect(cred.percentile).to.equal(0);
      expect(cred.skillDomains).to.deep.equal([]);
      expect(cred.skillScores).to.deep.equal([]);
      expect(cred.skillPercentiles).to.deep.equal([]);
      expect(cred.totalMatches).to.equal(0);
      expect(cred.winRate).to.equal(0);
      expect(cred.issuer).to.equal(ethers.ZeroAddress);
      expect(cred.issuedAt).to.equal(0);
      expect(cred.isValid).to.equal(false);
    });

    it("should return correct issuer name and active status via getIssuer", async function () {
      const [name, isActive] = await registry.getIssuer(issuer.address);
      expect(name).to.equal(issuerName);
      expect(isActive).to.equal(true);

      await registry.revokeIssuer(issuer.address);
      const [name2, isActive2] = await registry.getIssuer(issuer.address);
      expect(name2).to.equal(issuerName);
      expect(isActive2).to.equal(false);
    });
  });
});
