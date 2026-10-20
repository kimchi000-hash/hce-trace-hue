// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Xac minh bang chung Merkle. Cap nut duoc sap xep nen tuong thich OpenZeppelin MerkleProof.
library MerkleProof {
    function verify(bytes32[] calldata proof, bytes32 root, bytes32 leaf) internal pure returns (bool) {
        bytes32 h = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 p = proof[i];
            h = h <= p ? keccak256(abi.encodePacked(h, p)) : keccak256(abi.encodePacked(p, h));
        }
        return h == root;
    }
}

/**
 * @title ProjectCore - Bau cu kin tren chuoi (commit-reveal)
 * @notice Deploy mot lan, tao nhieu cuoc bau cu. Moi cuoc bau cu co:
 *  - Danh sach cu tri duoc cam ket bang Merkle root (cu tri nop bang chung khi bo phieu).
 *  - Nhieu nguoi duyet doc lap; du so chu ky duyet thi cuoc bau cu moi duoc kich hoat.
 *  - Bo phieu 2 pha: gui phieu kin (hash) roi mo phieu; ket qua co kiem tra quorum va hoa phieu.
 * @dev Khong co chu so huu toan cuc; moi cuoc bau cu do nguoi tao quan ly va khong the sua sau khi tao.
 *      Phieu chi kin trong luc bo phieu: sau khi mo phieu, ai cung doc duoc su kien Revealed.
 */
contract ProjectCore {
    // ------------------------------------------------------------------ Types
    enum Phase { Registration, Commit, Reveal, Ended }

    /// @dev Tham so tao cuoc bau cu. Dung struct de tranh loi "stack too deep" khi co nhieu tham so.
    struct NewElection {
        string title;
        string[] names;
        uint256 regMinutes;       // thoi gian cho nguoi duyet
        uint256 commitMinutes;    // thoi gian gui phieu kin
        uint256 revealMinutes;    // thoi gian mo phieu
        uint256 quorumBps;        // 5000 = 50% cu tri phai mo phieu
        uint256 voterCount;       // so cu tri khai bao, doi chieu duoc voi danh sach cong bo
        bytes32 merkleRoot;       // goc Merkle cua danh sach dia chi cu tri
        address[] approvers;
        uint256 requiredApprovals;
    }

    struct Election {
        address admin;
        string title;
        uint256 regEnd;
        uint256 commitEnd;
        uint256 revealEnd;
        uint256 quorumBps;
        uint256 voterCount;
        uint256 revealedCount;
        bytes32 merkleRoot;
        uint256 requiredApprovals;
        uint256 approvalCount;
        bool isActivated;
        string[] candidates;
        uint256[] votes;
    }

    // -------------------------------------------------------------- Constants
    uint256 public constant MAX_CANDIDATES = 20;
    uint256 public constant MAX_APPROVERS = 10;
    uint256 public constant MAX_TITLE_BYTES = 120;
    uint256 public constant MAX_NAME_BYTES = 64;
    uint256 private constant BPS = 10_000;

    // ---------------------------------------------------------------- Storage
    uint256 public electionCount;
    mapping(uint256 => Election) private _elections;
    mapping(uint256 => address[]) private _approvers;
    mapping(uint256 => mapping(address => bool)) public isApprover;
    mapping(uint256 => mapping(address => bool)) public hasApproved;
    mapping(uint256 => mapping(address => bytes32)) public commitments;
    mapping(uint256 => mapping(address => bool)) public hasRevealed;

    // ----------------------------------------------------------------- Events
    event ElectionCreated(uint256 indexed id, address indexed admin, string title);
    event ElectionApproved(uint256 indexed id, address indexed approver);
    event ElectionActivated(uint256 indexed id);
    event Committed(uint256 indexed id, address indexed voter);
    event Revealed(uint256 indexed id, address indexed voter, uint256 indexed candidateId);

    // ----------------------------------------------------------------- Errors
    error ElectionNotFound();
    error WrongPhase(Phase current);
    error InvalidParams();
    error NotApprover();
    error AlreadyApproved();
    error ElectionNotActive();
    error InvalidProof();
    error AlreadyCommitted();
    error NoCommitment();
    error AlreadyRevealed();
    error InvalidCandidate();
    error BadReveal();

    // -------------------------------------------------------------- Modifiers
    modifier inPhase(uint256 id, Phase expected) {
        Phase current = phase(id);
        if (current != expected) revert WrongPhase(current);
        _;
    }

    // ------------------------------------------------------ Tao cuoc bau cu
    /// @notice Tao cuoc bau cu moi. Nguoi goi tro thanh nguoi to chuc (admin) cua cuoc bau cu do.
    function createElection(NewElection calldata p) external returns (uint256 id) {
        _validate(p);

        id = electionCount++;
        Election storage e = _elections[id];
        e.admin = msg.sender;
        e.title = p.title;
        e.regEnd = block.timestamp + p.regMinutes * 1 minutes;
        e.commitEnd = e.regEnd + p.commitMinutes * 1 minutes;
        e.revealEnd = e.commitEnd + p.revealMinutes * 1 minutes;
        e.quorumBps = p.quorumBps;
        e.voterCount = p.voterCount;
        e.merkleRoot = p.merkleRoot;
        e.requiredApprovals = p.requiredApprovals;

        for (uint256 i = 0; i < p.names.length; i++) {
            e.candidates.push(p.names[i]);
            e.votes.push(0);
        }
        _setApprovers(id, p.approvers);

        emit ElectionCreated(id, msg.sender, p.title);
    }

    function _validate(NewElection calldata p) private pure {
        uint256 titleLen = bytes(p.title).length;
        if (titleLen == 0 || titleLen > MAX_TITLE_BYTES) revert InvalidParams();

        uint256 n = p.names.length;
        if (n < 2 || n > MAX_CANDIDATES) revert InvalidParams();
        for (uint256 i = 0; i < n; i++) {
            uint256 len = bytes(p.names[i]).length;
            if (len == 0 || len > MAX_NAME_BYTES) revert InvalidParams();
        }

        if (p.regMinutes == 0 || p.commitMinutes == 0 || p.revealMinutes == 0) revert InvalidParams();
        if (p.quorumBps > BPS || p.voterCount == 0 || p.merkleRoot == bytes32(0)) revert InvalidParams();

        uint256 a = p.approvers.length;
        if (a == 0 || a > MAX_APPROVERS) revert InvalidParams();
        if (p.requiredApprovals == 0 || p.requiredApprovals > a) revert InvalidParams();
    }

    /// @dev Nguoi duyet phai doc lap voi nguoi tao, khac 0 va khong trung nhau.
    function _setApprovers(uint256 id, address[] calldata list) private {
        for (uint256 i = 0; i < list.length; i++) {
            address ap = list[i];
            if (ap == address(0) || ap == msg.sender || isApprover[id][ap]) revert InvalidParams();
            isApprover[id][ap] = true;
            _approvers[id].push(ap);
        }
    }

    // --------------------------------------------------------------- Duyet
    /// @notice Nguoi duyet ky duyet. Chi duoc duyet trong giai doan Registration (han chot co dinh).
    function approveElection(uint256 id) external inPhase(id, Phase.Registration) {
        if (!isApprover[id][msg.sender]) revert NotApprover();
        if (hasApproved[id][msg.sender]) revert AlreadyApproved();

        Election storage e = _elections[id];
        hasApproved[id][msg.sender] = true;
        e.approvalCount++;
        emit ElectionApproved(id, msg.sender);

        if (!e.isActivated && e.approvalCount >= e.requiredApprovals) {
            e.isActivated = true;
            emit ElectionActivated(id);
        }
    }

    // ------------------------------------------------------------- Bo phieu
    /// @param commitment keccak256(abi.encodePacked(id, candidateId, salt, voter))
    /// @param merkleProof bang chung dia chi nguoi goi nam trong danh sach cu tri
    function commit(uint256 id, bytes32 commitment, bytes32[] calldata merkleProof)
        external
        inPhase(id, Phase.Commit)
    {
        Election storage e = _elections[id];
        if (!e.isActivated) revert ElectionNotActive();
        if (!MerkleProof.verify(merkleProof, e.merkleRoot, keccak256(abi.encodePacked(msg.sender)))) {
            revert InvalidProof();
        }
        if (commitment == bytes32(0)) revert InvalidParams();
        if (commitments[id][msg.sender] != bytes32(0)) revert AlreadyCommitted();

        commitments[id][msg.sender] = commitment;
        emit Committed(id, msg.sender);
    }

    function reveal(uint256 id, uint256 candidateId, string calldata salt)
        external
        inPhase(id, Phase.Reveal)
    {
        Election storage e = _elections[id];
        bytes32 c = commitments[id][msg.sender];
        if (c == bytes32(0)) revert NoCommitment();
        if (hasRevealed[id][msg.sender]) revert AlreadyRevealed();
        if (candidateId >= e.candidates.length) revert InvalidCandidate();
        if (keccak256(abi.encodePacked(id, candidateId, salt, msg.sender)) != c) revert BadReveal();

        // Effects truoc, khong co tuong tac ben ngoai
        hasRevealed[id][msg.sender] = true;
        e.votes[candidateId] += 1;
        e.revealedCount += 1;
        emit Revealed(id, msg.sender, candidateId);
    }

    // ---------------------------------------------------------------- Views
    function phase(uint256 id) public view returns (Phase) {
        Election storage e = _get(id);
        if (block.timestamp <= e.regEnd) return Phase.Registration;
        if (block.timestamp <= e.commitEnd) return Phase.Commit;
        return block.timestamp <= e.revealEnd ? Phase.Reveal : Phase.Ended;
    }

    /// @return valid chi true khi dat quorum va co dung mot nguoi dan dau (khong hoa)
    function result(uint256 id)
        external
        view
        inPhase(id, Phase.Ended)
        returns (bool valid, uint256 winnerId, uint256 topVotes)
    {
        Election storage e = _elections[id];
        if (e.revealedCount * BPS < e.voterCount * e.quorumBps) return (false, 0, 0);

        uint256 tied;
        for (uint256 i = 0; i < e.votes.length; i++) {
            uint256 v = e.votes[i];
            if (v > topVotes) { topVotes = v; winnerId = i; tied = 1; }
            else if (v == topVotes) { tied++; }
        }
        valid = (tied == 1 && topVotes > 0);
    }

    function getElectionBasicInfo(uint256 id)
        external
        view
        returns (address admin, string memory title, bool isActivated, bytes32 merkleRoot)
    {
        Election storage e = _get(id);
        return (e.admin, e.title, e.isActivated, e.merkleRoot);
    }

    function getElectionStats(uint256 id)
        external
        view
        returns (
            uint256 regEnd, uint256 commitEnd, uint256 revealEnd, uint256 quorumBps,
            uint256 voterCount, uint256 revealedCount, uint256 requiredApprovals, uint256 approvalCount
        )
    {
        Election storage e = _get(id);
        return (
            e.regEnd, e.commitEnd, e.revealEnd, e.quorumBps,
            e.voterCount, e.revealedCount, e.requiredApprovals, e.approvalCount
        );
    }

    function getCandidates(uint256 id) external view returns (string[] memory) {
        return _get(id).candidates;
    }

    function getVotes(uint256 id) external view returns (uint256[] memory) {
        return _get(id).votes;
    }

    function getApprovers(uint256 id) external view returns (address[] memory) {
        _get(id);
        return _approvers[id];
    }

    function getVoterStatus(uint256 id, address voter) external view returns (bool committed, bool revealed) {
        _get(id);
        return (commitments[id][voter] != bytes32(0), hasRevealed[id][voter]);
    }

    // ------------------------------------------------------------- Internal
    function _get(uint256 id) private view returns (Election storage) {
        if (id >= electionCount) revert ElectionNotFound();
        return _elections[id];
    }
}
