// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface ISkillProofRegistryV {
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

/// @title SkillProofVerifier
/// @notice Merkle tree-based privacy-preserving credential verification.
///         Enables users to prove credential properties (e.g. "ELO >= 1500")
///         without revealing full credential data on-chain.
/// @author SkillProof Protocol
contract SkillProofVerifier {

    // ─── State ──────────────────────────────────────────────────────────────

    bytes32 public credentialMerkleRoot;
    address public registry;
    address public operator;
    mapping(bytes32 => bool) public usedProofs;
    mapping(address => bool) public verifiedAboveThreshold;
    uint256 public verificationCount;

    // ─── Events ─────────────────────────────────────────────────────────────

    event MerkleRootUpdated(bytes32 oldRoot, bytes32 newRoot);
    event CredentialVerified(address indexed user, bytes32 leaf);
    event ThresholdVerified(address indexed user, uint256 threshold);

    // ─── Constructor ────────────────────────────────────────────────────────

    constructor(address _registry) {
        registry = _registry;
        operator = msg.sender;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CREDENTIAL HASHING — Leaf computation for Merkle tree
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Compute the Merkle leaf hash for a full credential.
    function computeCredentialHash(
        address user,
        string calldata playerName,
        uint256 overallElo,
        uint256 percentile,
        uint256 totalMatches
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(user, playerName, overallElo, percentile, totalMatches));
    }

    /// @notice Compute the Merkle leaf hash for a threshold proof.
    ///         The operator commits `meetsThreshold` when building the tree.
    function computeThresholdHash(
        address user,
        uint256 eloThreshold,
        bool meetsThreshold
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(user, eloThreshold, meetsThreshold));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MERKLE ROOT MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Directly set a new Merkle root. Operator only.
    function updateMerkleRoot(bytes32 newRoot) external {
        require(msg.sender == operator, "Only operator");
        bytes32 oldRoot = credentialMerkleRoot;
        credentialMerkleRoot = newRoot;
        emit MerkleRootUpdated(oldRoot, newRoot);
    }

    /// @notice Build a Merkle tree from Registry credentials and set the root.
    ///         NOTE: On-chain tree building is expensive — fine for hackathon demos.
    function updateMerkleRootFromRegistry(address[] calldata users) external {
        require(msg.sender == operator, "Only operator");

        bytes32[] memory leaves = new bytes32[](users.length);
        ISkillProofRegistryV reg = ISkillProofRegistryV(registry);

        for (uint256 i = 0; i < users.length; i++) {
            ISkillProofRegistryV.SkillCredential memory cred = reg.getCredential(users[i]);
            leaves[i] = keccak256(abi.encodePacked(
                users[i], cred.playerName, cred.overallElo, cred.percentile, cred.totalMatches
            ));
        }

        bytes32 oldRoot = credentialMerkleRoot;
        credentialMerkleRoot = _buildMerkleRoot(leaves);
        emit MerkleRootUpdated(oldRoot, credentialMerkleRoot);
    }

    /// @notice Build a Merkle tree from credentials + threshold leaves and set root.
    ///         For each user, includes a credential leaf plus threshold leaves for
    ///         each provided threshold the user meets.
    function updateMerkleRootWithThresholds(
        address[] calldata users,
        uint256[] calldata thresholds
    ) external {
        require(msg.sender == operator, "Only operator");

        ISkillProofRegistryV reg = ISkillProofRegistryV(registry);

        // Worst case: 1 credential leaf + N threshold leaves per user
        uint256 maxLeaves = users.length * (1 + thresholds.length);
        bytes32[] memory allLeaves = new bytes32[](maxLeaves);
        uint256 leafCount = 0;

        for (uint256 i = 0; i < users.length; i++) {
            ISkillProofRegistryV.SkillCredential memory cred = reg.getCredential(users[i]);

            // Credential leaf
            allLeaves[leafCount++] = keccak256(abi.encodePacked(
                users[i], cred.playerName, cred.overallElo, cred.percentile, cred.totalMatches
            ));

            // Threshold leaves — only for thresholds the user meets
            for (uint256 j = 0; j < thresholds.length; j++) {
                if (cred.overallElo >= thresholds[j]) {
                    allLeaves[leafCount++] = keccak256(abi.encodePacked(
                        users[i], thresholds[j], true
                    ));
                }
            }
        }

        // Trim to actual count
        bytes32[] memory leaves = new bytes32[](leafCount);
        for (uint256 k = 0; k < leafCount; k++) {
            leaves[k] = allLeaves[k];
        }

        bytes32 oldRoot = credentialMerkleRoot;
        credentialMerkleRoot = _buildMerkleRoot(leaves);
        emit MerkleRootUpdated(oldRoot, credentialMerkleRoot);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MERKLE PROOF VERIFICATION
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Verify a Merkle proof for a credential leaf (view, no state change).
    function verifyCredentialProof(
        bytes32 leaf,
        bytes32[] calldata proof,
        uint256 /* index */
    ) public view returns (bool) {
        return _verifyProof(leaf, proof, credentialMerkleRoot);
    }

    /// @notice Verify a proof and record it to prevent replay.
    function verifyAndRecord(bytes32 leaf, bytes32[] calldata proof) external returns (bool) {
        bytes32 proofHash = keccak256(abi.encodePacked(leaf, msg.sender));
        require(!usedProofs[proofHash], "Proof already used");
        require(_verifyProof(leaf, proof, credentialMerkleRoot), "Invalid proof");

        usedProofs[proofHash] = true;
        verificationCount++;
        emit CredentialVerified(msg.sender, leaf);
        return true;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // THRESHOLD PROOFS — Privacy-preserving "ELO >= X" verification
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Prove that `user` has ELO >= `eloThreshold` without revealing exact ELO.
    ///         The threshold leaf was committed by the operator when the tree was built.
    function verifyThresholdProof(
        address user,
        uint256 eloThreshold,
        bytes32[] calldata proof
    ) external returns (bool) {
        bytes32 leaf = computeThresholdHash(user, eloThreshold, true);
        require(_verifyProof(leaf, proof, credentialMerkleRoot), "Invalid threshold proof");

        verifiedAboveThreshold[user] = true;
        emit ThresholdVerified(user, eloThreshold);
        return true;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    function getMerkleRoot() external view returns (bytes32) {
        return credentialMerkleRoot;
    }

    function isProofUsed(bytes32 proofHash) external view returns (bool) {
        return usedProofs[proofHash];
    }

    function isVerifiedAboveThreshold(address user) external view returns (bool) {
        return verifiedAboveThreshold[user];
    }

    function getVerificationCount() external view returns (uint256) {
        return verificationCount;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // INTERNAL — Merkle tree primitives
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Verify a Merkle proof using canonical (sorted) pair hashing.
    function _verifyProof(
        bytes32 leaf,
        bytes32[] calldata proof,
        bytes32 root
    ) internal pure returns (bool) {
        bytes32 computedHash = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            if (computedHash <= proof[i]) {
                computedHash = keccak256(abi.encodePacked(computedHash, proof[i]));
            } else {
                computedHash = keccak256(abi.encodePacked(proof[i], computedHash));
            }
        }
        return computedHash == root;
    }

    /// @notice Build a Merkle root from an array of leaves.
    ///         Pads to the next power of 2 and uses canonical pair ordering.
    function _buildMerkleRoot(bytes32[] memory leaves) internal pure returns (bytes32) {
        require(leaves.length > 0, "No leaves");

        // Pad to next power of 2
        uint256 n = leaves.length;
        uint256 layerSize = 1;
        while (layerSize < n) layerSize *= 2;

        bytes32[] memory layer = new bytes32[](layerSize);
        for (uint256 i = 0; i < n; i++) layer[i] = leaves[i];
        for (uint256 i = n; i < layerSize; i++) layer[i] = bytes32(0);

        // Reduce layer by layer
        while (layerSize > 1) {
            for (uint256 i = 0; i < layerSize / 2; i++) {
                if (layer[2 * i] <= layer[2 * i + 1]) {
                    layer[i] = keccak256(abi.encodePacked(layer[2 * i], layer[2 * i + 1]));
                } else {
                    layer[i] = keccak256(abi.encodePacked(layer[2 * i + 1], layer[2 * i]));
                }
            }
            layerSize /= 2;
        }

        return layer[0];
    }
}
