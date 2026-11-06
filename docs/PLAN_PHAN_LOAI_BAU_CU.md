# Phạm vi xem của cuộc bầu cử (thông tin, hồ sơ ứng viên, kết quả)

> **Trạng thái: ĐÃ VIẾT MÃ VÀ KIỂM THỬ CỤC BỘ, CHƯA CHẠY TRÊN SUPABASE THẬT.** Phạm vi đã chốt với nhóm: giữ nguyên việc tổ chức phải đăng ký và được Platform Admin xác minh; **không** thêm "loại bầu cử công khai/nội bộ"; **không** đổi hợp đồng (`ProjectCore`, `OrganizationRegistry`, `VoterCardSBT` không thay đổi). Chỉ thêm ba phạm vi xem, chọn lúc tạo cuộc bầu cử. Việc cần làm trên hệ thống thật: chạy migration `20261106000002_visibility.sql`, triển khai lại Edge Function `chain-sync` (xem `docs/SUPABASE_SETUP.md`).

## 1. Ba phạm vi và ba mức

Mỗi cuộc bầu cử có ba thiết lập độc lập, mỗi thiết lập ∈ {`public`, `internal`, `restricted`}:

| Thiết lập | Che nội dung nào |
|---|---|
| Thông tin (`info`) | Mô tả, mục đích, điều kiện, ảnh bìa (nội dung hồ sơ cuộc bầu cử ngoài chuỗi) |
| Hồ sơ ứng viên (`candidates`) | Tiểu sử, quá trình, thành tích, cam kết, ảnh đại diện |
| Kết quả (`results`) | Số phiếu và người thắng **trên giao diện** |

| Giá trị | Ai xem được |
|---|---|
| `public` | Mọi người, kể cả chưa đăng nhập |
| `internal` | Thành viên đang hoạt động của tổ chức (đăng nhập bằng ví) |
| `restricted` | Người tạo cuộc, nhóm duyệt của tổ chức (luôn luôn), cộng các vai trò người tạo tích thêm: Manager, Proposer |

Người tạo và nhóm duyệt luôn xem được mọi nội dung của cuộc đó, dù chọn mức nào, để họ còn kiểm tra và duyệt được.

## 2. Chọn ở đâu, sửa đến khi nào

- **Chọn lúc tạo cuộc bầu cử** (thẻ "4 · Phạm vi xem" trong form tạo). Không phải lúc đăng ký tổ chức.
- **Sửa được đến hết pha Đăng ký** (hợp đồng cho sửa metadata đến trước pha Commit, `_editable`), trong form "Cập nhật hồ sơ giới thiệu" của người tạo. Một thay đổi sau khi đã có chữ ký duyệt ghi hash mới lên chuỗi, **xóa các chữ ký đã có** (`_resetApprovals`), nên nhóm duyệt phải ký lại. (Bản kế hoạch trước nói nội dung "khóa hẳn sau khi kích hoạt": sai; chỉ khóa từ pha Commit, và một lần sửa sau khi kích hoạt sẽ hủy kích hoạt để duyệt lại.)
- Mặc định mọi phạm vi là `public`. Cuộc cũ không có trường `visibility` được hiểu là `public`.

## 3. Cách lưu và cách ép

Thiết lập nằm trong **JSON metadata của cuộc bầu cử** (`visibility: {info, candidates, results, roles[]}`), nên được băm cùng nội dung và hash nằm trên chuỗi: không ai sửa thầm thiết lập mà không đổi hash và không làm nhóm duyệt ký lại.

```text
Trình duyệt ──lưu bản nháp──▶ metadata_history (RLS: bản nháp chỉ người tạo/Proposer/Manager thấy)
                                   │ hash nội dung khớp hash trên chuỗi
chain-sync (service_role) ─────────┴─▶ elections_chain: info/candidate/results_visibility, restricted_roles
Người xem ──▶ RLS gọi can_view_election(cuộc, phạm vi) trước khi trả nội dung
```

- `chain-sync` chỉ lấy phạm vi từ nội dung **đã khớp hash** (và khai đúng tổ chức). Nội dung chưa xác minh, không đọc được hoặc có giá trị lạ → coi là mức **chặt nhất** (`restricted`), không bao giờ nới ra công khai (`visibilityOf`, `supabase/functions/_shared/chain.ts`).
- RLS: hàm `can_view_election(p_election, p_scope)` (`SECURITY DEFINER`, `search_path` rỗng). Các policy đọc của `elections_metadata` (phạm vi `info`), `candidates_metadata` (`candidates`) và `metadata_history` dùng hàm này. Cuộc không tồn tại hoặc phạm vi lạ → `false`.
- **Ảnh/tài liệu** của phạm vi không công khai nằm ở hai bucket **riêng tư** `election-private`, `candidate-private` (`public = false`). Trong hồ sơ, URL có dạng `…/storage/v1/object/authenticated/<bucket>/<đường dẫn>`; trình duyệt xin **URL ký** sống 10 phút khi hiển thị. Policy `assets_read_private` gọi `can_read_private_asset`: chỉ trả tệp khi người đọc xem được một hàng hồ sơ có tham chiếu tới tệp đó.
- **Đổi phạm vi lúc sửa:** nếu một phạm vi chuyển giữa công khai và không công khai, ảnh hiện có được **chép sang kho đúng loại** (tải byte cũ, kiểm lại checksum, tải lên kho mới). Kho cũ không xóa được từ trình duyệt: chuyển từ công khai sang hạn chế **không thu hồi** được cái đã công khai trước đó (bản cũ của hồ sơ và ảnh cũ vẫn còn).
- **Muối (`salt`)** ngẫu nhiên 16 byte được thêm vào JSON của cuộc/ứng viên không công khai trước khi băm, vì hash lộ công khai trên chuỗi và nội dung ngắn có thể bị dò ngược.

## 4. Giới hạn kỹ thuật nói thẳng

| Nội dung | Ẩn được không | Vì sao |
|---|---|---|
| Tên cuộc bầu cử, tên ứng viên, mốc thời gian, `voterCount`, Merkle root | **Không** | Nằm trong storage và calldata trên Sepolia, đọc tự do |
| Ví ứng viên (`candidateWallets`) | **Không** | Không lưu trong storage nhưng có trong calldata giao dịch tạo |
| **Kết quả** | **Không ở tầng chuỗi** | `getVotes` không có điều kiện pha; sự kiện `Revealed(id, voter, candidateId)` công khai nên ai cũng tự cộng được. Chọn kết quả `internal/restricted` chỉ ẩn **trang kết quả trong giao diện** (mức "chỉ giao diện", không phải bảo mật) |
| Bí mật phiếu sau khi mở | **Không** | `Revealed` gắn ví với ứng viên (đã nêu trong SELF_AUDIT) |
| Mô tả, hồ sơ ứng viên, ảnh, tài liệu | **Có** | Nằm ngoài chuỗi, ép bằng RLS + kho riêng tư + URL ký |
| Hash hồ sơ | Không ẩn, nhưng không dò ngược được nếu có `salt` | Hash không phải mã hóa |

Ba mức bảo đảm, để không nói quá: *(a) ép bằng hợp đồng*: ai được bỏ phiếu (Merkle) và ai duyệt; *(b) ép bằng RLS*: ai xem được nội dung ngoài chuỗi; *(c) chỉ là giao diện*: ẩn kết quả.

Giới hạn khác: người từng thấy nội dung (khi còn công khai) vẫn có bản sao; người tạo và nhóm duyệt luôn xem được; quản trị dự án Supabase đọc được cơ sở dữ liệu.

## 5. Bảng quyền xem

| Người xem | `public` | `internal` | `restricted` |
|---|:-:|:-:|:-:|
| Người ngoài / chưa đăng nhập dữ liệu | ✅ | ❌ | ❌ |
| Thành viên đang hoạt động của tổ chức | ✅ | ✅ | chỉ nếu vai trò được tích |
| Người tạo cuộc | ✅ | ✅ | ✅ |
| Nhóm duyệt của tổ chức | ✅ | ✅ | ✅ |
| Platform Admin | ✅ | không đặc quyền | không đặc quyền |

Platform Admin **không** có thêm quyền xem hay can thiệp nào ở đây; quyền của họ vẫn chỉ là xác minh/đình chỉ tổ chức và chỉnh hạn mức.

## 6. Ai làm được gì (không đổi so với trước)

| Hành động | Platform Admin | Org Manager | Proposer | Member | Approver | Cử tri |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Xác minh/đình chỉ tổ chức | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Tạo cuộc bầu cử | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Chọn/sửa phạm vi xem | ❌ | cuộc của mình | cuộc của mình | ❌ | ❌ | ❌ |
| Duyệt / từ chối | ❌ | ❌ | ❌ | ❌ | ✅ (không phải người tạo/ứng viên) | ❌ |
| Bỏ phiếu | ❌ | theo Merkle | theo Merkle | theo Merkle | theo Merkle | ✅ (Merkle proof) |

## 7. Kiểm thử

| Bộ test | Nội dung |
|---|---|
| `npm run test:supabase` (82 ca, PGlite) | Test Y: RLS từng vai trò theo từng phạm vi, đếm hàng, bản nháp, kho riêng tư; test Z: quy tắc ghi vào bucket riêng tư; `verify_deployment.sql` thêm kiểm tra E04, E05, F10, F11, D08, D09 |
| `npx hardhat test` (201 ca) | `SupabaseFunctions.test.js`: phạm vi lấy từ nội dung đã xác minh, **fail-closed** (5 ca); `web_metadata.test.js`: JSON `visibility` và `salt` của giao diện khớp `scripts/metadata.js` |
| `scripts/e2e/visibility_ui.js` (34 ca) | Tạo cuộc với 3 phạm vi, ảnh vào kho riêng, salt; người ngoài/thành viên/Manager/Proposer/người tạo thấy đúng phần của mình; đổi phạm vi chép ảnh sang kho công khai; trang Kết quả và lịch sử bị khóa với người không có quyền. **Supabase ở đây là giả lập**: RLS thật chỉ được chứng minh bằng test PGlite. |

## 8. Việc còn lại trên hệ thống thật

1. Chạy `supabase/migrations/20261106000002_visibility.sql`, rồi `supabase/sql/verify_deployment.sql` (48 kiểm tra), triển khai lại `chain-sync`.
2. Thử với Supabase thật: ảnh vào bucket riêng tư, URL ký, `can_view_election` với ví thật (`docs/SUPABASE_SETUP.md`, Phần G, bước 6).
3. Đã loại khỏi phạm vi, chưa làm: loại bầu cử công khai, đăng ký cử tri công khai, phân phối proof theo từng ví, ẩn tên ứng viên trên chuỗi.
