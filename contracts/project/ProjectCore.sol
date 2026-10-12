// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Bau cu kin 2 pha (commit - reveal) co quorum
contract ProjectCore {
    enum Phase { Registration, Commit, Reveal, Ended }

    uint256 public constant MAX_CANDIDATES = 20;
    uint256 public constant MAX_BATCH = 200;

    address public admin;
    uint256 public regEnd;
    uint256 public commitEnd;
    uint256 public revealEnd;
    uint256 public quorumBps; // 5000 = 50% cu tri phai tiet lo phieu
    uint256 public voterCount;
    uint256 public revealedCount;

    string[] public candidates;
    uint256[] public votes;

    mapping(address => bool) public isVoter;
    mapping(address => bytes32) public commitments;
    mapping(address => bool) public hasRevealed;

    event VoterRegistered(address indexed voter);
    event Committed(address indexed voter);
    event Revealed(address indexed voter, uint256 indexed candidateId);

    error NotAdmin();
    error WrongPhase(Phase current);
    error NotEligible();
    error AlreadyCommitted();
    error NoCommitment();
    error AlreadyRevealed();
    error BadReveal();
    error InvalidCandidate();
    error InvalidParams();
    error BatchTooLarge();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier inPhase(Phase p) {
        Phase cur = phase();
        if (cur != p) revert WrongPhase(cur);
        _;
    }

    constructor(
        string[] memory names,
        uint256 regMinutes,
        uint256 commitMinutes,
        uint256 revealMinutes,
        uint256 _quorumBps
    ) {
        if (names.length < 2 || names.length > MAX_CANDIDATES) revert InvalidParams();
        if (_quorumBps > 10_000) revert InvalidParams();
        admin = msg.sender;
        regEnd = block.timestamp + regMinutes * 1 minutes;
        commitEnd = regEnd + commitMinutes * 1 minutes;
        revealEnd = commitEnd + revealMinutes * 1 minutes;
        quorumBps = _quorumBps;
        for (uint256 i = 0; i < names.length; i++) {
            candidates.push(names[i]);
            votes.push(0);
        }
    }

    function phase() public view returns (Phase) {
        if (block.timestamp <= regEnd) return Phase.Registration;
        if (block.timestamp <= commitEnd) return Phase.Commit;
        if (block.timestamp <= revealEnd) return Phase.Reveal;
        return Phase.Ended;
    }

    function registerVoters(address[] calldata voters)
        external onlyAdmin inPhase(Phase.Registration)
    {
        if (voters.length > MAX_BATCH) revert BatchTooLarge();
        for (uint256 i = 0; i < voters.length; i++) {
            address v = voters[i];
            if (v == address(0)) revert InvalidParams();
            if (isVoter[v]) continue; // tranh dem trung
            isVoter[v] = true;
            voterCount++;
            emit VoterRegistered(v);
        }
    }

    /// @param commitment keccak256(abi.encodePacked(candidateId, salt, voterAddress))
    function commit(bytes32 commitment) external inPhase(Phase.Commit) {
        if (!isVoter[msg.sender]) revert NotEligible();
        if (commitments[msg.sender] != bytes32(0)) revert AlreadyCommitted();
        if (commitment == bytes32(0)) revert InvalidParams();
        commitments[msg.sender] = commitment;
        emit Committed(msg.sender);
    }

    function reveal(uint256 candidateId, bytes32 salt) external inPhase(Phase.Reveal) {
        bytes32 c = commitments[msg.sender];
        if (c == bytes32(0)) revert NoCommitment();
        if (hasRevealed[msg.sender]) revert AlreadyRevealed();
        if (candidateId >= candidates.length) revert InvalidCandidate();
        if (keccak256(abi.encodePacked(candidateId, salt, msg.sender)) != c) revert BadReveal();

        hasRevealed[msg.sender] = true; // Effects truoc
        votes[candidateId] += 1;
        revealedCount += 1;
        emit Revealed(msg.sender, candidateId);
    }

    /// @return valid dat quorum va co nguoi thang duy nhat
    function result() external view inPhase(Phase.Ended)
        returns (bool valid, uint256 winnerId, uint256 topVotes)
    {
        if (revealedCount * 10_000 < voterCount * quorumBps) return (false, 0, 0);
        uint256 tied;
        for (uint256 i = 0; i < votes.length; i++) {
            if (votes[i] > topVotes) { topVotes = votes[i]; winnerId = i; tied = 1; }
            else if (votes[i] == topVotes) { tied++; }
        }
        valid = (tied == 1 && topVotes > 0);
    }

    function candidateCount() external view returns (uint256) {
        return candidates.length;
    }
}
