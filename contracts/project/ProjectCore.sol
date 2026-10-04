// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ProjectCore
 * @dev He thong bo phieu on-chain (Club Voting) tuan thu tieu chuan SimpleVoting.sol
 * va quy uoc du an ECO2432 (AGENTS.md).
 */
contract ProjectCore {
    // --- CAU TRUC DU LIEU ---

    // Thong tin ung cu vien
    struct Candidate {
        string name;
        uint256 voteCount;
    }

    // --- BIEN TRANG THAI ---

    // Dia chi quan tri vien (Admin)
    address public admin;

    // Moc thoi gian bat dau va ket thuc bau cu
    uint256 public startTime;
    uint256 public endTime;

    // Danh sach ung cu vien
    Candidate[] public candidates;

    // Danh sach cu tri hop le (duoc cap quyen bo phieu)
    mapping(address => bool) public isVoter;

    // Danh sach cu tri da thuc hien bo phieu (chong bau lap)
    mapping(address => bool) public hasVoted;

    // --- KHAI BAO LOI TUY BIEN (CUSTOM ERRORS) ---

    // Nguoi goi khong phai la admin
    error NotAdmin();

    // Cu tri khong co trong danh sach hop le
    error NotEligible();

    // Cu tri da bo phieu truoc do
    error AlreadyVoted();

    // Ngoai thoi gian bau cu cho phep
    error NotInVotingPeriod();

    // Ung cu vien khong hop le hoac khong ton tai
    error InvalidCandidate();

    // Danh sach cu tri dang ky bi rong
    error EmptyVoterList();

    // --- SU KIEN (EVENTS) ---

    // Phat khi mot cu tri duoc dang ky thanh cong
    event VoterRegistered(address indexed voter);

    // Phat khi cu tri hoan tat bo phieu
    event Voted(address indexed voter, uint256 indexed candidateId);

    // --- MODIFIER PHAN QUYEN ---

    // Kiem tra quyen quan tri vien
    modifier onlyAdmin() {
        if (msg.sender != admin) {
            revert NotAdmin();
        }
        _;
    }

    // --- CONSTRUCTOR ---

    /**
     * @dev Khoi tao hop dong bau cu
     * @param names Danh sach ten ung cu vien ban dau
     * @param durationMinutes Thoi gian mo hom phieu tinh theo phut
     */
    constructor(string[] memory names, uint256 durationMinutes) {
        admin = msg.sender;
        startTime = block.timestamp;
        endTime = block.timestamp + (durationMinutes * 1 minutes);

        // Nap danh sach ung cu vien ban dau
        for (uint256 i = 0; i < names.length; ) {
            candidates.push(Candidate({name: names[i], voteCount: 0}));
            unchecked {
                ++i;
            }
        }
    }

    // --- CAC HAM NGHIEP VU COT LOI ---

    /**
     * @dev Cap quyen cho danh sach cu tri theo lo (batch)
     * @param voters Danh sach dia chi cu tri
     */
    function registerVoters(address[] calldata voters) external onlyAdmin {
        // Checks: Kiem tra danh sach cu tri khong duoc rong
        if (voters.length == 0) {
            revert EmptyVoterList();
        }

        for (uint256 i = 0; i < voters.length; ) {
            address voter = voters[i];
            // Bo qua dia chi address(0) va cu tri da duoc cap quyen truoc do
            if (voter != address(0) && !isVoter[voter]) {
                isVoter[voter] = true;
                emit VoterRegistered(voter);
            }
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @dev Cu tri thuc hien bo phieu cho mot ung cu vien
     * @param candidateId So thu tu cua ung cu vien duoc bau
     */
    function vote(uint256 candidateId) external {
        // Checks: Kiem tra thoi gian hop le
        if (block.timestamp < startTime || block.timestamp > endTime) {
            revert NotInVotingPeriod();
        }

        // Checks: Kiem tra tu cach cu tri
        if (!isVoter[msg.sender]) {
            revert NotEligible();
        }

        // Checks: Kiem tra chong bau lap
        if (hasVoted[msg.sender]) {
            revert AlreadyVoted();
        }

        // Checks: Kiem tra ung cu vien hop le
        if (candidateId >= candidates.length) {
            revert InvalidCandidate();
        }

        // Effects: Cap nhat trang thai da bo phieu truoc khi tang phieu
        hasVoted[msg.sender] = true;
        candidates[candidateId].voteCount++;

        // Interactions / Events: Phat su kien sau khi hoan tat thay doi trang thai
        emit Voted(msg.sender, candidateId);
    }

    /**
     * @dev Doc cong khai toan bo ket qua bau cu hien tai (view function, khong ton gas khi doc off-chain)
     * @return Danh sach toan bo ung cu vien cung so phieu
     */
    function getResults() external view returns (Candidate[] memory) {
        return candidates;
    }

    /**
     * @dev Tra ve tong so luong ung cu vien hien co
     * @return So luong ung cu vien
     */
    function candidateCount() external view returns (uint256) {
        return candidates.length;
    }
}
