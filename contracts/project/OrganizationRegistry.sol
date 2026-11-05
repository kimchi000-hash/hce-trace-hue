// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title OrganizationRegistry - Danh ba to chuc, thanh vien va dai dien duyet cua VoteChain
 * @notice Moi to chuc (lop, khoa, CLB, hoi sinh vien...) tu quan ly thanh vien va nhom dai dien duyet cua rieng minh.
 *  - Quan tri vien nen tang (platformAdmin) CHI xac minh / dinh chi to chuc. Khong the them, xoa thanh vien,
 *    khong the chon dai dien thay to chuc, khong the can thiep ket qua bau cu.
 *  - Moi quyen quan tri noi bo duoc kiem tra o day (tren chuoi), khong chi o giao dien.
 *  - ProjectCore doc danh sach dai dien tu day khi tao cuoc bau cu va CHUP LAI (snapshot), nen thay doi dai dien
 *    ve sau khong anh huong cac cuoc bau cu dang chay.
 * @dev Gioi han da biet: gioi han theo vi khong chong duoc Sybil (mot nguoi co the co nhieu vi); viec xac minh
 *      to chuc do platformAdmin thuc hien la diem tin cay duy nhat cua tang nen tang.
 */
contract OrganizationRegistry {
    // ------------------------------------------------------------------ Types
    enum Status { None, Pending, Verified, Suspended }
    /// @dev Member: chi la thanh vien. Proposer: duoc de xuat cuoc bau cu. Manager: quan ly thanh vien + dai dien.
    enum Role { None, Member, Proposer, Manager }

    struct Org {
        address owner;      // vi dang ky, luon la Manager va khong the bi go
        Status status;
        string name;
        bytes32 infoHash;   // hash thong tin mo ta to chuc luu ngoai chuoi (Supabase)
        uint256 createdAt;
    }

    struct OrgView {
        address owner;
        Status status;
        string name;
        bytes32 infoHash;
        uint256 createdAt;
        uint256 memberCount;
        uint256 approverCount;
    }

    // -------------------------------------------------------------- Constants
    uint256 public constant MIN_APPROVERS = 2;
    uint256 public constant MAX_APPROVERS = 10;
    uint256 public constant MAX_NAME_BYTES = 64;
    uint256 public constant MAX_MEMBERS = 1_000;

    // ---------------------------------------------------------------- Storage
    address public platformAdmin;
    uint256 public organizationCount;
    mapping(uint256 => Org) private _orgs;
    mapping(uint256 => mapping(address => Role)) public roleOf;
    mapping(uint256 => address[]) private _members;
    mapping(uint256 => mapping(address => uint256)) private _memberIndex; // vi tri + 1 trong _members
    mapping(uint256 => address[]) private _approvers;
    mapping(uint256 => mapping(address => bool)) public isOrgApprover;

    // ----------------------------------------------------------------- Events
    event OrganizationRegistered(uint256 indexed id, address indexed owner, string name);
    event OrganizationVerified(uint256 indexed id, address indexed by);
    event OrganizationSuspended(uint256 indexed id, address indexed by);
    event OrganizationUpdated(uint256 indexed id, string name, bytes32 infoHash);
    event MemberAdded(uint256 indexed id, address indexed member, Role role);
    event MemberRemoved(uint256 indexed id, address indexed member);
    event MemberRoleUpdated(uint256 indexed id, address indexed member, Role role);
    event ApproverAdded(uint256 indexed id, address indexed approver);
    event ApproverRemoved(uint256 indexed id, address indexed approver);
    event ApproverReplaced(uint256 indexed id, address indexed oldApprover, address indexed newApprover);
    event PlatformAdminTransferred(address indexed from, address indexed to);

    // ----------------------------------------------------------------- Errors
    error OrganizationNotFound();
    error NotPlatformAdmin();
    error NotManager();
    error OrganizationNotVerified();
    error InvalidParams();
    error AlreadyMember();
    error NotMember();
    error CannotChangeOwner();
    error AlreadyApprover();
    error NotAnApprover();
    error ApproverLimit();
    error MemberLimit();
    error IsApprover();
    error InvalidStatus();

    // -------------------------------------------------------------- Modifiers
    modifier onlyPlatformAdmin() {
        if (msg.sender != platformAdmin) revert NotPlatformAdmin();
        _;
    }

    /// @dev Quan ly noi bo: chi Manager cua DUNG to chuc do, va to chuc phai dang o trang thai Verified.
    modifier onlyManager(uint256 id) {
        Org storage o = _get(id);
        if (roleOf[id][msg.sender] != Role.Manager) revert NotManager();
        if (o.status != Status.Verified) revert OrganizationNotVerified();
        _;
    }

    constructor() {
        platformAdmin = msg.sender;
        emit PlatformAdminTransferred(address(0), msg.sender);
    }

    // -------------------------------------------------- Quan tri nen tang
    function transferPlatformAdmin(address to) external onlyPlatformAdmin {
        if (to == address(0)) revert InvalidParams();
        emit PlatformAdminTransferred(platformAdmin, to);
        platformAdmin = to;
    }

    /// @notice Xac minh to chuc (hoac phuc hoi sau khi bi dinh chi).
    function verifyOrganization(uint256 id) external onlyPlatformAdmin {
        Org storage o = _get(id);
        if (o.status == Status.Verified) revert InvalidStatus();
        o.status = Status.Verified;
        emit OrganizationVerified(id, msg.sender);
    }

    /// @notice Dinh chi to chuc: khong tao duoc cuoc bau cu moi. Cac cuoc dang chay van tiep tuc binh thuong.
    function suspendOrganization(uint256 id) external onlyPlatformAdmin {
        Org storage o = _get(id);
        if (o.status != Status.Verified && o.status != Status.Pending) revert InvalidStatus();
        o.status = Status.Suspended;
        emit OrganizationSuspended(id, msg.sender);
    }

    // ----------------------------------------------------- To chuc
    function registerOrganization(string calldata name, bytes32 infoHash) external returns (uint256 id) {
        _checkName(name);
        id = ++organizationCount; // id bat dau tu 1; 0 la "khong ton tai"
        Org storage o = _orgs[id];
        o.owner = msg.sender;
        o.status = Status.Pending;
        o.name = name;
        o.infoHash = infoHash;
        o.createdAt = block.timestamp;
        _insertMember(id, msg.sender, Role.Manager);
        emit OrganizationRegistered(id, msg.sender, name);
        emit MemberAdded(id, msg.sender, Role.Manager);
    }

    function updateOrganization(uint256 id, string calldata name, bytes32 infoHash) external onlyManager(id) {
        _checkName(name);
        Org storage o = _orgs[id];
        o.name = name;
        o.infoHash = infoHash;
        emit OrganizationUpdated(id, name, infoHash);
    }

    // --------------------------------------------------- Thanh vien
    function addMember(uint256 id, address who, Role role) external onlyManager(id) {
        if (who == address(0) || role == Role.None) revert InvalidParams();
        if (roleOf[id][who] != Role.None) revert AlreadyMember();
        if (_members[id].length >= MAX_MEMBERS) revert MemberLimit();
        _insertMember(id, who, role);
        emit MemberAdded(id, who, role);
    }

    function removeMember(uint256 id, address who) external onlyManager(id) {
        if (roleOf[id][who] == Role.None) revert NotMember();
        if (who == _orgs[id].owner) revert CannotChangeOwner();
        if (isOrgApprover[id][who]) revert IsApprover(); // go quyen dai dien truoc
        uint256 idx = _memberIndex[id][who] - 1;
        address last = _members[id][_members[id].length - 1];
        _members[id][idx] = last;
        _memberIndex[id][last] = idx + 1;
        _members[id].pop();
        delete _memberIndex[id][who];
        delete roleOf[id][who];
        emit MemberRemoved(id, who);
    }

    function updateMemberRole(uint256 id, address who, Role role) external onlyManager(id) {
        if (role == Role.None) revert InvalidParams();
        if (roleOf[id][who] == Role.None) revert NotMember();
        if (who == _orgs[id].owner) revert CannotChangeOwner();
        roleOf[id][who] = role;
        emit MemberRoleUpdated(id, who, role);
    }

    // ------------------------------------------- Dai dien phe duyet
    /// @notice Them dai dien duyet. Dai dien phai la thanh vien cua chinh to chuc, khong trung, toi da MAX_APPROVERS.
    function addApprover(uint256 id, address who) external onlyManager(id) {
        if (roleOf[id][who] == Role.None) revert NotMember();
        if (isOrgApprover[id][who]) revert AlreadyApprover();
        if (_approvers[id].length >= MAX_APPROVERS) revert ApproverLimit();
        isOrgApprover[id][who] = true;
        _approvers[id].push(who);
        emit ApproverAdded(id, who);
    }

    /// @dev Khong cho xuong duoi MIN_APPROVERS; muon doi nguoi thi dung replaceApprover.
    function removeApprover(uint256 id, address who) external onlyManager(id) {
        if (!isOrgApprover[id][who]) revert NotAnApprover();
        if (_approvers[id].length <= MIN_APPROVERS) revert ApproverLimit();
        _dropApprover(id, who);
        emit ApproverRemoved(id, who);
    }

    function replaceApprover(uint256 id, address oldApprover, address newApprover) external onlyManager(id) {
        if (!isOrgApprover[id][oldApprover]) revert NotAnApprover();
        if (roleOf[id][newApprover] == Role.None) revert NotMember();
        if (isOrgApprover[id][newApprover]) revert AlreadyApprover();
        _dropApprover(id, oldApprover);
        isOrgApprover[id][newApprover] = true;
        _approvers[id].push(newApprover);
        emit ApproverReplaced(id, oldApprover, newApprover);
    }

    // ---------------------------------------------------------------- Views
    /// @notice Nguong phe duyet = 2/3 so dai dien, lam tron len.
    function approvalThreshold(uint256 approverCount) public pure returns (uint256) {
        return (approverCount * 2 + 2) / 3;
    }

    function isVerified(uint256 id) external view returns (bool) {
        return id != 0 && id <= organizationCount && _orgs[id].status == Status.Verified;
    }

    /// @return true neu to chuc Verified va `who` la Proposer hoac Manager cua to chuc do.
    function canPropose(uint256 id, address who) external view returns (bool) {
        if (id == 0 || id > organizationCount || _orgs[id].status != Status.Verified) return false;
        Role r = roleOf[id][who];
        return r == Role.Proposer || r == Role.Manager;
    }

    function getOrganization(uint256 id) external view returns (OrgView memory v) {
        Org storage o = _get(id);
        v.owner = o.owner;
        v.status = o.status;
        v.name = o.name;
        v.infoHash = o.infoHash;
        v.createdAt = o.createdAt;
        v.memberCount = _members[id].length;
        v.approverCount = _approvers[id].length;
    }

    function getMembers(uint256 id) external view returns (address[] memory addrs, Role[] memory roles) {
        _get(id);
        addrs = _members[id];
        roles = new Role[](addrs.length);
        for (uint256 i = 0; i < addrs.length; i++) roles[i] = roleOf[id][addrs[i]];
    }

    function getApprovers(uint256 id) external view returns (address[] memory) {
        _get(id);
        return _approvers[id];
    }

    // ------------------------------------------------------------- Internal
    function _get(uint256 id) private view returns (Org storage) {
        if (id == 0 || id > organizationCount) revert OrganizationNotFound();
        return _orgs[id];
    }

    function _checkName(string calldata name) private pure {
        uint256 n = bytes(name).length;
        if (n == 0 || n > MAX_NAME_BYTES) revert InvalidParams();
    }

    function _insertMember(uint256 id, address who, Role role) private {
        roleOf[id][who] = role;
        _members[id].push(who);
        _memberIndex[id][who] = _members[id].length;
    }

    function _dropApprover(uint256 id, address who) private {
        address[] storage list = _approvers[id];
        uint256 n = list.length;
        for (uint256 i = 0; i < n; i++) {
            if (list[i] == who) {
                list[i] = list[n - 1];
                list.pop();
                break;
            }
        }
        delete isOrgApprover[id][who];
    }
}
