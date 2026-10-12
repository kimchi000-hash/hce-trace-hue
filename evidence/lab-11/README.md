# BÁO CÁO MINH CHỨNG THỰC NGHIỆM LAB 11 — SEPOLIA TESTNET
## Đề tài: Hệ thống Bầu cử Kín 2 pha (Commit - Reveal) kết hợp Quorum
### Học phần: ECO2432 — Web3 Starter

- **Hợp đồng kiểm nghiệm:** [`contracts/project/ProjectCore.sol`](../../contracts/project/ProjectCore.sol) (Bầu cử kín 2 pha Commit - Reveal + Quorum `quorumBps`)
- **Môi trường thực thi thực tế:** Ethereum Sepolia Testnet (`Injected Provider / WalletConnect - MetaMask`)
- **Địa chỉ hợp đồng (Contract Address):** [`0x7D3bC21A8532d2011cF970C0701413C236C53Ddd`](https://sepolia.etherscan.io/address/0x7D3bC21A8532d2011cF970C0701413C236C53Ddd)
- **Địa chỉ ví thực hiện (Admin & Cử tri hợp lệ):** [`0xf8242815A45Aa13006a841b02677fB5853d96350`](https://sepolia.etherscan.io/address/0xf8242815A45Aa13006a841b02677fB5853d96350)
- **Thành viên thực hiện:**
  - Nguyễn Thị Kim Chi (23K4300025) — Triển khai hợp đồng & Quản trị giao dịch Sepolia
  - Võ Thị Thư (23K4300038) — Tester thực nghiệm & Đối soát dữ liệu on-chain

---

## 1. Thông số Khởi tạo Hợp đồng trên Sepolia

Hợp đồng được biên dịch bằng Solidity `0.8.20` và triển khai thông qua Remix IDE kết nối ví MetaMask Sepolia:
- **Tên các ứng viên:** `["Nguyen Van A", "Tran Thi B"]`
- **Thời gian Pha Đăng ký (`regMinutes`):** 5 phút
- **Thời gian Pha Cam kết (`commitMinutes`):** 10 phút
- **Thời gian Pha Mở phiếu (`revealMinutes`):** 10 phút
- **Ngưỡng túc số (`_quorumBps`):** `5000` (50.00% theo chuẩn Basis Points, $1\% = 100 \text{ bps}$)

---

## 2. Bảng Tổng hợp Kết quả Kiểm thử Quy tắc Kinh tế trên Sepolia

| Ca kiểm thử | Loại kiểm nghiệm | Thao tác thực hiện | Khối (Block) | Mã giao dịch (Tx Hash) | Trạng thái on-chain | Kết quả nghiệm thu |
| :---: | :---: | :--- | :---: | :--- | :---: | :---: |
| **Ca 1** | **Hợp lệ (Happy Path)** | Cử tri hợp lệ gọi hàm `commit(bytes32)` trong khung giờ Pha 1 (`Phase.Commit`) | `11899220` | [`0x6e37bcfff00cfbdcb16214a7a063fdfdcc9a0666f17a6f38fdacc4183a9942ef`](https://sepolia.etherscan.io/tx/0x6e37bcfff00cfbdcb16214a7a063fdfdcc9a0666f17a6f38fdacc4183a9942ef) | **Success (Status: 1)** | ✅ PASS (Khớp quy tắc R1 & R2) |
| **Ca 2** | **Vi phạm bị chặn (Negative / Fraud)** | Cố tình gọi lại `commit(bytes32)` lần 2 để gian lận nộp phiếu lặp hoặc gọi ngoài pha | `11899237` | [`0xd43e0c6c27ce4ffa07724dc0c6b0e5aed4eda3bdab40ddd2635f27d23bdb685`](https://sepolia.etherscan.io/tx/0xd43e0c6c27ce4ffa07724dc0c6b0e5aed4eda3bdab40ddd2635f27d23bdb685) | **Reverted (Status: 0)** | ✅ PASS (Chặn đứng theo quy tắc R2) |

---

## 3. Chi tiết Thực nghiệm & Phân tích Giao dịch on-chain

### 3.1 Ca 1 — Bỏ phiếu Hợp lệ trong Pha Cam kết (Happy Path)
- **Mục tiêu kiểm thử:** Kiểm chứng quy tắc **R1** (định danh cử tri hợp lệ trong mapping `isVoter`) và quy tắc **R2** (nộp cam kết mã hóa giữ kín tuyệt đối lá phiếu).
- **Thao tác on-chain:**
  - Cử tri sử dụng ví `0xf8242815A45Aa13006a841b02677fB5853d96350` (đã được Admin nạp vào Whitelist ở pha Registration).
  - Gửi giao dịch gọi hàm:
    ```solidity
    commit(0x1111111111111111111111111111111111111111111111111111111111111111)
    ```
- **Kết quả ghi nhận trên Sepolia Etherscan:**
  - **Transaction Hash:** `0x6e37bcfff00cfbdcb16214a7a063fdfdcc9a0666f17a6f38fdacc4183a9942ef`
  - **Block Height:** `11899220`
  - **Trạng thái:** `Success (Status: 1 / Confirmed)`
  - **Sự kiện phát ra (Logs):** Hợp đồng ghi nhận event:
    ```solidity
    emit Committed(0xf8242815A45Aa13006a841b02677fB5853d96350);
    ```
  - **Đánh giá:** Trạng thái cam kết được lưu trữ thành công vào mapping `commitments`, lá phiếu được bảo mật hoàn toàn trên mạng lưới.

![Ca 1 Hợp lệ](./01_valid_commit_sepolia.png)

---

### 3.2 Ca 2 — Vi phạm Quy tắc Bị Chặn: Bầu lặp / Sai Pha (Negative & Fraud Test)
- **Mục tiêu kiểm thử:** Kiểm chứng tính toàn vẹn của mô hình Checks-Effects-Interactions (CEI), quy tắc **R2** chống bầu lặp (`revert AlreadyCommitted()`) và kiểm soát chu trình pha thời gian `inPhase(Phase.Commit)`.
- **Thao tác on-chain:**
  - Cùng địa chỉ ví `0xf8242815A45Aa13006a841b02677fB5853d96350` tiếp tục gửi thêm một giao dịch gọi hàm `commit(...)` với cùng mã băm hoặc mã băm mới khi đã cam kết trước đó.
- **Kết quả ghi nhận trên Sepolia Etherscan:**
  - **Transaction Hash:** `0xd43e0c6c27ce4ffa07724dc0c6b0e5aed4eda3bdab40ddd2635f27d23bdb685`
  - **Block Height:** `11899237`
  - **Trạng thái:** `Fail — Reverted (Status: 0)`
  - **Cơ chế phòng vệ:** Hợp đồng lập tức hoàn tác giao dịch ở tầng EVM, chặn đứng hành vi gian lận nộp cam kết nhiều lần của cử tri.
  - **Đánh giá:** Giao dịch bị đào và ghi nhận thất bại trên chuỗi, bảo toàn tính bất biến của cam kết ban đầu và giữ nguyên cấu trúc dữ liệu của hợp đồng.

![Ca 2 Vi phạm](./02_revert_duplicate_commit_sepolia.png)

---

## 4. Kết luận Nghiệm thu Kỹ thuật Lab 11

1. Hợp đồng `ProjectCore.sol` vận hành ổn định và chính xác trên môi trường mạng thử nghiệm công khai Ethereum Sepolia Testnet.
2. Cơ chế phân pha thời gian (`Phase`), bảo mật lá phiếu 2 pha (Commit - Reveal) và cơ chế chặn bầu trùng lặp đã được thực nghiệm thành công với các bằng chứng giao dịch (Transaction Hash) minh bạch trên trình khám phá khối Etherscan.
3. Dự án hoàn thành đầy đủ tiêu chí nghiệm thu của Lab 11 theo Sổ tay thực hành ECO2432.
