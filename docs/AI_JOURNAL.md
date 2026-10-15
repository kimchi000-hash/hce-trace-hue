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

## Lab 11 — Nâng cấp Bầu cử kín Commit - Reveal có Quorum & Thực nghiệm Sepolia
- **Công cụ:** Antigravity IDE (Gemini).
- **Yêu cầu:** Nâng cấp kiến trúc hợp đồng `ProjectCore.sol` lên bầu cử kín 2 pha (Commit - Reveal) kết hợp Quorum basis points, chuẩn bị triển khai mạng Sepolia Testnet.
- **Đánh giá:** Dùng được sau khi tinh chỉnh logic bảo mật hàm băm.
- **Chỗ sai / Rủi ro bảo mật:** Ban đầu hàm băm `commitment` chưa ràng buộc địa chỉ ví `msg.sender`, dẫn đến nguy cơ cử tri khác sao chép mã băm trong mempool để bỏ phiếu theo (Copy-voting). Ngoài ra, tham số `_quorumBps` chưa chặn giới hạn trên 10,000 bps.
- **Cách sửa:** Sinh viên yêu cầu AI cập nhật mã băm thành `keccak256(abi.encodePacked(candidateId, salt, msg.sender))` và thêm điều kiện `if (_quorumBps > 10_000) revert InvalidParams();`.
- **Ai phát hiện:** Sinh viên phát hiện và yêu cầu khắc phục.
- **Kết quả thực nghiệm:** Triển khai thành công trên Sepolia (`0x7D3bC21A8532d2011cF970C0701413C236C53Ddd`), ghi nhận 1 ca hợp lệ (Block 11899220) và 1 ca vi phạm bị revert (Block 11899237).

## Lab 12 — Thẩm định Hồ sơ Gate Review 1 & Khóa Phạm vi (Scope Lock)
- **Công cụ:** Antigravity IDE (Gemini).
- **Yêu cầu:** Rà soát toàn bộ codebase, đối soát 5/5 tiêu chuẩn sức khỏe repo, xây dựng kịch bản thuyết trình demo 3 phút và khóa phạm vi cho giai đoạn Lab 13–15.
- **Đánh giá:** Dùng được, hỗ trợ lập cấu trúc biên bản Gate Review 1 chuẩn xác.
- **Điểm cần lưu ý:** AI đề xuất thêm các tính năng mở rộng như token quản trị ERC-20 và bầu cử nhiều vòng. Nhóm nhận định các tính năng này làm phình to mã nguồn vượt mức 150 dòng và tạo rủi ro phân tán nguồn lực.
- **Cách sửa:** Sinh viên chủ động quyết định cắt bỏ các tính năng đầu cơ (Out-of-scope), giữ hợp đồng tinh gọn 125 dòng mã, tập trung kiểm thử chuyên sâu và giao diện Web DApp cho giai đoạn Lab 13–15.
- **Ai phát hiện:** Sinh viên chủ động ra quyết định quản trị phạm vi (Scope Lock).
- **Kết quả nghiệm thu:** Đạt 5/5 tiêu chuẩn sức khỏe Repo, đề tài được phê duyệt ở mức Nâng cao (Qua / Approved).

## Lab 13 — Thẩm định An ninh, Phân tích Lỗ hổng Reentrancy & Kiểm thử Phân quyền (Negative Test)
- **Công cụ:** Antigravity IDE (Gemini).
- **Yêu cầu:** Phân tích cơ chế khai thác Reentrancy qua hàm `receive()` trong `VulnerableBank.sol`, so sánh 2 phương án khắc phục (CEI vs ReentrancyGuard), vá lỗi bằng mô hình Checks-Effects-Interactions, và xây dựng kịch bản kiểm thử Hardhat bắt mã lỗi `NotAdmin()` cho `ProjectCore.sol`.
- **Đánh giá:** Dùng được, hỗ trợ chuẩn hóa nguyên tắc Checks-Effects-Interactions và kịch bản test tự động.
- **Chỗ sai / Rủi ro an ninh đối chiếu:** Trong `VulnerableBank.sol`, lệnh `msg.sender.call{value: balance}("")` nằm trước `balances[msg.sender] = 0;`, cho phép `Attacker.receive()` gọi tái nhập hàm `withdraw()` rút cạn toàn bộ 6 ETH. Đối chiếu với hợp đồng đồ án `ProjectCore.sol`, nhóm kiểm tra thấy hàm `reveal()` đã tuân thủ đúng nguyên tắc CEI khi gán `hasRevealed[msg.sender] = true;` trước khi ghi nhận cộng dồn phiếu bầu.
- **Cách sửa:** Đưa lệnh `balances[msg.sender] = 0;` lên trước lệnh `call` trong `VulnerableBank.sol`. Viết kịch bản test tự động `test/ProjectCore.test.js` sử dụng `expect(...).to.be.revertedWithCustomError(projectCore, "NotAdmin")` để chứng minh cơ chế phân quyền hoạt động tin cậy.
- **Ai phát hiện:** Sinh viên và AI phối hợp rà soát thực nghiệm trên Remix VM.
- **Kết quả nghiệm thu:** Bản vá triệt tiêu hoàn toàn lỗ hổng Reentrancy; kịch bản test tự động bắt chính xác lỗi `NotAdmin()` khi tài khoản lạ cố can thiệp danh sách cử tri.