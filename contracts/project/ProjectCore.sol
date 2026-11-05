// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Xac minh bang chung Merkle. Cap nut duoc sap xep nen tuong thich OpenZeppelin MerkleProof.
library MerkleProof {
    function verify(bytes32[] calldata proof, bytes32 root, bytes32 leaf) internal pure returns (bool) {
        bytes32 h = leaf;
        uint256 n = proof.length; // doc do dai mot lan, khong doc lai moi vong lap
        for (uint256 i = 0; i < n; ) {
            bytes32 p = proof[i];
            h = h <= p ? keccak256(abi.encodePacked(h, p)) : keccak256(abi.encodePacked(p, h));
            unchecked { ++i; } // i < n nen khong the tran so
        }
        return h == root;
    }
}

/// @dev Phan ProjectCore can doc tu OrganizationRegistry.
interface IOrganizationRegistry {
    function isVerified(uint256 id) external view returns (bool);
    function canPropose(uint256 id, address who) external view returns (bool);
    function getApprovers(uint256 id) external view returns (address[] memory);
    function approvalThreshold(uint256 approverCount) external pure returns (uint256);
    function platformAdmin() external view returns (address);
}

/**
 * @title ProjectCore - Bau cu kin tren chuoi (commit-reveal) cho nhieu to chuc
 * @notice Deploy mot lan, tao nhieu cuoc bau cu. Moi cuoc bau cu thuoc MOT to chuc da duoc xac minh va co:
 *  - Danh sach cu tri duoc cam ket bang Merkle root (cu tri nop bang chung khi bo phieu).
 *  - Nhom nguoi duyet LAY TU to chuc (chup lai luc tao), nguong 2/3 lam tron len; khong ai tu duyet cuoc cua minh.
 *  - Bo phieu 2 pha: gui phieu kin (hash) roi mo phieu; ket qua co kiem tra quorum va hoa phieu.
 *  - Hash metadata (keccak256) cua cuoc bau cu va tung ung vien, co phien ban; noi dung nam ngoai chuoi.
 *  - Han muc yeu cau dang cho duyet theo vi va theo to chuc, yeu cau het han / bi rut / bi tu choi thi giai phong han muc.
 * @dev Logic bo phieu cot loi (commit, reveal, phase, result) khong doi so voi ban dau.
 *      Phieu chi kin trong luc bo phieu: sau khi mo phieu, ai cung doc duoc su kien Revealed.
 */
contract ProjectCore {
    // ------------------------------------------------------------------ Types
    enum Phase { Registration, Commit, Reveal, Ended }

    /// @dev Tham so tao cuoc bau cu. Dung struct de tranh loi "stack too deep" khi co nhieu tham so.
    struct NewElection {
        uint256 organizationId;   // to chuc (da Verified) so huu cuoc bau cu
        string title;
        string[] names;
        address[] candidateWallets; // tuy chon: vi cua ung vien (neu co) de loai khoi nhom duyet (xung dot loi ich)
        uint256 regMinutes;       // thoi gian cho nguoi duyet
        uint256 commitMinutes;    // thoi gian gui phieu kin
        uint256 revealMinutes;    // thoi gian mo phieu
        uint256 quorumBps;        // 5000 = 50% cu tri phai mo phieu
        uint256 voterCount;       // so cu tri khai bao, doi chieu duoc voi danh sach cong bo
        bytes32 merkleRoot;       // goc Merkle cua danh sach dia chi cu tri
        bytes32 metadataHash;     // keccak256 cua metadata cuoc bau cu (chuan hoa JSON, xem web/metadata)
        bytes32[] candidateMetadataHashes; // hash ho so tung ung vien, cung thu tu voi names
    }

    /// @dev Trang thai yeu cau tao cuoc bau cu (tinh tu co + thoi gian).
    enum RequestStatus { Pending, Approved, Rejected, Withdrawn, Expired }

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
        uint256 organizationId;
        uint256 createdAt;
        uint256 rejectCount;
        uint8 closedReason;       // 0 = dang mo, 1 = nguoi tao rut, 2 = bi tu choi
        uint256 metadataVersion;
    }

    // -------------------------------------------------------------- Constants
    uint256 public constant MAX_CANDIDATES = 20;
    uint256 public constant MAX_APPROVERS = 10;
    uint256 public constant MAX_TITLE_BYTES = 120;
    uint256 public constant MAX_NAME_BYTES = 64;
    uint256 public constant MAX_PHASE_MINUTES = 43_200; // moi pha toi da 30 ngay; chan tham so vo ly va tran so khi nhan voi 60
    uint256 public constant MAX_VOTERS = 1_000_000;     // chan voterCount vo ly: voterCount * quorumBps khong the tran so lam result() bi revert
    uint256 public constant MIN_APPROVERS = 2;
    uint256 private constant BPS = 10_000;
    /// @dev Gia tri danh dau "da mo phieu", ghi de len commitment sau khi reveal thanh cong.
    ///      Thay cho mapping bool rieng: tiet kiem mot lan ghi storage moi (~20.000 gas moi lan mo phieu).
    bytes32 private constant REVEALED = bytes32(type(uint256).max);

    // ---------------------------------------------------------------- Storage
    IOrganizationRegistry public immutable registry;
    /// @dev Cau hinh chong spam, chi platformAdmin doi duoc, trong khoang an toan (xem setLimits).
    uint256 public maxPendingPerWallet = 3;
    uint256 public maxPendingPerOrg = 10;
    uint256 public pendingTtl = 7 days;
    mapping(address => uint256[]) private _pendingByWallet;
    mapping(uint256 => uint256[]) private _pendingByOrg;
    mapping(uint256 => mapping(address => bool)) public hasRejected;
    mapping(uint256 => bytes32) private _metaHash;
    mapping(uint256 => mapping(uint256 => bytes32)) private _candMetaHash;
    mapping(uint256 => mapping(uint256 => uint256)) private _candMetaVersion;
    uint256 public electionCount;
    mapping(uint256 => Election) private _elections;
    mapping(uint256 => address[]) private _approvers;
    mapping(uint256 => mapping(address => bool)) public isApprover;
    mapping(uint256 => mapping(address => bool)) public hasApproved;
    mapping(uint256 => mapping(address => bytes32)) public commitments; // 0 = chua nop; REVEALED = da mo phieu

    // ----------------------------------------------------------------- Events
    event ElectionCreated(uint256 indexed id, address indexed admin, string title);
    event ElectionApproved(uint256 indexed id, address indexed approver);
    event ElectionActivated(uint256 indexed id);
    event ElectionProposed(uint256 indexed id, uint256 indexed organizationId, address indexed proposer, uint256 createdAt);
    event ApproverExcluded(uint256 indexed id, address indexed approver);
    event ElectionRejectionVote(uint256 indexed id, address indexed approver);
    event ElectionRejected(uint256 indexed id);
    event ElectionWithdrawn(uint256 indexed id);
    event RequestExpired(uint256 indexed id);
    event ApprovalsReset(uint256 indexed id);
    event ElectionMetadataSet(uint256 indexed id, uint256 version, bytes32 metadataHash);
    event CandidateMetadataSet(uint256 indexed id, uint256 indexed candidateId, uint256 version, bytes32 metadataHash);
    event LimitsUpdated(uint256 maxPendingPerWallet, uint256 maxPendingPerOrg, uint256 pendingTtl);
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
    error OrganizationNotVerified();
    error NotAuthorized();
    error NotEnoughApprovers();
    error PendingLimit();
    error RequestClosed();
    error RequestLocked();
    error AlreadyRejected();
    error MetadataLocked();
    error NotExpired();
    error NotPlatformAdmin();

    // -------------------------------------------------------------- Modifiers
    modifier inPhase(uint256 id, Phase expected) {
        Phase current = phase(id);
        if (current != expected) revert WrongPhase(current);
        _;
    }

    constructor(address registry_) {
        if (registry_ == address(0)) revert InvalidParams();
        registry = IOrganizationRegistry(registry_);
    }

    // ------------------------------------------------------ Tao cuoc bau cu
    /// @notice De xuat cuoc bau cu cua mot to chuc. Nguoi goi phai la Proposer/Manager cua to chuc Verified.
    ///         Nhom duyet va nguong duyet duoc lay tu to chuc, khong do nguoi tao tu chon.
    function createElection(NewElection calldata p) external returns (uint256 id) {
        _validate(p);
        if (!registry.isVerified(p.organizationId)) revert OrganizationNotVerified();
        if (!registry.canPropose(p.organizationId, msg.sender)) revert NotAuthorized();
        if (p.regMinutes * 1 minutes > pendingTtl) revert InvalidParams(); // yeu cau cho duyet het han khi het pha Registration

        id = electionCount++;
        Election storage e = _elections[id];
        e.organizationId = p.organizationId;
        e.createdAt = block.timestamp;
        e.metadataVersion = 1;
        e.admin = msg.sender;
        e.title = p.title;
        e.regEnd = block.timestamp + p.regMinutes * 1 minutes;
        e.commitEnd = e.regEnd + p.commitMinutes * 1 minutes;
        e.revealEnd = e.commitEnd + p.revealMinutes * 1 minutes;
        e.quorumBps = p.quorumBps;
        e.voterCount = p.voterCount;
        e.merkleRoot = p.merkleRoot;

        uint256 n = p.names.length;
        for (uint256 i = 0; i < n; ) {
            e.candidates.push(p.names[i]);
            e.votes.push(0);
            unchecked { ++i; }
        }
        _snapshotApprovers(id, e, p);
        _recordMetadata(id, p);
        _enqueue(id, e);

        emit ElectionCreated(id, msg.sender, p.title);
        emit ElectionProposed(id, p.organizationId, msg.sender, block.timestamp);
    }

    function _validate(NewElection calldata p) private pure {
        uint256 titleLen = bytes(p.title).length;
        if (titleLen == 0 || titleLen > MAX_TITLE_BYTES) revert InvalidParams();

        uint256 n = p.names.length;
        if (n < 2 || n > MAX_CANDIDATES) revert InvalidParams();
        for (uint256 i = 0; i < n; ) {
            uint256 len = bytes(p.names[i]).length;
            if (len == 0 || len > MAX_NAME_BYTES) revert InvalidParams();
            unchecked { ++i; }
        }

        if (p.regMinutes == 0 || p.commitMinutes == 0 || p.revealMinutes == 0) revert InvalidParams();
        if (
            p.regMinutes > MAX_PHASE_MINUTES ||
            p.commitMinutes > MAX_PHASE_MINUTES ||
            p.revealMinutes > MAX_PHASE_MINUTES
        ) revert InvalidParams();
        if (p.quorumBps > BPS || p.voterCount == 0 || p.voterCount > MAX_VOTERS || p.merkleRoot == bytes32(0)) {
            revert InvalidParams();
        }

        if (p.metadataHash == bytes32(0) || p.candidateMetadataHashes.length != n) revert InvalidParams();
        for (uint256 i = 0; i < n; ) {
            if (p.candidateMetadataHashes[i] == bytes32(0)) revert InvalidParams();
            unchecked { ++i; }
        }
        if (p.candidateWallets.length > n) revert InvalidParams();
    }

    /// @dev Chup nhom duyet cua to chuc. Loai nguoi tao (khong tu duyet) va dai dien duoc khai bao la ung vien
    ///      (xung dot loi ich). Con lai phai >= MIN_APPROVERS; nguong = 2/3 lam tron len tren so con lai.
    function _snapshotApprovers(uint256 id, Election storage e, NewElection calldata p) private {
        address[] memory list = registry.getApprovers(p.organizationId);
        uint256 total = list.length;
        for (uint256 i = 0; i < total; ) {
            address ap = list[i];
            bool conflict = ap == msg.sender;
            for (uint256 j = 0; !conflict && j < p.candidateWallets.length; ) {
                conflict = p.candidateWallets[j] == ap;
                unchecked { ++j; }
            }
            if (conflict) {
                emit ApproverExcluded(id, ap);
            } else {
                isApprover[id][ap] = true;
                _approvers[id].push(ap);
            }
            unchecked { ++i; }
        }
        uint256 eligible = _approvers[id].length;
        if (eligible < MIN_APPROVERS) revert NotEnoughApprovers();
        e.requiredApprovals = registry.approvalThreshold(eligible);
    }

    function _recordMetadata(uint256 id, NewElection calldata p) private {
        _metaHash[id] = p.metadataHash;
        emit ElectionMetadataSet(id, 1, p.metadataHash);
        uint256 n = p.candidateMetadataHashes.length;
        for (uint256 i = 0; i < n; ) {
            _candMetaHash[id][i] = p.candidateMetadataHashes[i];
            _candMetaVersion[id][i] = 1;
            emit CandidateMetadataSet(id, i, 1, p.candidateMetadataHashes[i]);
            unchecked { ++i; }
        }
    }

    // --------------------------------------------------------------- Duyet
    /// @notice Nguoi duyet ky duyet. Chi duoc duyet trong giai doan Registration (han chot co dinh).
    function approveElection(uint256 id) external inPhase(id, Phase.Registration) {
        if (!isApprover[id][msg.sender]) revert NotApprover();
        if (hasApproved[id][msg.sender]) revert AlreadyApproved();

        if (hasRejected[id][msg.sender]) revert AlreadyRejected();

        Election storage e = _elections[id];
        if (e.closedReason != 0) revert RequestClosed();
        hasApproved[id][msg.sender] = true;
        e.approvalCount++;
        emit ElectionApproved(id, msg.sender);

        if (!e.isActivated && e.approvalCount >= e.requiredApprovals) {
            e.isActivated = true;
            _dequeue(id, e);
            emit ElectionActivated(id);
        }
    }

    /// @notice Nguoi duyet bieu quyet tu choi. Khi so phieu tu choi lam cho khong the dat nguong thi yeu cau bi dong.
    function rejectElection(uint256 id) external inPhase(id, Phase.Registration) {
        if (!isApprover[id][msg.sender]) revert NotApprover();
        if (hasApproved[id][msg.sender] || hasRejected[id][msg.sender]) revert AlreadyRejected();
        Election storage e = _elections[id];
        if (e.closedReason != 0 || e.isActivated) revert RequestClosed();

        hasRejected[id][msg.sender] = true;
        e.rejectCount++;
        emit ElectionRejectionVote(id, msg.sender);
        if (e.rejectCount > _approvers[id].length - e.requiredApprovals) {
            e.closedReason = 2;
            _dequeue(id, e);
            emit ElectionRejected(id);
        }
    }

    /// @notice Nguoi tao rut yeu cau khi chua co chu ky duyet / tu choi nao (chua bi khoa boi quy trinh duyet).
    function withdrawElection(uint256 id) external {
        Election storage e = _get(id);
        if (msg.sender != e.admin) revert NotAuthorized();
        if (e.closedReason != 0 || e.isActivated) revert RequestClosed();
        if (e.approvalCount != 0 || e.rejectCount != 0) revert RequestLocked();
        e.closedReason = 1;
        _dequeue(id, e);
        emit ElectionWithdrawn(id);
    }

    /// @notice Bat ky ai cung goi duoc de giai phong han muc cua yeu cau da het han ma khong du chu ky.
    function releaseExpired(uint256 id) external {
        Election storage e = _get(id);
        if (e.isActivated || e.closedReason != 0 || block.timestamp <= e.regEnd) revert NotExpired();
        _dequeue(id, e);
        emit RequestExpired(id);
    }

    // ----------------------------------------------------- Metadata hash
    /// @notice Cap nhat hash metadata cuoc bau cu. Chi nguoi tao, chi trong pha Registration (truoc Commit).
    ///         Neu da co chu ky duyet thi bi dat lai va phai duyet lai.
    function updateElectionMetadata(uint256 id, bytes32 newHash) external {
        Election storage e = _editable(id);
        if (newHash == bytes32(0) || newHash == _metaHash[id]) revert InvalidParams();
        _metaHash[id] = newHash;
        e.metadataVersion++;
        emit ElectionMetadataSet(id, e.metadataVersion, newHash);
        _resetApprovals(id, e);
    }

    function updateCandidateMetadata(uint256 id, uint256 candidateId, bytes32 newHash) external {
        Election storage e = _editable(id);
        if (candidateId >= e.candidates.length) revert InvalidCandidate();
        if (newHash == bytes32(0) || newHash == _candMetaHash[id][candidateId]) revert InvalidParams();
        _candMetaHash[id][candidateId] = newHash;
        uint256 v = ++_candMetaVersion[id][candidateId];
        emit CandidateMetadataSet(id, candidateId, v, newHash);
        _resetApprovals(id, e);
    }

    // ------------------------------------------------------ Chong spam
    /// @notice Chinh han muc chong spam (chi quan tri vien nen tang), trong khoang an toan.
    function setLimits(uint256 perWallet, uint256 perOrg, uint256 ttl) external {
        if (msg.sender != registry.platformAdmin()) revert NotPlatformAdmin();
        if (perWallet == 0 || perWallet > 50 || perOrg == 0 || perOrg > 200) revert InvalidParams();
        if (ttl < 1 hours || ttl > MAX_PHASE_MINUTES * 1 minutes) revert InvalidParams();
        maxPendingPerWallet = perWallet;
        maxPendingPerOrg = perOrg;
        pendingTtl = ttl;
        emit LimitsUpdated(perWallet, perOrg, ttl);
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
        if (commitment == bytes32(0) || commitment == REVEALED) revert InvalidParams();
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
        if (c == REVEALED) revert AlreadyRevealed();
        if (candidateId >= e.candidates.length) revert InvalidCandidate();
        if (keccak256(abi.encodePacked(id, candidateId, salt, msg.sender)) != c) revert BadReveal();

        // Effects truoc, khong co tuong tac ben ngoai
        commitments[id][msg.sender] = REVEALED;
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
        uint256[] memory votes_ = e.votes; // doc ca mang tu storage mot lan (toi da 20 phan tu)
        uint256 n = votes_.length;
        for (uint256 i = 0; i < n; ) {
            uint256 v = votes_[i];
            if (v > topVotes) { topVotes = v; winnerId = i; tied = 1; }
            else if (v == topVotes) { tied++; }
            unchecked { ++i; }
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

    /// @return true neu cu tri da mo phieu thanh cong (giu nguyen chu ky ham cu `hasRevealed(id, voter)`)
    function hasRevealed(uint256 id, address voter) public view returns (bool) {
        return commitments[id][voter] == REVEALED;
    }

    function getVoterStatus(uint256 id, address voter) external view returns (bool committed, bool revealed) {
        _get(id);
        return (commitments[id][voter] != bytes32(0), hasRevealed(id, voter));
    }

    // -------------------------------------------------- Views to chuc / metadata
    function requestStatus(uint256 id) public view returns (RequestStatus) {
        Election storage e = _get(id);
        if (e.closedReason == 1) return RequestStatus.Withdrawn;
        if (e.closedReason == 2) return RequestStatus.Rejected;
        if (e.isActivated) return RequestStatus.Approved;
        return block.timestamp > e.regEnd ? RequestStatus.Expired : RequestStatus.Pending;
    }

    function getElectionOrg(uint256 id)
        external
        view
        returns (uint256 organizationId, uint256 createdAt, RequestStatus status, uint256 rejectCount, bytes32 metadataHash, uint256 metadataVersion)
    {
        Election storage e = _get(id);
        return (e.organizationId, e.createdAt, requestStatus(id), e.rejectCount, _metaHash[id], e.metadataVersion);
    }

    function getCandidateMetadata(uint256 id, uint256 candidateId) external view returns (bytes32 metadataHash, uint256 version) {
        Election storage e = _get(id);
        if (candidateId >= e.candidates.length) revert InvalidCandidate();
        return (_candMetaHash[id][candidateId], _candMetaVersion[id][candidateId]);
    }

    /// @return so yeu cau CON HIEU LUC (chua het han, chua bi dong) cua mot vi; khong dem yeu cau da het han du chua duoc don.
    function pendingCountOfWallet(address who) external view returns (uint256) {
        return _livePending(_pendingByWallet[who]);
    }

    function pendingCountOfOrg(uint256 organizationId) external view returns (uint256) {
        return _livePending(_pendingByOrg[organizationId]);
    }

    // ------------------------------------------------------------- Internal
    function _editable(uint256 id) private view returns (Election storage e) {
        e = _get(id);
        if (msg.sender != e.admin) revert NotAuthorized();
        if (e.closedReason != 0) revert RequestClosed();
        if (phase(id) != Phase.Registration) revert MetadataLocked();
    }

    /// @dev Metadata doi sau khi da co chu ky: xoa het chu ky/phieu tu choi, nhom duyet phai duyet lai.
    function _resetApprovals(uint256 id, Election storage e) private {
        if (e.approvalCount == 0 && e.rejectCount == 0 && !e.isActivated) return;
        address[] storage list = _approvers[id];
        uint256 n = list.length;
        for (uint256 i = 0; i < n; ) {
            hasApproved[id][list[i]] = false;
            hasRejected[id][list[i]] = false;
            unchecked { ++i; }
        }
        bool wasActive = e.isActivated;
        e.approvalCount = 0;
        e.rejectCount = 0;
        e.isActivated = false;
        if (wasActive) _enqueue(id, e); // quay lai hang cho duyet thi lai chiem han muc
        emit ApprovalsReset(id);
    }

    function _isPending(Election storage e) private view returns (bool) {
        return !e.isActivated && e.closedReason == 0 && block.timestamp <= e.regEnd;
    }

    function _livePending(uint256[] storage list) private view returns (uint256 c) {
        uint256 n = list.length;
        for (uint256 i = 0; i < n; ) {
            if (_isPending(_elections[list[i]])) c++;
            unchecked { ++i; }
        }
    }

    /// @dev Don cac yeu cau khong con cho duyet (het han / da duyet / bi dong) roi moi kiem tra han muc.
    ///      Vong lap bi chan boi chinh han muc (toi da maxPending... phan tu).
    function _sweep(uint256[] storage list) private {
        uint256 i = 0;
        while (i < list.length) {
            if (_isPending(_elections[list[i]])) { i++; }
            else { list[i] = list[list.length - 1]; list.pop(); }
        }
    }

    function _enqueue(uint256 id, Election storage e) private {
        uint256[] storage byWallet = _pendingByWallet[e.admin];
        uint256[] storage byOrg = _pendingByOrg[e.organizationId];
        _sweep(byWallet);
        _sweep(byOrg);
        if (byWallet.length >= maxPendingPerWallet || byOrg.length >= maxPendingPerOrg) revert PendingLimit();
        byWallet.push(id);
        byOrg.push(id);
    }

    function _dequeue(uint256 id, Election storage e) private {
        _remove(_pendingByWallet[e.admin], id);
        _remove(_pendingByOrg[e.organizationId], id);
    }

    function _remove(uint256[] storage list, uint256 id) private {
        uint256 n = list.length;
        for (uint256 i = 0; i < n; ) {
            if (list[i] == id) { list[i] = list[n - 1]; list.pop(); return; }
            unchecked { ++i; }
        }
    }

    function _get(uint256 id) private view returns (Election storage) {
        if (id >= electionCount) revert ElectionNotFound();
        return _elections[id];
    }
}
