pragma circom 2.0.0;

// Proves: "I know a secret ELO value that is >= a public threshold"
// Public inputs: threshold, credentialCommitment
// Private inputs: elo, salt

template ThresholdProof() {
    // Public inputs (known to verifier)
    signal input threshold;
    signal input credentialCommitment; // hash of the credential

    // Private inputs (known only to prover)
    signal input elo;
    signal input salt; // randomness for the commitment

    // Output
    signal output valid;

    // Constraint 1: elo >= threshold
    // We prove this by showing elo - threshold >= 0
    // Since circom works with field elements, we need to be careful
    // For a hackathon, we can use a simple range check
    signal diff;
    diff <== elo - threshold;

    // Ensure diff is in range [0, 2^32) — proves elo >= threshold
    // Simple bit decomposition range check
    signal bits[32];
    var bitsum = 0;
    for (var i = 0; i < 32; i++) {
        bits[i] <-- (diff >> i) & 1;
        bits[i] * (1 - bits[i]) === 0; // each bit is 0 or 1
        bitsum += bits[i] * (1 << i);
    }
    bitsum === diff; // reconstructed value matches

    // Constraint 2: credentialCommitment matches
    // This links the proof to a specific credential
    // commitment = elo + salt * 2^32
    signal computedCommitment;
    computedCommitment <== elo + salt * 4294967296; // salt shifted left by 32 bits
    credentialCommitment === computedCommitment;

    valid <== 1;
}

component main {public [threshold, credentialCommitment]} = ThresholdProof();
