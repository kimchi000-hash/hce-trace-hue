const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ProjectCore - Negative Tests (Lab 13)", function () {
    it("Should revert if a non-admin tries to register voters", async function () {
        const [admin, hacker, user] = await ethers.getSigners();

        // 1. Triển khai hợp đồng với các tham số khởi tạo
        const ProjectCore = await ethers.getContractFactory("ProjectCore");
        const candidates = ["Alice", "Bob"];
        const projectCore = await ProjectCore.deploy(
            candidates, 
            10, // regMinutes
            10, // commitMinutes
            10, // revealMinutes
            5000 // quorumBps
        );

        // 2. Kẻ tấn công (hacker) cố tình gọi hàm đăng ký cử tri
        // Sử dụng expect().to.be.revertedWithCustomError để bắt chính xác lỗi NotAdmin()
        await expect(
            projectCore.connect(hacker).registerVoters([user.address])
        ).to.be.revertedWithCustomError(projectCore, "NotAdmin");
    });
});
