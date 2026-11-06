# KẾ HOẠCH TRÌNH BÀY — Poster A2, video 90 giây, demo trực tiếp, vấn đáp

Mốc theo sổ tay: Lab 19 (poster A2 + video 90 giây), Lab 20 (demo trực tiếp trên Sepolia), Lab 21 (vấn đáp cá nhân, điểm nhân hệ số theo mức hiểu mã).

## 1. Thông điệp một câu (10 giây)

"VoteChain: bầu cử cho lớp, khoa, CLB trên blockchain — **không ai thấy bạn bầu ai trước khi bạn tự mở phiếu**, mỗi ví một phiếu, nhóm duyệt do chính tổ chức chọn, nội dung hiển thị luôn được đối chiếu với hash trên chuỗi."

## 2. Demo trực tiếp (Lab 20), kịch bản 5 phút trên Sepolia

Sổ tay yêu cầu demo trực tiếp, không dùng video quay sẵn thay thế. Kịch bản gồm cả mục "Giới hạn, bài học, hướng tiếp theo".

| Phút | Việc | Chuẩn bị trước |
| :-: | :--- | :--- |
| 0:00–0:30 | Vấn đề: bầu công khai → đám đông; ban tổ chức tự duyệt → thiếu tin cậy. Giải pháp: hai pha + nhóm duyệt theo tổ chức | Poster |
| 0:30–1:15 | Trang **Tổ chức**: hồ sơ đã xác minh, thành viên, đại diện duyệt. Nhấn mạnh admin nền tảng chỉ xác minh/đình chỉ | Tổ chức đã `Verified`, có ≥ 3 đại diện |
| 1:15–2:00 | **Tạo cuộc bầu** (ứng viên có ảnh/giới thiệu, ô ví ứng viên tùy chọn) → trang **Phê duyệt**: đại diện ký; đủ ngưỡng ⌈2n/3⌉ thì kích hoạt | Hai cuộc bầu dựng sẵn ở hai pha khác nhau để khỏi chờ |
| 2:00–3:00 | Pha Commit: ví cử tri chọn ứng viên → "Nộp phiếu kín" → lưu file salt. Hiện nhãn "Đã xác thực hash" trên thông tin ứng viên | Ví có ETH Sepolia, `web/proofs.json` đã công bố |
| 3:00–3:30 | **Ca gian lận:** ví ngoài danh sách hoặc nộp lần hai → thông báo tiếng Việt | Một ví ngoài danh sách |
| 3:30–4:15 | Pha Reveal → mở phiếu → "Xem kết quả" (quorum + không hòa) → nhận thẻ SBT, thử chuyển nhượng bị từ chối | Cuộc bầu thứ hai đã sang Reveal |
| 4:15–5:00 | Giới hạn trung thực (Sybil, Supabase ngoài chuỗi, mất salt, 585 dòng, chưa kiểm toán độc lập) và hướng tiếp theo (ví ứng viên ký xác nhận, L2) | `SELF_AUDIT.md` |

**Phương án dự phòng:** bản ghi màn hình chỉ là dự phòng khi mạng hỏng, không thay cho demo; để sẵn tab Etherscan của các giao dịch V2 (xem `evidence/v2/README.md`); nếu Supabase lỗi, giao diện vẫn chạy phần on-chain và báo "KHÔNG khớp hash"/không có nội dung chứ không hiện nội dung chưa xác thực.

## 3. Poster A2 (Lab 19), bố cục gợi ý

1. **Tiêu đề + một câu** (trên cùng), tên nhóm và mã SV (Kim Chi 23K4300025, Võ Thị Thư 23K4300038).
2. **Sơ đồ kiến trúc:** `OrganizationRegistry` (tổ chức, thành viên, đại diện) → `ProjectCore` (vòng đời cuộc bầu, commit–reveal) → `VoterCardSBT` (thẻ không chuyển nhượng); Supabase chỉ giữ nội dung, hash nằm trên chuỗi.
3. **Quy tắc then chốt:** băm gắn ví và ID; ngưỡng duyệt ⌈2n/3⌉; đại diện là ứng viên bị loại khỏi nhóm duyệt; quorum theo bps; hòa → không hợp lệ.
4. **Số liệu thật** (`docs/GAS_REPORT.md`, đo bằng `npm run gas`): `commit` ≈ 68,6 nghìn gas, `reveal` 55,7–89,9 nghìn, `createElection` ≈ 1,01 triệu (người tạo trả, một lần); 201 test Hardhat + 82 test SQL; tối ưu `REVEALED` −19,5 nghìn gas mỗi lần mở phiếu (bản đầu).
5. **Giới hạn trung thực:** mục "điểm yếu ghi nhận" trong `SELF_AUDIT.md`.
6. **Mã QR** tới URL DApp công khai (phải sống ≥ 6 tháng) và repo GitHub. Chỉ in sau khi đã triển khai thật và thử quét bằng điện thoại.

## 4. Video 90 giây (Lab 19)

| Giây | Hình | Lời |
| :-: | :--- | :--- |
| 0–10 | Poster/tiêu đề | Câu thông điệp |
| 10–35 | Quay màn hình DApp: tổ chức → tạo cuộc bầu → đại diện duyệt | "Nhóm duyệt do tổ chức chọn, đủ 2/3 mới chạy" |
| 35–55 | Nộp phiếu kín; ca bị từ chối với thông báo tiếng Việt | "Chỉ mã băm lên chuỗi; ví lạ / nộp hai lần đều bị chặn" |
| 55–75 | Mở phiếu, kết quả, thẻ SBT | "Hợp đồng kiểm tra băm và quorum" |
| 75–90 | Etherscan + giới hạn | "Còn hạn chế: một người nhiều ví, nội dung ngoài chuỗi" |

## 5. Vấn đáp cá nhân (Lab 21)

Giảng viên mở ngẫu nhiên một hàm; điểm nhân hệ số ×1,0 / ×0,7 / ×0,3 theo mức hiểu. Mỗi thành viên tự giải thích được hàm **chọn ngẫu nhiên** theo 4 ý: làm gì, ai gọi, vì sao, sai thì sao. Toàn bộ bảng hàm và số dòng hiện tại nằm ở [`FUNCTION_MAP.md`](FUNCTION_MAP.md). Nhóm hàm nên thuộc kỹ nhất:

- `commit` (366–380), `reveal` (382–398): thứ tự kiểm tra; vì sao `REVEALED` ghi đè `commitments`; vì sao băm có `msg.sender` và `id`; Merkle proof.
- `phase` (401–406), `result` (409–428): vì sao `<=`; vì sao nhân thay vì chia; `MAX_VOTERS` bảo vệ điều gì.
- `createElection` (171–203), `_snapshotApprovers` (237–257): vì sao chụp nhóm duyệt; vì sao loại ví ứng viên; `NotEnoughApprovers`.
- `approveElection` (274–291), `rejectElection` (294–308), `updateElectionMetadata` (332–339) + `_resetApprovals` (519–534): vì sao đổi nội dung thì phải duyệt lại.
- `mint` (87–108) của `VoterCardSBT`: vì sao không có tham số `to`; vì sao mọi hàm chuyển đều `revert Soulbound`.
- `verifyOrganization` (111–116), `updateOrganization` (141–147) của `OrganizationRegistry`: admin nền tảng không làm được gì ngoài xác minh/đình chỉ.
- Câu hỏi "AI đã làm gì": đọc `AI_JOURNAL.md`, nêu 2 lỗi AI mắc và 1 lỗi AI phát hiện (có ở cả lần làm bản đầu và lần nâng cấp V2).
- Câu hỏi "nếu làm lại": `voterCount` tự khai; Sybil (nhiều ví); salt chỉ lưu ở trình duyệt; hợp đồng 585 dòng nên tách thêm; chưa kiểm toán độc lập.
