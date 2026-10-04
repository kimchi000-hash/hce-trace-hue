# NHẬT KÝ LÀM VIỆC VỚI AI - [Tên bài]

## Lần 1

**Prompt:** dán nguyên văn.

**AI trả về:** tóm tắt.

**Đánh giá:** Dùng được / Phải sửa / Sai, bỏ.

**Chỗ sai:** mô tả cụ thể, kèm dòng mã hoặc dữ liệu đối chiếu.

**Cách sửa:** sinh viên đã làm gì.

**Ai phát hiện:** AI tự nhận / Sinh viên phát hiện.

## Lab 09 — Sinh mã và biên dịch hợp đồng lõi ProjectCore.sol
- **Công cụ:** Antigravity IDE (Gemini).
- **Yêu cầu:** Sinh mã hệ thống bỏ phiếu Club Voting từ `docs/SPEC.md` kế thừa `SimpleVoting.sol`.
- **Đánh giá:** Phải sửa trước khi biên dịch.
- **Chỗ sai:** Dòng 21 khai báo biến dính liền chuỗi `adminowner;` dẫn đến lỗi cú pháp ParserError.
- **Cách sửa:** Sửa thủ công thành `address public admin;`.
- **Ai phát hiện:** Sinh viên phát hiện.
- **Kết quả biên dịch:** Biên dịch thành công trên Remix IDE với compiler 0.8.20+, sinh đủ ABI và Bytecode trong artifacts/.


## Lab 10 — Rà soát mã nguồn do AI sinh ra (Audit ProjectCore.sol & VaultBuggy.sol)

### Bảng ghi nhận lỗi rà soát
| Lỗi | Mô tả | Ai phát hiện | Cách khắc phục |
| :---: | :--- | :---: | :--- |
| **1** | `VaultBuggy.sol`: Rút tiền chuyển ETH trước khi cập nhật số dư (Lỗ hổng Reentrancy). | AI / Sinh viên | Áp dụng Checks-Effects-Interactions: trừ số dư trước khi gửi tiền. |
| **2** | `VaultBuggy.sol`: Hàm khẩn cấp thiếu kiểm tra quyền `onlyOwner`. | AI | Bổ sung modifier `onlyOwner` kiểm tra quyền `msg.sender`. |
| **3** | `ProjectCore.sol`: Hàm `registerVoters` nhận mảng rỗng gây lãng phí gas không cần thiết. | AI | Bổ sung điều kiện kiểm tra `if (voters.length == 0) revert EmptyVoterList();`. |
| **4** | `ProjectCore.sol`: Hàm `vote()` chưa kiểm tra giới hạn `candidateId` bằng custom error. | **Sinh viên** | Bổ sung kiểm tra `if (candidateId >= candidates.length) revert InvalidCandidate();`. |