# SEPOLIA RUNBOOK — triển khai và thu bằng chứng

> **Đây là runbook của bản v1 (một hợp đồng `ProjectCore` cũ).** Bản nền tảng nhiều tổ chức (v2: `OrganizationRegistry` + `ProjectCore`) dùng `docs/SEPOLIA_DEPLOY_V2.md`.

Việc này **phải do nhóm làm bằng ví của mình** (cần Sepolia ETH và ký giao dịch). Mọi ô "☐" bên dưới đều để trống cho đến khi có kết quả thật. **Không điền địa chỉ, mã giao dịch hay ảnh chụp nào chưa từng xảy ra.**

Cần: 3 ví MetaMask trên Sepolia, mỗi ví có ETH thử nghiệm (faucet). Gợi ý: ví A = ban tổ chức, ví B = người duyệt, ví C và D = cử tri (A cũng có thể là cử tri). Ví người duyệt **không được trùng ví ban tổ chức**.

## 1. Chuẩn bị danh sách cử tri

```bash
cp scripts/voters.example.json scripts/voters.json     # sửa thành địa chỉ ví thật (ít nhất ví C và D)
node scripts/election_args.js scripts/voters.json <ĐỊA_CHỈ_VÍ_B> --title "Bau thu Lab 15" --names "An,Binh" --reg 5 --commit 10 --reveal 10 --quorum 5000
node scripts/merkle.js scripts/voters.json web/proofs.json
```

Lệnh đầu in sẵn chuỗi tham số `createElection` để dán vào Remix. Lệnh sau ghi `web/proofs.json` (địa chỉ ví → bằng chứng). File này chỉ chứa địa chỉ công khai và mã băm, được phép commit.

## 2. Triển khai

1. Remix: nạp `contracts/project/ProjectCore.sol`, trình biên dịch **0.8.20**, bấm Compile.
2. Deploy & Run: Environment **Injected Provider – MetaMask** (ví A, mạng Sepolia). Deploy (không có tham số).
3. Ghi địa chỉ hợp đồng → ☐ `__________________` · Tx triển khai → ☐ `__________________`
4. Dán địa chỉ vào `CONFIG.CONTRACT_ADDRESS` đầu script trong `web/index.html` (hoặc nhập vào ô địa chỉ trên trang) và README mục 3.

## 3. Chạy trọn vòng (đây là bằng chứng nên nộp)

Thời gian các pha tính từ lúc tạo (`regMinutes` 5 → `commitMinutes` 10 → `revealMinutes` 10 ≈ 25 phút), nên chuẩn bị trước khi bấm.

| Bước | Ai | Việc | Kết quả mong đợi | Bằng chứng |
| :-: | :-: | :--- | :--- | :--- |
| 1 | A | `createElection` (dán chuỗi ở mục 1) | sự kiện `ElectionCreated` | ☐ tx |
| 2 | B | `approveElection(0)` **trong 5 phút đầu** | `ElectionActivated` | ☐ tx |
| 3 | C | Web: nộp phiếu (hoặc gọi `commit`) | `Committed` | ☐ tx |
| 4 | D | Web: nộp phiếu | `Committed` | ☐ tx |
| 5 | C | **Nộp lần 2** | revert `AlreadyCommitted` (ca gian lận 1) | ☐ tx/ảnh |
| 6 | E (ví ngoài danh sách) | Nộp phiếu | revert `InvalidProof` (ca gian lận 2) | ☐ tx/ảnh |
| 7 | C, D | Chờ hết pha Commit, bấm "Tiết lộ" | `Revealed` | ☐ tx ×2 |
| 8 | C | Mở phiếu lần 2 | revert `AlreadyRevealed` | ☐ tx/ảnh |
| 9 | bất kỳ | Chờ hết pha Reveal → `result(0)` | `(valid, winnerId, topVotes)` | ☐ ảnh |

Ghi chú:
- Giao diện ước lượng gas trước khi mở MetaMask nên ca revert thường **không tạo giao dịch**; muốn có mã giao dịch thất bại trên Etherscan, gọi hàm trực tiếp trong Remix (đặt gas limit thủ công) để vẫn gửi đi.
- Với ca 3–4, nên dùng giao diện (đây là bằng chứng Lab 15) và lưu file `.json` dự phòng.
- Nếu hết pha mà thiếu bước: tạo cuộc bầu cử mới (`createElection` lần nữa, `id = 1`) và làm lại, không cần triển khai lại hợp đồng.

## 4. Bật GitHub Pages và gắn nhãn

1. Repo → Settings → Pages → Source: nhánh `main`, thư mục `/web` (hoặc quy trình do giảng viên cung cấp).
2. ☐ URL: `https://<tài-khoản>.github.io/<tên-repo>/` → mở trên **điện thoại** kiểm tra kết nối ví.
3. Commit: `lab-15: public dapp va presentation plan` · Tag: `git tag v0.1-demo && git push --tags`.

## 5. Cập nhật hồ sơ sau khi có bằng chứng

- `evidence/lab-15/`: ảnh giao diện (sai mạng, commit thành công, thông báo tiếng Việt khi bị từ chối), ảnh Etherscan các tx ở mục 3.
- `README.md` mục 3: điền địa chỉ hợp đồng và URL DApp.
- `docs/GATE_REVIEW_1.md` phụ lục: ghi địa chỉ hợp đồng mới.
