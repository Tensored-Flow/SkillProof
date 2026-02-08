// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SkillProofTreasury — Protocol Revenue Layer
/// @notice Collects fees from protocol interactions and manages treasury
/// @dev Wraps key protocol actions with fee collection
contract SkillProofTreasury {
    address public owner;
    address public feeRecipient; // where fees go (multisig in production)

    // Fee schedule (in wei)
    uint256 public credentialMintFee;    // per credential issued
    uint256 public marketCreationFee;    // per prediction market
    uint256 public verificationFee;      // per ZK/Merkle verification
    uint256 public bountyCommissionBps;  // basis points on arena bounties (e.g., 500 = 5%)

    uint256 public constant BPS = 10000;

    // Revenue tracking
    uint256 public totalRevenue;
    uint256 public totalCredentialFees;
    uint256 public totalMarketFees;
    uint256 public totalVerificationFees;
    uint256 public totalBountyCommissions;

    // Per-issuer revenue tracking
    mapping(address => uint256) public issuerFeesGenerated;

    // Monthly/period revenue snapshots
    struct RevenueSnapshot {
        uint256 timestamp;
        uint256 cumulativeRevenue;
        uint256 periodRevenue;
        uint256 credentialCount;
        uint256 marketCount;
        uint256 verificationCount;
    }
    RevenueSnapshot[] public snapshots;

    // Counters
    uint256 public totalCredentialsMinted;
    uint256 public totalMarketsCreated;
    uint256 public totalVerificationsProcessed;
    uint256 public totalBountiesProcessed;

    event CredentialFeeCollected(address indexed issuer, address indexed user, uint256 fee);
    event MarketFeeCollected(address indexed creator, uint256 fee);
    event VerificationFeeCollected(address indexed user, uint256 fee);
    event BountyCommissionCollected(address indexed solver, uint256 commission, uint256 bountyTotal);
    event FeesWithdrawn(address indexed recipient, uint256 amount);
    event FeeScheduleUpdated(uint256 credentialFee, uint256 marketFee, uint256 verificationFee, uint256 bountyBps);
    event RevenueSnapshotTaken(uint256 indexed snapshotId, uint256 cumulativeRevenue);

    constructor(
        uint256 _credentialMintFee,
        uint256 _marketCreationFee,
        uint256 _verificationFee,
        uint256 _bountyCommissionBps
    ) {
        require(_bountyCommissionBps <= 2000, "Commission too high");
        owner = msg.sender;
        feeRecipient = msg.sender;
        credentialMintFee = _credentialMintFee;
        marketCreationFee = _marketCreationFee;
        verificationFee = _verificationFee;
        bountyCommissionBps = _bountyCommissionBps;
    }

    // ━━━ FEE COLLECTION ━━━

    /// @notice Pay credential minting fee (called by issuer before/after minting)
    function payCredentialFee(address user) external payable {
        require(msg.value >= credentialMintFee, "Insufficient credential fee");

        totalCredentialFees += msg.value;
        totalRevenue += msg.value;
        totalCredentialsMinted++;
        issuerFeesGenerated[msg.sender] += msg.value;

        emit CredentialFeeCollected(msg.sender, user, msg.value);
    }

    /// @notice Pay market creation fee
    function payMarketFee() external payable {
        require(msg.value >= marketCreationFee, "Insufficient market fee");

        totalMarketFees += msg.value;
        totalRevenue += msg.value;
        totalMarketsCreated++;

        emit MarketFeeCollected(msg.sender, msg.value);
    }

    /// @notice Pay verification fee (ZK or Merkle proof verification)
    function payVerificationFee() external payable {
        require(msg.value >= verificationFee, "Insufficient verification fee");

        totalVerificationFees += msg.value;
        totalRevenue += msg.value;
        totalVerificationsProcessed++;

        emit VerificationFeeCollected(msg.sender, msg.value);
    }

    /// @notice Process bounty commission (called when arena bounty is awarded)
    /// @dev Caller sends total bounty, this contract takes commission and forwards rest
    function processBountyCommission(address solver) external payable {
        require(msg.value > 0, "No bounty to process");

        uint256 commission = (msg.value * bountyCommissionBps) / BPS;
        uint256 solverPayout = msg.value - commission;

        totalBountyCommissions += commission;
        totalRevenue += commission;
        totalBountiesProcessed++;

        // Forward payout to solver
        (bool sent, ) = solver.call{value: solverPayout}("");
        require(sent, "Solver payout failed");

        emit BountyCommissionCollected(solver, commission, msg.value);
    }

    // ━━━ REVENUE ANALYTICS ━━━

    /// @notice Take a revenue snapshot (callable by anyone, useful for tracking)
    function takeSnapshot() external {
        uint256 periodRevenue = 0;
        if (snapshots.length > 0) {
            periodRevenue = totalRevenue - snapshots[snapshots.length - 1].cumulativeRevenue;
        } else {
            periodRevenue = totalRevenue;
        }

        snapshots.push(RevenueSnapshot({
            timestamp: block.timestamp,
            cumulativeRevenue: totalRevenue,
            periodRevenue: periodRevenue,
            credentialCount: totalCredentialsMinted,
            marketCount: totalMarketsCreated,
            verificationCount: totalVerificationsProcessed
        }));

        emit RevenueSnapshotTaken(snapshots.length - 1, totalRevenue);
    }

    /// @notice Get revenue breakdown
    function getRevenueBreakdown() external view returns (
        uint256 credentials,
        uint256 markets,
        uint256 verifications,
        uint256 bounties,
        uint256 total
    ) {
        return (
            totalCredentialFees,
            totalMarketFees,
            totalVerificationFees,
            totalBountyCommissions,
            totalRevenue
        );
    }

    /// @notice Get protocol metrics
    function getProtocolMetrics() external view returns (
        uint256 credentialCount,
        uint256 marketCount,
        uint256 verificationCount,
        uint256 bountyCount,
        uint256 revenue,
        uint256 snapshotCount
    ) {
        return (
            totalCredentialsMinted,
            totalMarketsCreated,
            totalVerificationsProcessed,
            totalBountiesProcessed,
            totalRevenue,
            snapshots.length
        );
    }

    /// @notice Get snapshot count
    function getSnapshotCount() external view returns (uint256) {
        return snapshots.length;
    }

    // ━━━ TREASURY MANAGEMENT ━━━

    /// @notice Withdraw accumulated fees to fee recipient
    function withdrawFees() external {
        require(msg.sender == owner || msg.sender == feeRecipient, "Unauthorized");
        uint256 balance = address(this).balance;
        require(balance > 0, "No fees to withdraw");

        (bool sent, ) = feeRecipient.call{value: balance}("");
        require(sent, "Withdrawal failed");

        emit FeesWithdrawn(feeRecipient, balance);
    }

    /// @notice Update fee schedule (owner only)
    function updateFeeSchedule(
        uint256 _credentialFee,
        uint256 _marketFee,
        uint256 _verificationFee,
        uint256 _bountyBps
    ) external {
        require(msg.sender == owner, "Only owner");
        require(_bountyBps <= 2000, "Commission too high"); // max 20%

        credentialMintFee = _credentialFee;
        marketCreationFee = _marketFee;
        verificationFee = _verificationFee;
        bountyCommissionBps = _bountyBps;

        emit FeeScheduleUpdated(_credentialFee, _marketFee, _verificationFee, _bountyBps);
    }

    /// @notice Update fee recipient (owner only)
    function setFeeRecipient(address _recipient) external {
        require(msg.sender == owner, "Only owner");
        require(_recipient != address(0), "Invalid recipient");
        feeRecipient = _recipient;
    }

    /// @notice Get contract balance
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {
        totalRevenue += msg.value;
    }
}
