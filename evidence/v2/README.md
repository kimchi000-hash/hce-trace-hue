# Bằng chứng bản V2 trên Sepolia

> **Trạng thái: CHƯA ĐIỀN.** Các bảng dưới đây để trống có chủ đích. Chỉ điền mã giao dịch thật sau khi bạn tự làm trên Sepolia và mở Etherscan đối chiếu. Không điền số liệu ước đoán.

## 1. Địa chỉ hợp đồng (lấy từ `deployments/sepolia.json`)

| Hợp đồng | Địa chỉ | Khối triển khai | Đã Verify trên Etherscan? |
| :--- | :--- | :--- | :-: |
| OrganizationRegistry | `0x1790495d1FD4c2d630298a492d58A309b23De811` | 12070353 | ☐ |
| ProjectCore | `0x7f5ab140bf0118aA263A82de9e6eb02a56f474a5` | ☐ | ☐ |
| VoterCardSBT | `0xa7071ABD96B1299330078099d30B061BC7A93DDa` | ☐ | ☐ |

Liên kết Etherscan: `https://sepolia.etherscan.io/address/<địa chỉ>`

## 2. Luồng hợp lệ (một cuộc bầu đầy đủ)

| # | Bước | Ví thực hiện | Mã giao dịch (64 ký tự hex) | Đã mở Etherscan đối chiếu |
| :-: | :--- | :--- | :--- | :-: |
| 1 | `registerOrganization` | | | ☐ |
| 2 | `verifyOrganization` (quản trị nền tảng) | | | ☐ |
| 3 | `addMember` / `addApprover` (≥ 2 đại diện) | | | ☐ |
| 4 | `createElection` | | | ☐ |
| 5 | `approveElection` (đủ ngưỡng, kích hoạt) | | | ☐ |
| 6 | `commit` (ít nhất 2 cử tri) | | | ☐ |
| 7 | `reveal` | | | ☐ |
| 8 | `result` (đọc, ghi lại kết quả) | | không phải giao dịch | ☐ |
| 9 | `mint` thẻ SBT | | | ☐ |

## 3. Ca gian lận / bị từ chối (giao dịch phải revert)

| # | Ca | Lỗi kỳ vọng | Mã giao dịch hoặc ảnh mô phỏng | Ghi chú |
| :-: | :--- | :--- | :--- | :--- |
| 1 | Ví ngoài danh sách `commit` | `InvalidProof` | | |
| 2 | Cử tri `commit` lần hai | `AlreadyCommitted` | | |
| 3 | `reveal` sai salt | `BadReveal` | | |
| 4 | Chuyển thẻ SBT | `Soulbound` | | |
| 5 | Sửa metadata khi đã sang pha Commit | `MetadataLocked` | | |
| 6 | Ví thường gọi `verifyOrganization` | `NotPlatformAdmin` | | |

## 4. Ảnh chụp cần có

- ☐ Trang web trên URL công khai (không phải localhost)
- ☐ Nhãn "Đã xác thực hash" trên thông tin ứng viên
- ☐ Thẻ cử tri hiển thị trên giao diện
- ☐ Trang Etherscan của từng giao dịch ở mục 2

## 5. Kiểm tra trước khi nộp

- ☐ Mọi mã giao dịch có đúng 64 ký tự hex (lỗi 63 ký tự từng xảy ra ở `evidence/lab-11`)
- ☐ Địa chỉ trong bảng khớp `deployments/sepolia.json` và cấu hình trong `web/index.html`
- ☐ Đã ghi rõ ví nào là quản trị nền tảng
