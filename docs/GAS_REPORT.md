# BÁO CÁO GAS — ProjectCore (trước và sau tối ưu)

- **Cách đo:** `npm run gas` (Hardhat, `scripts/gas_report.js`). Solidity 0.8.20, **optimizer tắt** (khớp cách biên dịch mặc định trên Remix).
- **Kịch bản:** 500 cử tri, cây Merkle sâu 9 tầng, 2 ứng viên, 1 người duyệt. Cử tri 1 và 2 cùng bỏ phiếu để thấy chênh lệch giữa phiếu đầu và phiếu sau của một ứng viên.
- **Ba mốc:** *Trước* = hợp đồng gốc (có `mapping hasRevealed`, vòng lặp có kiểm tra tràn số), *Giữa* = chỉ bỏ kiểm tra tràn số thừa và đệm độ dài mảng, *Sau* = bản hiện tại.

## 1. Bảng so sánh

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

## 2. Đã đổi gì và vì sao

1. **Bỏ `mapping hasRevealed`, dùng giá trị đánh dấu `REVEALED` ghi đè lên `commitments`** (lợi ích lớn nhất, −19 519 gas mỗi lần mở phiếu). Trước đây mở phiếu ghi một ô lưu trữ **mới** (cờ `0 → 1`, khoảng 22 nghìn gas). Nay hợp đồng ghi đè ô cam kết **đã có và vừa được đọc** (đổi giá trị, khoảng 3 nghìn gas) và không còn đọc ô cờ riêng. Hàm `hasRevealed(id, voter)` giữ nguyên chữ ký như một hàm đọc, nên giao diện và test cũ không đổi. Đổi lại, `commit` phải chặn cam kết trùng với giá trị đánh dấu (`InvalidParams`), có test riêng.
2. **Vòng lặp: đọc `length` một lần và `unchecked { ++i; }`** (−1,1 nghìn gas mỗi `commit`, −2,6 nghìn mỗi `createElection`). Chỉ áp dụng cho biến đếm có điều kiện `i < n` nên không thể tràn số.
3. **Giới hạn `MAX_PHASE_MINUTES`, `MAX_VOTERS`** không nhằm tiết kiệm gas mà chặn tham số vô lý (xem `SELF_AUDIT.md` TB4). `MAX_VOTERS` thêm khoảng 14 nghìn gas lúc triển khai và vài chục gas ở `createElection`/`reveal`.

## 3. Đánh đổi (nói thẳng)

- **Triển khai đắt hơn 2,23%** (thêm hằng số, thêm điều kiện kiểm tra, thêm hàm `hasRevealed`). Đây là chi phí một lần; mỗi cử tri tiết kiệm ≈ 20,6 nghìn gas ở hai giao dịch gộp lại, nên bù lại sau ≈ 3 cử tri.
- Với 60 cử tri, tổng tiết kiệm ≈ 60 × 20,6 nghìn − 57 nghìn ≈ 1,18 triệu gas mỗi cuộc bầu cử.
- Không dùng optimizer của trình biên dịch để số liệu khớp Remix; bật optimizer sẽ giảm thêm đáng kể nhưng không phải là thay đổi của nhóm nên không tính vào bảng.
- Tất cả thay đổi giữ nguyên hành vi: bộ test (77 ca) chạy xanh ở cả ba mốc.

## 4. Tái lập

```bash
npm install
npm run gas            # in bảng đo
GAS_JSON=1 npx hardhat run scripts/gas_report.js   # xuất JSON
```

Số liệu thô của ba mốc: [`gas-data/1-truoc.json`](gas-data/1-truoc.json), [`2-giua.json`](gas-data/2-giua.json), [`3-sau.json`](gas-data/3-sau.json). Cột "Trước" đo trên bản hợp đồng gốc của nhóm trước khi tối ưu; chỉ cột "Sau" tái lập được bằng mã hiện tại.
