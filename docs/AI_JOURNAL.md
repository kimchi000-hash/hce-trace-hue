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