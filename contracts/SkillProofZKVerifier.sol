// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "./Groth16Verifier.sol";

/// @title SkillProofZKVerifier — ZK-SNARK Threshold Proof Verifier
/// @notice Verifies Groth16 proofs that a user's ELO >= threshold without revealing the ELO.
///         Uses a circom2 circuit compiled to a snarkjs Groth16 verifier on-chain.
contract SkillProofZKVerifier {
    Groth16Verifier public immutable groth16Verifier;

    mapping(address => bool) public zkVerifiedAboveThreshold;
    mapping(address => uint256) public zkVerifiedThreshold;
    mapping(address => uint256) public zkVerifiedCommitment;
    uint256 public zkVerificationCount;

    event ZKThresholdVerified(address indexed user, uint256 threshold, uint256 commitment);

    constructor(address _verifier) {
        groth16Verifier = Groth16Verifier(_verifier);
    }

    /// @notice Verify a ZK-SNARK threshold proof on-chain.
    /// @param _pA Groth16 proof point A
    /// @param _pB Groth16 proof point B
    /// @param _pC Groth16 proof point C
    /// @param _pubSignals Public signals: [valid, threshold, credentialCommitment]
    function verifyThresholdZK(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[3] calldata _pubSignals
    ) external returns (bool) {
        // pubSignals[0] = valid (circuit output, always 1)
        // pubSignals[1] = threshold (public input)
        // pubSignals[2] = credentialCommitment (public input)
        require(_pubSignals[0] == 1, "Invalid circuit output");

        bool valid = groth16Verifier.verifyProof(_pA, _pB, _pC, _pubSignals);
        require(valid, "ZK proof invalid");

        zkVerifiedAboveThreshold[msg.sender] = true;
        zkVerifiedThreshold[msg.sender] = _pubSignals[1];
        zkVerifiedCommitment[msg.sender] = _pubSignals[2];
        zkVerificationCount++;

        emit ZKThresholdVerified(msg.sender, _pubSignals[1], _pubSignals[2]);
        return true;
    }

    /// @notice Check if a user has been ZK-verified above their threshold.
    function isZKVerified(address user) external view returns (bool) {
        return zkVerifiedAboveThreshold[user];
    }

    /// @notice Get the threshold a user proved.
    function getVerifiedThreshold(address user) external view returns (uint256) {
        return zkVerifiedThreshold[user];
    }

    /// @notice Get the credential commitment a user proved against.
    function getVerifiedCommitment(address user) external view returns (uint256) {
        return zkVerifiedCommitment[user];
    }

    /// @notice Get total verification count.
    function getZKVerificationCount() external view returns (uint256) {
        return zkVerificationCount;
    }
}
