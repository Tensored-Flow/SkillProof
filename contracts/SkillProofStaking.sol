// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title SkillProofStaking — Economic Security for Credential Issuers
/// @notice Issuers stake native tokens to register. Fraudulent issuers get slashed.
/// @dev Standalone contract — does not modify the deployed Registry.
contract SkillProofStaking {
    address public owner;
    address public arbiter; // who can trigger slashing (governance in production)

    uint256 public minimumStake;
    uint256 public slashPercentage; // basis points (e.g., 5000 = 50%)
    uint256 public constant BPS = 10000;

    struct IssuerStake {
        uint256 amount;
        uint256 stakedAt;
        bool isActive;
        uint256 slashCount;
        string issuerName;
    }

    mapping(address => IssuerStake) public stakes;
    address[] public stakedIssuers;
    uint256 public totalStaked;
    uint256 public totalSlashed;

    event Staked(address indexed issuer, uint256 amount, string name);
    event Unstaked(address indexed issuer, uint256 amount);
    event Slashed(address indexed issuer, uint256 amount, string reason);
    event StakeIncreased(address indexed issuer, uint256 newTotal);

    constructor(uint256 _minimumStake, uint256 _slashPercentage) {
        require(_slashPercentage <= BPS, "Slash percentage exceeds 100%");
        owner = msg.sender;
        arbiter = msg.sender;
        minimumStake = _minimumStake;
        slashPercentage = _slashPercentage;
    }

    /// @notice Stake native tokens to register as an issuer
    function stake(string calldata issuerName) external payable {
        require(msg.value >= minimumStake, "Below minimum stake");
        require(!stakes[msg.sender].isActive, "Already staked");

        stakes[msg.sender] = IssuerStake({
            amount: msg.value,
            stakedAt: block.timestamp,
            isActive: true,
            slashCount: 0,
            issuerName: issuerName
        });

        stakedIssuers.push(msg.sender);
        totalStaked += msg.value;

        emit Staked(msg.sender, msg.value, issuerName);
    }

    /// @notice Increase stake (to recover from partial slashing)
    function increaseStake() external payable {
        require(stakes[msg.sender].isActive, "Not staked");
        require(msg.value > 0, "Must send value");

        stakes[msg.sender].amount += msg.value;
        totalStaked += msg.value;

        emit StakeIncreased(msg.sender, stakes[msg.sender].amount);
    }

    /// @notice Unstake after the 7-day lock period
    function unstake() external {
        IssuerStake storage s = stakes[msg.sender];
        require(s.isActive, "Not staked");
        require(block.timestamp >= s.stakedAt + 7 days, "Lock period not elapsed");

        uint256 amount = s.amount;
        s.amount = 0;
        s.isActive = false;
        totalStaked -= amount;

        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent, "Transfer failed");

        emit Unstaked(msg.sender, amount);
    }

    /// @notice Slash an issuer for fraudulent credentials
    /// @dev Only arbiter can slash. In production: governance vote or dispute resolution.
    function slash(address issuer, string calldata reason) external {
        require(msg.sender == arbiter, "Only arbiter");
        IssuerStake storage s = stakes[issuer];
        require(s.isActive, "Not staked");
        require(s.amount > 0, "Nothing to slash");

        uint256 slashAmount = (s.amount * slashPercentage) / BPS;
        s.amount -= slashAmount;
        s.slashCount++;
        totalStaked -= slashAmount;
        totalSlashed += slashAmount;

        // Slashed funds go to protocol treasury (owner for now)
        (bool sent, ) = owner.call{value: slashAmount}("");
        require(sent, "Transfer failed");

        // If stake falls below minimum, deactivate
        if (s.amount < minimumStake) {
            s.isActive = false;
        }

        emit Slashed(issuer, slashAmount, reason);
    }

    /// @notice Check if an issuer has sufficient stake
    function isValidIssuer(address issuer) external view returns (bool) {
        return stakes[issuer].isActive && stakes[issuer].amount >= minimumStake;
    }

    /// @notice Get issuer stake details
    function getStake(address issuer) external view returns (IssuerStake memory) {
        return stakes[issuer];
    }

    /// @notice Get total number of staked issuers
    function getStakedIssuerCount() external view returns (uint256) {
        return stakedIssuers.length;
    }

    /// @notice Update arbiter (owner only)
    function setArbiter(address _arbiter) external {
        require(msg.sender == owner, "Only owner");
        arbiter = _arbiter;
    }

    /// @notice Update minimum stake (owner only)
    function setMinimumStake(uint256 _minimumStake) external {
        require(msg.sender == owner, "Only owner");
        minimumStake = _minimumStake;
    }
}
