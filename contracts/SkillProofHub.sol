// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {TestFtsoV2Interface} from
    "@flarenetwork/flare-periphery-contracts/coston2/TestFtsoV2Interface.sol";
import {ContractRegistry} from
    "@flarenetwork/flare-periphery-contracts/coston2/ContractRegistry.sol";

// ──────────────────────────────────────────────────────────────────────────────
// Interfaces
// ──────────────────────────────────────────────────────────────────────────────

interface ISkillProofRegistry {
    struct SkillCredential {
        string playerName;
        uint256 overallElo;
        uint256 percentile;
        string[] skillDomains;
        uint256[] skillScores;
        uint256[] skillPercentiles;
        uint256 totalMatches;
        uint256 winRate;
        address issuer;
        uint256 issuedAt;
        bool isValid;
    }

    function hasCredential(address player) external view returns (bool);
    function getCredential(address player) external view returns (SkillCredential memory);
}

interface ISkillProofAttestor {
    struct Attestation {
        uint256 attestedAt;
        uint256 flareTimestamp;
        int256 anchorPrice;
        string pricePair;
        bool isAttested;
    }

    function getAttestation(address player) external view returns (Attestation memory);
}

// ──────────────────────────────────────────────────────────────────────────────
// SkillProofHub — Skill-gated DeFi, governance, prediction markets & bounties
//                 with cross-module reputation flywheel
// ──────────────────────────────────────────────────────────────────────────────

/// @title SkillProofHub
/// @notice Composes on SkillProofRegistry to gate DeFi vaults, DAO voting,
///         prediction markets (with Flare FTSO oracles), and anonymous bounties.
///         Includes a reputation system that creates a flywheel between modules.
/// @author SkillProof Protocol
contract SkillProofHub {

    // ─── Shared State ────────────────────────────────────────────────────────

    ISkillProofRegistry public immutable registry;
    ISkillProofAttestor public immutable attestor;
    address public owner;

    // ─── Module 5: Reputation ─────────────────────────────────────────────────

    mapping(address => int256) public reputationBonus;
    mapping(address => bool) public isParticipant;
    address[] public participants;
    uint256 public participantCount;

    event ReputationUpdated(address indexed user, int256 newReputation);
    event ParticipantRegistered(address indexed user);

    // ─── Module 1: Vault ─────────────────────────────────────────────────────

    uint256 public vaultEloThreshold;
    mapping(address => uint256) public balances;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

    // ─── Module 2: Govern ────────────────────────────────────────────────────

    struct Proposal {
        uint256 id;
        string description;
        uint256 deadline;
        uint256 yesWeight;
        uint256 noWeight;
        bool executed;
        address proposer;
    }

    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    event ProposalCreated(uint256 indexed id, string description, address indexed proposer);
    event Voted(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight);

    // ─── Module 3: Predict ───────────────────────────────────────────────────

    struct Market {
        uint256 id;
        string question;
        bytes21 feedId;
        int256 targetPrice;
        uint256 commitDeadline;
        uint256 revealDeadline;
        bool resolved;
        int256 actualPrice;
        address creator;
    }

    struct Commitment {
        bytes32 commitHash;
        bool revealed;
        bool prediction;
    }

    uint256 public marketCount;
    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => Commitment)) public commitments;
    mapping(uint256 => address[]) public marketParticipants;

    event MarketCreated(uint256 indexed id, string question);
    event PredictionCommitted(uint256 indexed marketId, address indexed user);
    event PredictionRevealed(uint256 indexed marketId, address indexed user, bool prediction);
    event MarketResolved(uint256 indexed marketId, int256 actualPrice);

    // ─── Module 4: Arena ─────────────────────────────────────────────────────

    struct Bounty {
        uint256 id;
        string description;
        address poster;
        uint256 reward;
        uint256 deadline;
        uint256 commitDeadline;
        bool awarded;
        address winner;
    }

    uint256 public bountyCount;
    mapping(uint256 => Bounty) public bounties;
    mapping(uint256 => mapping(address => bytes32)) public bountySubmissions;
    mapping(uint256 => mapping(address => string)) public bountyReveals;

    event BountyPosted(uint256 indexed id, string description, uint256 reward);
    event SolutionCommitted(uint256 indexed bountyId, address indexed solver);
    event SolutionRevealed(uint256 indexed bountyId, address indexed solver);
    event BountyAwarded(uint256 indexed bountyId, address indexed winner, uint256 reward);

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(address _registry, address _attestor, uint256 _vaultEloThreshold) {
        registry = ISkillProofRegistry(_registry);
        attestor = ISkillProofAttestor(_attestor);
        vaultEloThreshold = _vaultEloThreshold;
        owner = msg.sender;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MODULE 5 — REPUTATION: Cross-Module Flywheel
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Register a participant if not already registered.
    function _registerParticipant(address user) internal {
        if (!isParticipant[user]) {
            isParticipant[user] = true;
            participants.push(user);
            participantCount++;
            emit ParticipantRegistered(user);
        }
    }

    /// @notice Get effective ELO = base credential ELO + reputation bonus.
    ///         Floors at 0 if reputation would push it negative.
    /// @param user The address to query.
    function getEffectiveElo(address user) public view returns (uint256) {
        if (!registry.hasCredential(user)) return 0;
        ISkillProofRegistry.SkillCredential memory cred = registry.getCredential(user);
        if (!cred.isValid) return 0;

        int256 effective = int256(cred.overallElo) + reputationBonus[user];
        if (effective < 0) return 0;
        return uint256(effective);
    }

    /// @notice Get effective voting power = base percentile + reputation boost.
    ///         Reputation can boost but never reduce below base percentile.
    /// @param user The address to query.
    function getEffectiveVotingPower(address user) public view returns (uint256) {
        if (!registry.hasCredential(user)) return 0;
        ISkillProofRegistry.SkillCredential memory cred = registry.getCredential(user);
        if (!cred.isValid) return 0;

        uint256 base = cred.percentile;
        int256 bonus = reputationBonus[user];
        if (bonus > 0) {
            base += uint256(bonus) / 10;
        }
        return base;
    }

    /// @notice Returns the raw reputation bonus for a user.
    function getReputation(address user) external view returns (int256) {
        return reputationBonus[user];
    }

    /// @notice Returns the participant address at a given index.
    function getParticipant(uint256 index) external view returns (address) {
        require(index < participantCount, "Index out of bounds");
        return participants[index];
    }

    /// @notice Returns a paginated slice of the participants array.
    /// @param start Starting index.
    /// @param count Number of participants to return.
    function getLeaderboard(uint256 start, uint256 count) external view returns (address[] memory) {
        if (start >= participantCount) {
            return new address[](0);
        }
        uint256 end = start + count;
        if (end > participantCount) {
            end = participantCount;
        }
        uint256 length = end - start;
        address[] memory result = new address[](length);
        for (uint256 i = 0; i < length; i++) {
            result[i] = participants[start + i];
        }
        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MODULE 1 — VAULT: Skill-Gated DeFi Access
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Deposit native tokens (C2FLR) into the vault.
    function deposit() external payable {
        require(msg.value > 0, "Must deposit > 0");
        _registerParticipant(msg.sender);
        balances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Withdraw tokens from the vault. Caller must hold a valid credential
    ///         with effective ELO (base + reputation) >= the vault threshold.
    /// @param amount The amount of native tokens to withdraw.
    function withdraw(uint256 amount) external {
        require(registry.hasCredential(msg.sender), "No credential");
        ISkillProofRegistry.SkillCredential memory cred = registry.getCredential(msg.sender);
        require(cred.isValid, "Credential revoked");
        require(getEffectiveElo(msg.sender) >= vaultEloThreshold, "Effective ELO below threshold");
        require(balances[msg.sender] >= amount, "Insufficient balance");

        balances[msg.sender] -= amount;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "Transfer failed");
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Returns the total native token balance held by the vault.
    function getVaultBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MODULE 2 — GOVERN: Skill-Weighted DAO Voting
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Create a governance proposal. Caller must hold a valid credential.
    /// @param description The proposal description.
    /// @param deadline The voting deadline (unix timestamp).
    function createProposal(string calldata description, uint256 deadline) external {
        require(registry.hasCredential(msg.sender), "No credential");
        require(deadline > block.timestamp, "Deadline must be in the future");

        _registerParticipant(msg.sender);
        uint256 id = proposalCount++;
        proposals[id] = Proposal({
            id: id,
            description: description,
            deadline: deadline,
            yesWeight: 0,
            noWeight: 0,
            executed: false,
            proposer: msg.sender
        });
        emit ProposalCreated(id, description, msg.sender);
    }

    /// @notice Cast a reputation-boosted skill-weighted vote.
    ///         Weight = base percentile + (reputationBonus / 10) if positive.
    /// @param proposalId The proposal to vote on.
    /// @param support True for yes, false for no.
    function vote(uint256 proposalId, bool support) external {
        require(registry.hasCredential(msg.sender), "No credential");
        Proposal storage p = proposals[proposalId];
        require(p.deadline > 0, "Proposal does not exist");
        require(block.timestamp < p.deadline, "Voting ended");
        require(!hasVoted[proposalId][msg.sender], "Already voted");

        _registerParticipant(msg.sender);
        uint256 weight = getEffectiveVotingPower(msg.sender);
        require(weight > 0, "No voting power");

        hasVoted[proposalId][msg.sender] = true;
        if (support) {
            p.yesWeight += weight;
        } else {
            p.noWeight += weight;
        }
        emit Voted(proposalId, msg.sender, support, weight);
    }

    /// @notice Returns full proposal details.
    /// @param proposalId The proposal ID.
    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        return proposals[proposalId];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MODULE 3 — PREDICT: Expert Prediction Market with Commit-Reveal + FTSO
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Create a prediction market tied to a Flare FTSO price feed.
    /// @param question  Human-readable market question.
    /// @param feedId    FTSO feed ID (e.g., FLR/USD = 0x01464c522f55534400...).
    /// @param targetPrice The price threshold the market resolves against.
    /// @param commitDeadline Deadline to commit predictions (unix timestamp).
    /// @param revealDeadline Deadline to reveal predictions (unix timestamp).
    function createMarket(
        string calldata question,
        bytes21 feedId,
        int256 targetPrice,
        uint256 commitDeadline,
        uint256 revealDeadline
    ) external {
        require(registry.hasCredential(msg.sender), "No credential");
        require(commitDeadline > block.timestamp, "Commit deadline must be future");
        require(revealDeadline > commitDeadline, "Reveal must be after commit");

        uint256 id = marketCount++;
        markets[id] = Market({
            id: id,
            question: question,
            feedId: feedId,
            targetPrice: targetPrice,
            commitDeadline: commitDeadline,
            revealDeadline: revealDeadline,
            resolved: false,
            actualPrice: 0,
            creator: msg.sender
        });
        emit MarketCreated(id, question);
    }

    /// @notice Commit a hashed prediction to a market.
    ///         commitHash = keccak256(abi.encodePacked(prediction, salt))
    /// @param marketId The market ID.
    /// @param commitHash The hash of the prediction and salt.
    function commitPrediction(uint256 marketId, bytes32 commitHash) external {
        require(registry.hasCredential(msg.sender), "No credential");
        Market storage m = markets[marketId];
        require(m.commitDeadline > 0, "Market does not exist");
        require(block.timestamp < m.commitDeadline, "Commit phase ended");
        require(commitments[marketId][msg.sender].commitHash == bytes32(0), "Already committed");

        _registerParticipant(msg.sender);
        commitments[marketId][msg.sender].commitHash = commitHash;
        marketParticipants[marketId].push(msg.sender);
        emit PredictionCommitted(marketId, msg.sender);
    }

    /// @notice Reveal a previously committed prediction.
    /// @param marketId The market ID.
    /// @param prediction The predicted outcome (true = above target, false = below).
    /// @param salt The salt used when committing.
    function revealPrediction(uint256 marketId, bool prediction, bytes32 salt) external {
        Market storage m = markets[marketId];
        require(block.timestamp >= m.commitDeadline, "Commit phase not ended");
        require(block.timestamp < m.revealDeadline, "Reveal phase ended");

        Commitment storage c = commitments[marketId][msg.sender];
        require(c.commitHash != bytes32(0), "No commitment found");
        require(!c.revealed, "Already revealed");

        bytes32 expectedHash = keccak256(abi.encodePacked(prediction, salt));
        require(expectedHash == c.commitHash, "Hash mismatch");

        c.revealed = true;
        c.prediction = prediction;
        emit PredictionRevealed(marketId, msg.sender, prediction);
    }

    /// @notice Resolve a market by reading the live Flare FTSO oracle price.
    ///         Also distributes reputation rewards/penalties to revealed participants.
    /// @param marketId The market ID.
    function resolveMarket(uint256 marketId) external {
        Market storage m = markets[marketId];
        require(m.revealDeadline > 0, "Market does not exist");
        require(block.timestamp >= m.revealDeadline, "Reveal phase not ended");
        require(!m.resolved, "Already resolved");

        // Resolve FtsoV2 via Flare's on-chain contract registry (same as Attestor)
        TestFtsoV2Interface ftsoV2 = ContractRegistry.getTestFtsoV2();

        // Read live price for the market's feed
        (uint256 feedValue, int8 decimals,) = ftsoV2.getFeedById(m.feedId);

        // Convert to signed price with full precision
        int256 price = int256(feedValue);
        if (decimals < 0) {
            price = price * int256(10 ** uint256(uint8(-decimals)));
        }

        m.actualPrice = price;
        m.resolved = true;
        emit MarketResolved(marketId, price);

        // Distribute reputation based on prediction accuracy
        bool outcome = price >= m.targetPrice;
        _distributeMarketReputation(marketId, outcome);
    }

    // TEST HELPER — used for local testing of reputation logic.
    // Cannot use resolveMarket() on Hardhat because it requires live Flare FTSO oracle.
    /// @notice Owner-only: resolve a market with a mock price (for testing).
    function testResolveMarket(uint256 marketId, int256 mockPrice) external {
        require(msg.sender == owner, "Only owner");
        Market storage m = markets[marketId];
        require(m.revealDeadline > 0, "Market does not exist");
        require(!m.resolved, "Already resolved");

        m.actualPrice = mockPrice;
        m.resolved = true;
        emit MarketResolved(marketId, mockPrice);

        bool outcome = mockPrice >= m.targetPrice;
        _distributeMarketReputation(marketId, outcome);
    }

    /// @notice Internal helper to reward/penalize market participants.
    function _distributeMarketReputation(uint256 marketId, bool outcome) internal {
        address[] storage mParticipants = marketParticipants[marketId];
        for (uint256 i = 0; i < mParticipants.length; i++) {
            address user = mParticipants[i];
            Commitment storage c = commitments[marketId][user];
            if (!c.revealed) continue;

            if (c.prediction == outcome) {
                reputationBonus[user] += 10;
            } else {
                reputationBonus[user] -= 5;
            }
            emit ReputationUpdated(user, reputationBonus[user]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MODULE 4 — ARENA: Anonymous Skill Bounties
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Post a bounty with a C2FLR reward. Anyone can post.
    /// @param description The bounty description.
    /// @param commitDeadline Deadline to submit solution commitments (unix timestamp).
    /// @param deadline Deadline to reveal solutions (unix timestamp).
    function postBounty(
        string calldata description,
        uint256 commitDeadline,
        uint256 deadline
    ) external payable {
        require(msg.value > 0, "Must fund bounty");
        require(commitDeadline > block.timestamp, "Commit deadline must be future");
        require(deadline > commitDeadline, "Deadline must be after commit");

        _registerParticipant(msg.sender);
        uint256 id = bountyCount++;
        bounties[id] = Bounty({
            id: id,
            description: description,
            poster: msg.sender,
            reward: msg.value,
            deadline: deadline,
            commitDeadline: commitDeadline,
            awarded: false,
            winner: address(0)
        });
        emit BountyPosted(id, description, msg.value);
    }

    /// @notice Commit a hashed solution to a bounty. Caller must hold a credential.
    ///         commitHash = keccak256(abi.encodePacked(solution, salt))
    /// @param bountyId The bounty ID.
    /// @param commitHash The hash of the solution and salt.
    function commitSolution(uint256 bountyId, bytes32 commitHash) external {
        require(registry.hasCredential(msg.sender), "No credential");
        Bounty storage b = bounties[bountyId];
        require(b.commitDeadline > 0, "Bounty does not exist");
        require(block.timestamp < b.commitDeadline, "Commit phase ended");
        require(bountySubmissions[bountyId][msg.sender] == bytes32(0), "Already committed");

        _registerParticipant(msg.sender);
        bountySubmissions[bountyId][msg.sender] = commitHash;
        emit SolutionCommitted(bountyId, msg.sender);
    }

    /// @notice Reveal a previously committed bounty solution.
    /// @param bountyId The bounty ID.
    /// @param solution The plaintext solution.
    /// @param salt The salt used when committing.
    function revealSolution(uint256 bountyId, string calldata solution, bytes32 salt) external {
        Bounty storage b = bounties[bountyId];
        require(block.timestamp >= b.commitDeadline, "Commit phase not ended");
        require(block.timestamp < b.deadline, "Reveal phase ended");

        bytes32 stored = bountySubmissions[bountyId][msg.sender];
        require(stored != bytes32(0), "No commitment found");

        bytes32 expectedHash = keccak256(abi.encodePacked(solution, salt));
        require(expectedHash == stored, "Hash mismatch");

        bountyReveals[bountyId][msg.sender] = solution;
        emit SolutionRevealed(bountyId, msg.sender);
    }

    /// @notice Award a bounty to a solver. Only the poster can call this.
    ///         Awards +15 reputation to the winner.
    /// @param bountyId The bounty ID.
    /// @param winner The address of the winning solver.
    function awardBounty(uint256 bountyId, address winner) external {
        Bounty storage b = bounties[bountyId];
        require(msg.sender == b.poster, "Only poster can award");
        require(!b.awarded, "Already awarded");
        require(bytes(bountyReveals[bountyId][winner]).length > 0, "Winner has no revealed solution");

        b.awarded = true;
        b.winner = winner;

        // Reputation reward for winning a bounty
        reputationBonus[winner] += 15;
        emit ReputationUpdated(winner, reputationBonus[winner]);

        (bool ok,) = winner.call{value: b.reward}("");
        require(ok, "Transfer failed");
        emit BountyAwarded(bountyId, winner, b.reward);
    }
}
