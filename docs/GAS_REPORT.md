# BÁO CÁO GAS — VoteChain (ProjectCore, OrganizationRegistry, VoterCardSBT)

- **Cách đo:** `npm run gas` (Hardhat, `scripts/gas_report.js`). Solidity 0.8.20, **optimizer tắt** (khớp cách biên dịch mặc định trên Remix).
- **Kịch bản:** 500 cử tri, cây Merkle sâu 9 tầng, 5 ứng viên, tổ chức có 3 đại diện duyệt (ngưỡng 2/3 = 2). Cử tri 1 và 2 cùng bỏ phiếu cho một ứng viên để thấy chênh lệch giữa phiếu đầu và phiếu sau.
- **Hai phần:** mục 1 là số đo của **bản hiện tại (V2)**; mục 2 trở đi là lịch sử tối ưu của bản đầu (một cuộc bầu cử, đo ở Lab 17) để giữ nguyên bằng chứng cho phần "tối ưu".

## 1. Bản hiện tại (V2): nhiều tổ chức, người duyệt theo tổ chức, hồ sơ có hash, thẻ cử tri

| Thao tác | Gas | Ai trả | Ghi chú |
| :--- | ---: | :--- | :--- |
| Triển khai `OrganizationRegistry` | 3 488 529 | Nhóm (một lần) | |
| Triển khai `ProjectCore` | 4 754 314 | Nhóm (một lần) | Gồm hàng chờ duyệt, hạn mức chống spam, hash hồ sơ |
| Triển khai `VoterCardSBT` | 3 736 059 | Nhóm (một lần) | Đo với SVG dự phòng trên chuỗi (không ảnh ngoài); bản thật dùng ảnh IPFS |
| `registerOrganization` | 229 129 | Chủ tổ chức | |
| `verifyOrganization` | 33 080 | Quản trị nền tảng | |
| `addMember` / `addApprover` | 104 490 / 83 370 | Manager | Mỗi thành viên, mỗi đại diện |
| `createElection` | 1 011 904 | Người tạo (Proposer/Manager) | 5 ứng viên: ghi tên, 6 hash hồ sơ, chụp nhóm duyệt, xếp hàng chờ |
| `approveElection` (chưa đủ / kích hoạt) | 84 019 / 100 023 | Mỗi đại diện | Chữ ký đủ ngưỡng kích hoạt cuộc bầu cử |
| `rejectElection` | 86 406 | Đại diện | Phiếu từ chối đủ nhiều thì yêu cầu bị đóng |
| `updateElectionMetadata` (đặt lại 1 chữ ký) | 73 065 | Người tạo | Chỉ trong pha Đăng ký; xóa mọi chữ ký đã có |
| `updateCandidateMetadata` | 53 457 | Người tạo | Như trên |
| `commit` | ≈ 68 630 | Cử tri | Chứng minh Merkle 9 tầng |
| `reveal` (phiếu đầu của ứng viên / phiếu sau) | 89 862 / 55 662 | Cử tri | |
| `mint` thẻ cử tri | 128 245 | Cử tri đã mở phiếu | Tùy chọn; không ảnh hưởng kết quả |
| `result` (hàm đọc) | ≈ 37 800 | Không tốn | Chỉ ước lượng |

**Nhận xét.**
- `createElection` tăng từ 593 nghìn (bản đầu) lên ≈ 1,01 triệu vì V2 ghi thêm hash hồ sơ cuộc bầu cử và từng ứng viên (mỗi hash và số phiên bản là một ô lưu trữ mới, khoảng 20 nghìn gas mỗi ô) và chụp nhóm duyệt của tổ chức. Đây là chi phí một lần của người tạo, không phải của cử tri.
- Chi phí của **cử tri** gần như không đổi so với bản đầu: `commit` ≈ 68,6 nghìn, `reveal` 55,7–89,9 nghìn. Cử tri chỉ trả thêm khi tự chọn nhận thẻ (128 nghìn).
- `approveElection` đắt hơn bản đầu (≈ 84–100 nghìn so với 79–84 nghìn) vì V2 kiểm tra thêm phiếu từ chối và gỡ cuộc bầu cử khỏi hàng chờ khi kích hoạt (xem `approveElection`).
- Quy đổi: với giá gas 20 Gwei và ETH 3 000 USD, một cử tri trả ≈ (68 630 + 55 662) × 20 × 10⁻⁹ × 3 000 ≈ 7,5 USD cho cả commit và reveal trên mạng chính. Trên Sepolia là ETH thử nghiệm nên miễn phí; đây là lý do sản phẩm chỉ khả thi ở quy mô lớp/CLB trên mạng L1 hoặc cần chạy trên L2 (xem `ECONOMIC_RULES.md`).

Số liệu thô của lần đo này lấy bằng `npm run gas`; mỗi lần chạy có sai lệch rất nhỏ (vài chục gas) do địa chỉ cử tri sinh ngẫu nhiên.

## 2. Lịch sử tối ưu của bản đầu (một cuộc bầu cử, Lab 17)

### 2.1 Bảng so sánh (trước và sau tối ưu)

| Thao tác | Trước | Giữa | Sau (hiện tại) | Sau − Trước |
| :--- | ---: | ---: | ---: | ---: |
| Triển khai | 2 562 057 | 2 604 761 | **2 619 144** | +57 087 (+2,23%) |
| `createElection` | 595 819 | 593 193 | **593 264** | −2 555 (−0,43%) |
| `approveElection` (chưa đủ) | 79 525 | 79 525 | **79 525** | 0 |
| `approveElection` (kích hoạt) | 83 753 | 83 753 | **83 753** | 0 |
| `commit` (cử tri 1) | 69 781 | 68 625 | **68 652** | −1 129 (−1,62%) |
| `commit` (cử tri 2) | 69 759 | 68 615 | **68 642** | −1 117 (−1,60%) |
| `reveal` (phiếu đầu của ứng viên) | 109 446 | 109 446 | **89 927** | −19 519 (−17,83%) |
| `reveal` (phiếu sau) | 75 246 | 75 246 | **55 727** | −19 519 (−25,94%) |
| `result` (ước lượng, hàm đọc) | 37 887 | 37 887 | **37 887** | 0 |

### 2.2 Đã đổi gì và vì sao

1. **Bỏ `mapping hasRevealed`, dùng giá trị đánh dấu `REVEALED` ghi đè lên `commitments`** (lợi ích lớn nhất, −19 519 gas mỗi lần mở phiếu). Trước đây mở phiếu ghi một ô lưu trữ **mới** (cờ `0 → 1`, khoảng 22 nghìn gas). Nay hợp đồng ghi đè ô cam kết **đã có và vừa được đọc** (đổi giá trị, khoảng 3 nghìn gas) và không còn đọc ô cờ riêng. Hàm `hasRevealed(id, voter)` giữ nguyên chữ ký như một hàm đọc, nên giao diện và test cũ không đổi. Đổi lại, `commit` phải chặn cam kết trùng với giá trị đánh dấu (`InvalidParams`), có test riêng.
2. **Vòng lặp: đọc `length` một lần và `unchecked { ++i; }`** (−1,1 nghìn gas mỗi `commit`, −2,6 nghìn mỗi `createElection`). Chỉ áp dụng cho biến đếm có điều kiện `i < n` nên không thể tràn số.
3. **Giới hạn `MAX_PHASE_MINUTES`, `MAX_VOTERS`** không nhằm tiết kiệm gas mà chặn tham số vô lý (xem `SELF_AUDIT.md` TB4). `MAX_VOTERS` thêm khoảng 14 nghìn gas lúc triển khai và vài chục gas ở `createElection`/`reveal`.

### 2.3 Đánh đổi (nói thẳng)

- **Triển khai đắt hơn 2,23%** (thêm hằng số, thêm điều kiện kiểm tra, thêm hàm `hasRevealed`). Đây là chi phí một lần; mỗi cử tri tiết kiệm ≈ 20,6 nghìn gas ở hai giao dịch gộp lại, nên bù lại sau ≈ 3 cử tri.
- Với 60 cử tri, tổng tiết kiệm ≈ 60 × 20,6 nghìn − 57 nghìn ≈ 1,18 triệu gas mỗi cuộc bầu cử.
- Không dùng optimizer của trình biên dịch để số liệu khớp Remix; bật optimizer sẽ giảm thêm đáng kể nhưng không phải là thay đổi của nhóm nên không tính vào bảng.
- Tất cả thay đổi giữ nguyên hành vi: bộ test lúc đó (77 ca) chạy xanh ở cả ba mốc; bộ test hiện tại có 201 ca.

## 3. Tái lập

```bash
npm install
npm run gas            # in bảng đo
GAS_JSON=1 npx hardhat run scripts/gas_report.js   # xuất JSON
```

Số liệu thô của ba mốc: [`gas-data/1-truoc.json`](gas-data/1-truoc.json), [`2-giua.json`](gas-data/2-giua.json), [`3-sau.json`](gas-data/3-sau.json). Cột "Trước" đo trên bản hợp đồng gốc của nhóm trước khi tối ưu; chỉ cột "Sau" tái lập được bằng mã hiện tại.
