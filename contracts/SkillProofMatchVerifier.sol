// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMatchHistoryGroth16Verifier {
    function verifyProof(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[3] calldata _pubSignals
    ) external view returns (bool);
}

/// @title SkillProofMatchVerifier — ZK Match History Verification
/// @notice Proves match history properties (games played, win rate) without revealing details
/// @dev Uses Groth16 ZK-SNARKs with a circom circuit (176 constraints)
contract SkillProofMatchVerifier {
    IMatchHistoryGroth16Verifier public immutable groth16Verifier;
    address public owner;

    mapping(address => uint256) public matchCommitments;
    mapping(address => bool) public hasVerifiedHistory;
    mapping(address => uint256) public verifiedMinMatches;
    mapping(address => uint256) public verifiedMinWinRate;

    uint256 public matchVerificationCount;

    event MatchHistoryVerified(
        address indexed user,
        uint256 minMatches,
        uint256 minWinRateBps,
        uint256 commitment
    );

    constructor(address _groth16Verifier) {
        groth16Verifier = IMatchHistoryGroth16Verifier(_groth16Verifier);
        owner = msg.sender;
    }

    /// @notice Register a match history commitment
    /// @dev commitment = totalMatches + wins * 2^16 + salt * 2^32
    function registerMatchCommitment(
        uint256 totalMatches,
        uint256 wins,
        uint256 salt
    ) external {
        require(wins <= totalMatches, "Invalid: wins > matches");
        uint256 commitment = totalMatches + wins * 65536 + salt * 4294967296;
        matchCommitments[msg.sender] = commitment;
    }

    /// @notice Verify a ZK proof of match history properties
    /// @param _pA Proof element A
    /// @param _pB Proof element B
    /// @param _pC Proof element C
    /// @param _pubSignals [minMatches, minWinRateBps, commitment]
    function verifyMatchHistory(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[3] calldata _pubSignals
    ) external {
        require(
            matchCommitments[msg.sender] == _pubSignals[2],
            "Commitment mismatch"
        );

        bool valid = groth16Verifier.verifyProof(_pA, _pB, _pC, _pubSignals);
        require(valid, "Invalid ZK proof");

        hasVerifiedHistory[msg.sender] = true;
        verifiedMinMatches[msg.sender] = _pubSignals[0];
        verifiedMinWinRate[msg.sender] = _pubSignals[1];
        matchVerificationCount++;

        emit MatchHistoryVerified(
            msg.sender,
            _pubSignals[0],
            _pubSignals[1],
            _pubSignals[2]
        );
    }

    /// @notice Check if user has verified match history meeting requirements
    function meetsMatchRequirements(
        address user,
        uint256 requiredMatches,
        uint256 requiredWinRateBps
    ) external view returns (bool) {
        if (!hasVerifiedHistory[user]) return false;
        return (
            verifiedMinMatches[user] >= requiredMatches &&
            verifiedMinWinRate[user] >= requiredWinRateBps
        );
    }

    /// @notice Get verification details for a user
    function getVerification(address user) external view returns (
        bool verified,
        uint256 minMatches,
        uint256 minWinRate,
        uint256 commitment
    ) {
        return (
            hasVerifiedHistory[user],
            verifiedMinMatches[user],
            verifiedMinWinRate[user],
            matchCommitments[user]
        );
    }
}
