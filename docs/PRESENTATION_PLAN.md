# KẾ HOẠCH TRÌNH BÀY — Poster A2, video 90 giây, demo trực tiếp, vấn đáp

Mốc theo sổ tay: Lab 19 (poster A2 + video 90 giây), Lab 20 (demo trực tiếp trên Sepolia), Lab 21 (vấn đáp cá nhân, điểm nhân hệ số theo mức hiểu mã).

## 1. Thông điệp một câu (10 giây)

"Bầu cử lớp trên blockchain mà **không ai thấy bạn bầu ai trước khi bạn tự mở phiếu**, mỗi ví một phiếu, kết quả tự tính và không ai sửa được."

## 2. Demo trực tiếp (Lab 20), kịch bản 3 phút

| Giây | Việc | Chuẩn bị trước |
| :-: | :--- | :--- |
| 0–20 | Vấn đề: bầu công khai → đám đông. Giải pháp: hai pha | Poster |
| 20–50 | Mở DApp trên điện thoại/laptop, tải cuộc bầu cử, chỉ ra pha và đếm ngược | Cuộc bầu cử đã tạo và duyệt sẵn, đang ở pha Commit |
| 50–100 | Ví C chọn ứng viên → "Nộp phiếu kín" → tải file dự phòng → hiện mã giao dịch | Ví có ETH, `web/proofs.json` đã công bố |
| 100–130 | **Ca gian lận:** ví D thử nộp lần hai hoặc ví lạ nộp → thông báo tiếng Việt ("không nằm trong danh sách cử tri") | Một ví ngoài danh sách |
| 130–165 | Pha Reveal → mở phiếu → "Xem kết quả" | Dùng cuộc bầu cử thứ hai đã sang Reveal (phòng khi chờ thời gian) |
| 165–180 | Nêu giới hạn trung thực: `voterCount` tự khai, bí mật chỉ đến lúc mở phiếu | `SELF_AUDIT.md` |

**Phương án dự phòng:** quay sẵn video 90 giây; để sẵn hai cuộc bầu cử ở hai pha khác nhau (ID 0 ở Commit, ID 1 ở Reveal) để không phải chờ; có sẵn tab Etherscan của các giao dịch đã làm.

## 3. Poster A2 (Lab 19), bố cục gợi ý

1. **Tiêu đề + một câu** (trên cùng), tên nhóm và mã SV.
2. **Sơ đồ luồng** 4 pha: Đăng ký/duyệt → Commit → Reveal → Kết quả; mũi tên ghi "mã băm" và "salt".
3. **Quy tắc then chốt:** băm gắn ví và ID; quorum 5000 bps; hòa → không hợp lệ.
4. **Số liệu thật:** gas `commit` ≈ 68 650, `reveal` ≈ 56–90 nghìn; 77 test; tối ưu −19,5 nghìn gas mỗi lần mở phiếu.
5. **Giới hạn trung thực:** TB1–TB5 trong `SELF_AUDIT.md`.
6. **Mã QR** tới URL DApp và repo.

## 4. Video 90 giây (Lab 19)

| Giây | Hình | Lời |
| :-: | :--- | :--- |
| 0–10 | Poster/tiêu đề | Câu thông điệp |
| 10–35 | Quay màn hình DApp: kết nối ví, chọn ứng viên, nộp phiếu | "Chỉ mã băm được gửi lên chuỗi" |
| 35–55 | Ca bị từ chối với thông báo tiếng Việt | "Ví lạ / nộp hai lần đều bị chặn" |
| 55–75 | Mở phiếu và kết quả | "Hợp đồng kiểm tra băm và quorum" |
| 75–90 | Etherscan + giới hạn | "Còn hạn chế: người duyệt phải đáng tin" |

## 5. Vấn đáp cá nhân (Lab 21): mỗi người tự trả lời được

Giảng viên mở ngẫu nhiên một hàm. Mỗi thành viên nên giải thích được **cả hai**:

- `reveal` (dòng 213–229): thứ tự kiểm tra → ghi → sự kiện; vì sao `REVEALED` ghi đè `commitments`; vì sao băm có `msg.sender` và `id`.
- `commit` (dòng 197–211): bằng chứng Merkle (lá, nút cha sắp xếp, nút lẻ); vì sao không lưu danh sách cử tri trên chuỗi.
- `phase` (dòng 232–237): vì sao `<=`; điều gì xảy ra đúng giây `commitEnd`.
- `result` (dòng 240–259): vì sao nhân thay vì chia; `MAX_VOTERS` bảo vệ điều gì (TB4).
- Câu hỏi "AI đã làm gì": đọc `AI_JOURNAL.md`, nêu 2 lỗi AI mắc và 1 lỗi AI phát hiện.
- Câu hỏi "nếu làm lại": `voterCount` không kiểm chứng được; sockpuppet người duyệt; thấy tỷ số khi mở phiếu.
