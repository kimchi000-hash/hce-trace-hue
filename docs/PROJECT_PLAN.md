# PROJECT PLAN — HỆ THỐNG BỎ PHIẾU BAN CÁN SỰ (CLUB VOTING)

## Thành viên và vai trò
| Họ tên | Mã SV | Vai chính Lab 8–11 | Vai chính Lab 12–15 |
| :--- | :---: | :--- | :--- |
| **Nguyễn Thị Kim Chi** | 23K4300025 | Đặc tả (BA) & Hợp đồng (Smart Contract Dev) | Kiểm thử (Tester/Auditor) & Quản trị Repo |
| **Võ Thị Thư** | 23K4300038 | Kiểm thử (Tester) & Giao diện (Frontend) | Hợp đồng (Smart Contract Dev) & Giao diện (Frontend) |

## Người dùng và vấn đề
- **Người dùng chính:** Sinh viên trong lớp học phần ECO2432 và Giảng viên / Ban cán sự lớp.
- **Vấn đề cần giải quyết:** Loại bỏ nguy cơ kiểm phiếu thủ công sai lệch, can thiệp kết quả hoặc bỏ phiếu hộ khi dùng bảng biểu truyền thống; bảo đảm tính bất biến của kết quả bầu cử.
- **Sản phẩm cuối nhìn thấy được:** DApp giao diện web mở được trên điện thoại kết nối MetaMask Sepolia, hiển thị số phiếu nhảy tự động và danh sách ứng cử viên.

## Mốc bắt buộc
- **Lab 8:** Khởi tạo codebase nhóm, chốt phân vai và đặc tả v0.1.
- **Lab 9:** Contract lõi `contracts/project/ProjectCore.sol` kế thừa `SimpleVoting.sol` biên dịch thành công.
- **Lab 10:** Audit mã nguồn bằng AI, phát hiện ít nhất 3 lỗi và tối ưu gas.
- **Lab 11:** Kiểm thử thành công 1 ca hợp lệ và 1 ca gian lận (bầu lần 2 hoặc bầu ngoài thời hạn).
- **Lab 12:** Gate Review 1 (Thuyết minh 3 phút và bảo vệ trước lớp).
- **Lab 13:** Kiểm thử ca tấn công / bảo mật dòng điều khiển.
- **Lab 14:** Rà soát chéo hợp đồng với nhóm khác.
- **Lab 15:** Triển khai DApp hoàn chỉnh lên GitHub Pages.
