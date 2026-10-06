// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title VaultFixed
 * @notice Phien ban sua toan dien 4 loi bao mat tu VaultBuggy.sol
 * @dev Tuan thu nghiem ngat AGENTS.md:
 *      - Checks-Effects-Interactions (CEI)
 *      - Custom errors thay cho require string
 *      - Chuyen ETH dung call{value: ...}("") co kiem tra ket qua
 *      - Phat event cho moi ham thay doi trang thai
 */
contract VaultFixed {
    // =========================================================================
    // STATE VARIABLES
    // =========================================================================
    address public owner;
    uint256 public defaultLockDuration;

    mapping(address => uint256) public balances;
    mapping(address => uint256) public unlockTime;

    // =========================================================================
    // EVENTS (Quy tac 1 - AGENTS.md: Moi ham thay doi trang thai phai phat event)
    // =========================================================================
    event Deposited(address indexed sender, uint256 amount, uint256 unlockTime);
    event Withdrawn(address indexed to, uint256 amount);
    event EmergencyWithdrawn(address indexed owner, uint256 amount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // =========================================================================
    // CUSTOM ERRORS (Quy tac 5 - AGENTS.md: Toi uu Gas, khong dung chuoi loi dai)
    // =========================================================================
    error NotOwner();
    error StillLocked();
    error InvalidAddress();
    error ZeroBalance();
    error ZeroAmount();
    error TransferFailed();
    error NothingToWithdraw();

    // =========================================================================
    // MODIFIERS (Sua Loi 1: Kiem tra phan quyen ro rang)
    // =========================================================================
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================
    constructor(uint256 lockSeconds) {
        owner = msg.sender;
        defaultLockDuration = lockSeconds;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // =========================================================================
    // DEPOSIT FUNCTIONS
    // =========================================================================
    /**
     * @notice Nap ETH voi thoi gian khoa mac dinh
     */
    function deposit() external payable {
        _deposit(defaultLockDuration);
    }

    /**
     * @notice Nap ETH voi thoi gian khoa tuy bien
     * @param lockDuration Thoi gian khoa tinh bang giay
     */
    function depositWithCustomLock(uint256 lockDuration) external payable {
        _deposit(lockDuration);
    }

    function _deposit(uint256 lockDuration) internal {
        if (msg.value == 0) revert ZeroAmount();

        balances[msg.sender] += msg.value;
        unlockTime[msg.sender] = block.timestamp + lockDuration;

        emit Deposited(msg.sender, msg.value, unlockTime[msg.sender]);
    }

    // =========================================================================
    // WITHDRAW FUNCTION (Sua Loi 2 & Loi 3)
    // =========================================================================
    /**
     * @notice Rut toan bo so du khi da het thoi gian khoa
     * @dev Sua Loi 2 (Reentrancy): Ap dung triet de Checks-Effects-Interactions (CEI).
     *      Sua Loi 3 (Time Lock): Kiem tra dung logic block.timestamp >= unlockTime[msg.sender].
     */
    function withdraw() external {
        uint256 amount = balances[msg.sender];

        // 1. CHECKS: Kiem tra so du va dieu kien thoi gian mo khoa
        if (amount == 0) revert ZeroBalance();
        if (block.timestamp < unlockTime[msg.sender]) {
            revert StillLocked();
        }

        // 2. EFFECTS: Cap nhat trang thai truoc khi tuong tac ben ngoai (Chong Reentrancy)
        balances[msg.sender] = 0;
        emit Withdrawn(msg.sender, amount);

        // 3. INTERACTIONS: Chuyen ETH bang call va kiem tra ket qua (Quy tac 4 - AGENTS.md)
        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    // =========================================================================
    // EMERGENCY WITHDRAW (Sua Loi 1: Access Control)
    // =========================================================================
    /**
     * @notice Rut toan bo quy khan cap boi Owner
     * @dev Chi duy nhat Owner moi co quyen goi ham nay
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance == 0) revert NothingToWithdraw();

        emit EmergencyWithdrawn(owner, balance);

        (bool success, ) = owner.call{value: balance}("");
        if (!success) revert TransferFailed();
    }

    // =========================================================================
    // TRANSFER OWNERSHIP (Sua Loi 1 & Loi 4)
    // =========================================================================
    /**
     * @notice Chuyen quyen so huu sang dia chi moi
     * @dev Sua Loi 1: Chi Owner duoc goi qua modifier onlyOwner.
     *      Sua Loi 4: Chan dia chi rac address(0) bang custom error InvalidAddress().
     * @param newOwner Dia chi vi chu so huu moi
     */
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();

        address oldOwner = owner;
        owner = newOwner;

        emit OwnershipTransferred(oldOwner, newOwner);
    }

    // =========================================================================
    // RECEIVE
    // =========================================================================
    receive() external payable {
        _deposit(defaultLockDuration);
    }
}
