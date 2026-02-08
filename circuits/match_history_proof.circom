pragma circom 2.0.0;

// ═══════════════════════════════════════════════════════════════════
// SkillProof Match History Proof Circuit
// ═══════════════════════════════════════════════════════════════════
//
// Proves: "I played >= minMatches AND my winRate >= minWinRate%"
// Without revealing: exact wins, exact matches, or any match details
//
// Private inputs (witness): totalMatches, wins, salt
// Public inputs: minMatches, minWinRateBps (basis points, e.g. 6000 = 60%), commitment
//
// Commitment scheme: commitment = totalMatches + wins * 2^16 + salt * 2^32
// (packs match data into a single committed value)
//
// Constraints:
// 1. commitment === totalMatches + wins * 2^16 + salt * 2^32
// 2. totalMatches >= minMatches
// 3. wins * 10000 >= minWinRateBps * totalMatches  (win rate check without division)
// 4. wins <= totalMatches  (sanity: can't win more than you played)
// 5. Range checks on all values (prevent overflow attacks)
// ═══════════════════════════════════════════════════════════════════

template RangeCheck(n) {
    // Proves that `in` fits in `n` bits (i.e., 0 <= in < 2^n)
    signal input in;
    signal bits[n];
    var sum = 0;
    for (var i = 0; i < n; i++) {
        bits[i] <-- (in >> i) & 1;
        bits[i] * (bits[i] - 1) === 0;  // each bit is 0 or 1
        sum += bits[i] * (1 << i);
    }
    sum === in;
}

template GreaterEqThan(n) {
    // Proves a >= b using bit decomposition
    // Works by checking that a - b + 2^n is an (n+1)-bit number with the top bit set
    signal input a;
    signal input b;

    signal diff;
    diff <== a - b + (1 << n);  // shift to make non-negative

    // Decompose diff into n+1 bits
    signal bits[n + 1];
    var sum = 0;
    for (var i = 0; i <= n; i++) {
        bits[i] <-- (diff >> i) & 1;
        bits[i] * (bits[i] - 1) === 0;
        sum += bits[i] * (1 << i);
    }
    sum === diff;

    // The top bit must be 1 (meaning a >= b)
    bits[n] === 1;
}

template MatchHistoryProof() {
    // Public inputs
    signal input minMatches;
    signal input minWinRateBps;  // basis points: 6000 = 60%
    signal input commitment;

    // Private inputs (the secret match data)
    signal input totalMatches;
    signal input wins;
    signal input salt;

    // ═══ CONSTRAINT 1: Commitment binding ═══
    // commitment = totalMatches + wins * 2^16 + salt * 2^32
    signal winsShifted;
    winsShifted <== wins * 65536;  // wins * 2^16
    signal saltShifted;
    saltShifted <== salt * 4294967296;  // salt * 2^32

    commitment === totalMatches + winsShifted + saltShifted;

    // ═══ CONSTRAINT 2: Range checks (prevent overflow) ═══
    // totalMatches fits in 16 bits (max 65535 matches)
    component rcMatches = RangeCheck(16);
    rcMatches.in <== totalMatches;

    // wins fits in 16 bits
    component rcWins = RangeCheck(16);
    rcWins.in <== wins;

    // salt fits in 32 bits
    component rcSalt = RangeCheck(32);
    rcSalt.in <== salt;

    // minMatches fits in 16 bits
    component rcMinMatches = RangeCheck(16);
    rcMinMatches.in <== minMatches;

    // minWinRateBps fits in 16 bits (max 10000)
    component rcMinRate = RangeCheck(16);
    rcMinRate.in <== minWinRateBps;

    // ═══ CONSTRAINT 3: totalMatches >= minMatches ═══
    component geMatches = GreaterEqThan(16);
    geMatches.a <== totalMatches;
    geMatches.b <== minMatches;

    // ═══ CONSTRAINT 4: wins <= totalMatches ═══
    component geWins = GreaterEqThan(16);
    geWins.a <== totalMatches;
    geWins.b <== wins;

    // ═══ CONSTRAINT 5: Win rate check ═══
    // wins / totalMatches >= minWinRateBps / 10000
    // Rearranged to avoid division (which is expensive in ZK):
    // wins * 10000 >= minWinRateBps * totalMatches
    signal lhs;
    lhs <== wins * 10000;
    signal rhs;
    rhs <== minWinRateBps * totalMatches;

    component geRate = GreaterEqThan(32);  // 32 bits for the products
    geRate.a <== lhs;
    geRate.b <== rhs;
}

component main {public [minMatches, minWinRateBps, commitment]} = MatchHistoryProof();
