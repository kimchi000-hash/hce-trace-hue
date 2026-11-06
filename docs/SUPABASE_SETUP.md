# Thiết lập Supabase cho VoteChain v2 (Giai đoạn 4)

Dự án: `https://vfzuniykinaivchhuiul.supabase.co`, **project-ref = `vfzuniykinaivchhuiul`** (đúng là phần đứng trước `.supabase.co`).
Khóa `sb_publishable_…` là khóa **công khai** (được đặt ở frontend). Khóa **service_role** là **bí mật**: không dán vào chat, GitHub hay `web/index.html`. Supabase tự cấp nó cho Edge Function nên bạn không cần sao chép nó đi đâu cả.

## Danh sách file

| Loại | File | Ghi chú |
| :--- | :--- | :--- |
| SQL 1 | `supabase/migrations/20261105000001_core_schema.sql` | 9 bảng, ràng buộc, trigger. **Chạy đầu tiên** |
| SQL 2 | `supabase/migrations/20261105000002_rls_and_functions.sql` | Thu hồi quyền rồi cấp tối thiểu, RLS, hàm nonce. **Chạy thứ hai** |
| SQL 3 | `supabase/migrations/20261105000003_storage.sql` | 3 bucket công khai + policy Storage. **Chạy thứ ba** |
| SQL 4 | `supabase/migrations/20261106000001_organization_profile.sql` | Hồ sơ tổ chức đầy đủ (`organizations.profile`, hàm `save_organization_profile`). **Chạy thứ tư** |
| SQL 5 | `supabase/migrations/20261106000002_visibility.sql` | **Phạm vi xem** (thông tin / hồ sơ ứng viên / kết quả): cột phạm vi, hàm `can_view_election`, 2 bucket riêng tư, policy đọc ảnh riêng tư. **Chạy thứ năm, rồi triển khai lại `chain-sync`** |
| SQL kiểm tra | `supabase/sql/verify_deployment.sql` | Chỉ **đọc** (một câu SELECT). Chạy sau 5 file trên: 48 kiểm tra + dòng tổng kết `ZZ`, tất cả phải `ok = true` |
| SQL reset | `supabase/sql/reset_votechain_DANGEROUS.sql` | Chỉ để làm lại từ đầu, **xóa dữ liệu** |
| Hàm | `supabase/functions/wallet-auth/`, `chain-sync/`, `_shared/` | Mỗi hàm có `deno.json` riêng |
| Cấu hình | `supabase/config.toml`, `.env.example` | Chỉ giá trị công khai |

## Phần A. Chạy SQL (Dashboard, không cần cài gì)

1. Mở `https://supabase.com/dashboard/project/vfzuniykinaivchhuiul` (kiểm tra thanh địa chỉ đúng ref này).
2. Menu trái → **SQL Editor** → **New query**.
3. Mở `…000001_core_schema.sql`, chép **toàn bộ**, dán, nhấn **Run**. Phải thấy `Success. No rows returned`.
4. Làm y hệt với `…000002_rls_and_functions.sql`, `…000003_storage.sql`, `20261106000001_organization_profile.sql`, rồi `20261106000002_visibility.sql`. **Đúng thứ tự 1 → 2 → 3 → 4 → 5.** Nếu một file báo lỗi, dừng lại, chụp lỗi gửi tôi, **không** chạy file kế tiếp.
5. Dán `supabase/sql/verify_deployment.sql` vào SQL Editor → Run. File **chỉ đọc** (một câu SELECT duy nhất, không sửa dữ liệu hay cấu trúc). Kết quả gồm 48 dòng kiểm tra và dòng tổng kết `ZZ`; **cột `ok` của mọi dòng phải là `true`**. Dòng `false`: đọc cột `chi_tiet` (nó nêu đối tượng thiếu/thừa hoặc giá trị thực tế), chụp màn hình gửi tôi, **không** chạy tiếp. Các nhóm kiểm tra:
   - **A, Đối tượng**: đúng 9 bảng và 13 hàm *theo tên và chữ ký*, RLS bật, trigger, ràng buộc `candidate_id`, không còn hàm cũ trùng tên. Bảng/hàm khác trong `public` không làm sai kết quả.
   - **B, Hàm**: `search_path` rỗng, đúng 8 hàm SECURITY DEFINER, client chỉ gọi được 7 hàm tiện ích (gồm `can_view_election`, `can_read_private_asset`), hàm nonce bị khóa với `anon`/`authenticated`/PUBLIC.
   - **C, Quyền bảng**: client không ghi được bảng mirror; `organizations` chỉ UPDATE 3 cột mô tả; `metadata_history` chỉ INSERT đúng 6 cột; không TRUNCATE/TRIGGER/REFERENCES.
   - **D, Policy**: đúng 3 policy ghi trên 9 bảng, đúng điều kiện; `auth_nonces`/`sync_state` không có policy.
   - **E, Bucket**: đúng 5 bucket (3 công khai, `election-private` và `candidate-private` không công khai), mỗi bucket đúng Public, dung lượng (2 MB / 10 MB) và đúng danh sách MIME.
   - **F, Policy Storage**: `assets_read_public` (SELECT, chỉ bucket công khai), `assets_read_private` (SELECT ảnh riêng tư qua `can_read_private_asset`), `assets_insert_org_roles` (INSERT, `can_write_asset`), `assets_delete_own` (DELETE, `owner_id` + `can_write_asset`); không có policy UPDATE hay policy ghi nào khác. Dòng F09 chỉ kiểm tra *cấu trúc* cột `owner_id`; **file này không xác minh được giá trị `owner_id` thật** mà Storage API điền, việc đó cần tải file thật (Phần G).
   - Nếu F06 báo một policy ghi lạ trên `storage.objects` (ví dụ do bạn tạo trước đó cho bucket khác), đó là cảnh báo cần xem tay chứ không nhất thiết là lỗi; xem `chi_tiet` rồi quyết định.
6. Kiểm tra bằng mắt:
   - **Table Editor**: thấy 9 bảng (`organizations`, `organization_members`, `organization_approvers`, `elections_chain`, `elections_metadata`, `candidates_metadata`, `metadata_history`, `auth_nonces`, `sync_state`). Mỗi bảng phải có nhãn **RLS enabled**.
   - **Storage**: thấy `organization-assets` (2 MB), `election-assets` (10 MB), `candidate-assets` (10 MB), cả ba *Public*.
   - **Advisors → Security Advisor**: sẽ có cảnh báo mức INFO "RLS enabled, no policy" cho `auth_nonces`, `sync_state` (cố ý: chỉ service_role truy cập) và nhắc "public bucket allows listing" (cố ý: tài liệu đã công bố, không có dữ liệu cử tri). Mọi cảnh báo **ERROR** (ví dụ "RLS disabled in public") là bất thường, hãy báo lại.

Làm lại từ đầu (dự án thử nghiệm): chạy `supabase/sql/reset_votechain_DANGEROUS.sql` trong SQL Editor rồi chạy lại 3 file. **Đừng** dùng `drop schema public cascade`, lệnh đó làm hỏng quyền mặc định của Supabase.

Dùng CLI thay Dashboard (tùy chọn): `npm i -g supabase && supabase login && supabase link --project-ref vfzuniykinaivchhuiul && supabase db push`.

## Phần B. Cấu hình Authentication (bắt buộc, làm trên Dashboard)

`config.toml` chỉ có tác dụng với Supabase chạy cục bộ; dự án thật phải chỉnh tay:
1. **Authentication → Sign In / Providers → User Signups** → tắt **Allow new users to sign up**. Tài khoản chỉ do hàm `wallet-auth` tạo (admin API vẫn tạo được khi tắt).
2. Cùng trang, tắt **Allow anonymous sign-ins**.
3. **Providers → Email**: không cần bật gì thêm (không ai đăng nhập bằng email/mật khẩu; email `0x…@wallet.votechain.local` chỉ là định danh nội bộ, không bao giờ gửi thư).
4. **Authentication → URL Configuration → Site URL**: địa chỉ web của bạn (chạy thử: `http://localhost:8080`).

## Phần C. Secrets và Edge Function

1. Tạo file `supabase/.env.functions` (đã nằm trong `.gitignore`, **không commit**):
   ```
   SITE_DOMAIN=localhost:8080
   ALLOWED_ORIGINS=http://localhost:8080
   CHAIN_ID=11155111
   SYNC_SECRET=<chạy: openssl rand -hex 32>
   RATE_LIMIT_SALT=<chạy: openssl rand -hex 16>      # muối để băm IP khi giới hạn tần suất (tùy chọn; mặc định dùng SYNC_SECRET)
   ```
   Các biến `RPC_URL`, `REGISTRY_ADDRESS`, `CORE_ADDRESS`, `DEPLOY_BLOCK` thêm sau Giai đoạn 6 (khi hợp đồng đã deploy). **Không** đặt biến nào bắt đầu bằng `SUPABASE_` (Supabase tự cấp `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
2. Triển khai bằng CLI:
   ```bash
   supabase secrets set --env-file supabase/.env.functions --project-ref vfzuniykinaivchhuiul
   supabase functions deploy wallet-auth --project-ref vfzuniykinaivchhuiul
   supabase functions deploy chain-sync  --project-ref vfzuniykinaivchhuiul
   ```
   Cả hai hàm có `verify_jwt = false` (trong `config.toml`) vì tự kiểm tra danh tính; điều này cũng cần thiết vì khóa `sb_publishable_…` không phải JWT nên cổng kiểm JWT mặc định sẽ từ chối.
3. `chain-sync` trả `503` cho đến khi có `RPC_URL` và địa chỉ hợp đồng. Đó là đúng thiết kế.
4. **Sau khi chạy SQL 5, phải triển khai lại `chain-sync`** (bản mới đọc phạm vi xem từ nội dung đã khớp hash và ghi vào `elections_chain`). Nếu chưa triển khai lại, các cuộc mới có cột phạm vi mặc định là công khai.

## Phần D. Thử `wallet-auth` bằng curl

```bash
URL=https://vfzuniykinaivchhuiul.supabase.co/functions/v1/wallet-auth
curl -s $URL -H 'content-type: application/json' -d '{"action":"nonce","wallet":"0xVÍ_CỦA_BẠN"}'
```
Nhận `{nonce, message, issuedAt, expiresAt}`. Ký **nguyên văn** `message` bằng ví (`personal_sign`), rồi:
```bash
curl -s $URL -H 'content-type: application/json' \
  -d '{"action":"verify","wallet":"0x…","nonce":"…","signature":"0x…"}'      # -> {"token_hash":"…","type":"magiclink"}
```
Kỳ vọng: lần 1 `200`; **gửi lại y hệt lần 2 → `401`** (nonce đã dùng); đợi hơn 5 phút rồi verify → `401` (hết hạn); sửa 1 ký tự của chữ ký → `401`.
(Gọi từ curl không có header `Origin` nên được phép; trình duyệt chỉ được phép từ origin trong `ALLOWED_ORIGINS`.)

Phía frontend (Giai đoạn 5) chỉ dùng khóa publishable:
```js
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const { nonce, message } = await call({ action: "nonce", wallet });
const signature = await signer.signMessage(message);
const { token_hash } = await call({ action: "verify", wallet, nonce, signature });
await sb.auth.verifyOtp({ token_hash, type: "magiclink" });
```

## Phần E. Cron đồng bộ (sau Giai đoạn 6)

Mỗi 1 phút `POST https://vfzuniykinaivchhuiul.supabase.co/functions/v1/chain-sync` kèm header `x-sync-secret: <SYNC_SECRET>` (Dashboard → Integrations → Cron). Frontend cũng có thể gọi hàm này sau mỗi giao dịch (kèm phiên đăng nhập). Hàm tự giới hạn tần suất (15 giây).

## Mô hình bảo mật

- **Danh tính**: chỉ từ `app_metadata.wallet` trong JWT (chỉ service_role ghi được), không dùng `user_metadata`.
- **Nonce**: 128 bit ngẫu nhiên, sống 5 phút, dùng **một** lần (một câu `UPDATE` nguyên tử: hai request song song thì chỉ một thắng, đã thử với 25 kết nối đồng thời). Thông điệp ký (domain, chainId, nonce, thời hạn) được **server tự dựng lại** từ dòng đã lưu. Chữ ký sai không làm "cháy" nonce.
- **Cấp nonce an toàn khi đồng thời**: `issue_wallet_nonce` lấy khóa tư vấn (advisory lock) theo ví, nên nhiều request đồng thời cho cùng một ví được xếp hàng và không bao giờ vượt 10 nonce còn hiệu lực/ví (nonce cũ nhất bị loại, không từ chối). Để kẻ khác không "đẩy" nonce của bạn ra khỏi hàng, còn có giới hạn theo **người gọi**: mỗi IP (chỉ lưu bản băm) được cấp tối đa 5 nonce/phút cho mỗi ví. Người dùng ở IP khác không bị ảnh hưởng.
- **Bản nháp metadata**: tối đa 200 bản chưa lên chuỗi mỗi ví, kiểm tra dưới khóa theo ví nên 20 INSERT đồng thời vẫn dừng đúng ở 200. Giới hạn chỉ áp dụng cho client; `chain-sync` (service_role) không bị giới hạn và không lấy khóa.
- **Tách tổ chức**: mọi policy lấy ví từ JWT rồi kiểm tra vai trò **theo từng tổ chức**; thành viên tổ chức A không đọc được danh sách thành viên, bản nháp của B, không sửa mô tả B, không tải file vào thư mục của B (có test).
- **Bảng mirror** chỉ `chain-sync` ghi. Nội dung ngoài chuỗi chỉ được hiển thị "đã xác minh" khi hash tính lại khớp hash trên chuỗi **và** khai đúng tổ chức.
- **Storage**: ba bucket **Public** theo thiết kế (ai có URL đều xem được, không cần đăng nhập). Vì vậy **mọi file tải lên đều thành công khai**: chỉ đưa ảnh logo/ảnh bìa/ảnh ứng viên và tài liệu đã được phép công bố; tuyệt đối không đưa danh sách cử tri, CCCD, hay tài liệu riêng tư. Giao diện (Giai đoạn 5) phải cảnh báo điều này trước khi tải lên. Chỉ nhận png/jpg/webp (+pdf cho tài liệu), không svg/html. Không có policy UPDATE nên không ghi đè, đổi tên, chuyển thư mục hay chuyển bucket; sao chép phải vào đúng thư mục tổ chức của mình; xóa chỉ khi bạn là người tải lên **và** vẫn còn quyền.
- **Quyền khớp hợp đồng**: Manager sửa mô tả tổ chức chỉ khi tổ chức `Verified` (như `onlyManager`); tải file/bản nháp cần Proposer/Manager của tổ chức `Verified` (như `canPropose`); logo cần Manager. Thêm/xóa thành viên, đại diện chỉ làm được trên hợp đồng.

## Giới hạn đã biết (không giấu)

1. **Độ trễ đồng bộ**: người bị gỡ khỏi tổ chức trên chuỗi vẫn có thể tải bản nháp/file lên Supabase cho tới lần `chain-sync` kế tiếp. Họ không thay đổi được gì trên hợp đồng, và bản nháp chỉ dùng được nếu khớp hash do người có quyền ghi lên chuỗi. Giảm nhẹ: cron 1 phút.
2. **Mô tả tổ chức** (`description`, `logo_url`) là thông tin hiển thị, **không** được bảo vệ bởi `infoHash` trên chuỗi.
3. **Phishing đăng nhập**: thông điệp ký nêu domain nhưng ví thông thường không tự đối chiếu domain với trang đang mở (khác SIWE đầy đủ). Người dùng cần kiểm tra domain trong cửa sổ ký.
4. **Tài khoản**: ai ký được bằng một ví đều tạo được tài khoản Supabase; quyền vẫn do vai trò tổ chức quyết định.
5. **Khóa đăng nhập bằng spam không thể loại trừ hoàn toàn**: kẻ tấn công dùng nhiều IP vẫn có thể liên tục đẩy nonce của một ví mục tiêu. Chi phí tăng (5 nonce/phút/IP/ví, cần ≥ 10 nonce mới để đẩy một nonce) nhưng không bằng 0; nên bật giới hạn tần suất ở tầng nền tảng nếu cần. Người dùng bị ảnh hưởng chỉ cần bấm đăng nhập lại.
6. **Giới hạn theo người gọi dựa vào header IP** do hạ tầng Supabase đặt (`cf-connecting-ip` / `x-forwarded-for`). Nếu thiếu header, chỉ còn giới hạn theo ví. Nhiều sinh viên chung một IP (mạng trường) dùng chung hạn mức 5 nonce/phút **cho mỗi ví**, không phải cho cả IP.
7. Checksum trong tên file không tự kiểm được bằng policy; frontend phải tính lại. Bucket công khai cho phép liệt kê file (policy `assets_read_public`); nếu muốn chống liệt kê, đổi policy này thành `owner_id = (select auth.jwt() ->> 'sub')` sau khi đã thử upload/xóa thật trên dự án (xem mục Storage bên dưới).
8. Mỗi lần đồng bộ đọc tuần tự mọi tổ chức và cuộc bầu cử qua RPC; ổn với quy mô đồ án, cần phân trang nếu hàng trăm cuộc bầu cử.

### Về Storage `owner_id` (đã xác minh đến đâu)

Tài liệu Supabase xác nhận: tải lên chỉ cần quyền `INSERT`; ghi đè (`upsert`) cần thêm `SELECT` và `UPDATE`; ví dụ chính thức so `owner_id` với `auth.jwt()->>'sub'` (policy xóa của ta dùng đúng biểu thức này). **Không** tìm thấy tài liệu nào mô tả chính xác cách Storage API điền `owner_id`, hay câu SQL mà `move`/`copy`/`remove` thực thi. Vì vậy phần này đã được thử bằng PostgreSQL với bảng `storage.objects` giả lập, và **phải thử lại bằng thao tác thật** (Phần G).

## Phần G. Thử Storage thật (giao diện Giai đoạn 5 đã có đăng nhập: dùng mục Tổ chức → Logo, hoặc Tạo cuộc bầu cử → Ảnh bìa)

Với phiên đăng nhập của một Manager đã `Verified`:
1. Tải `1/logo/0x<64 hex>.png` (đúng tổ chức) → thành công. Thử `2/logo/…` (tổ chức khác), `1/logo/abc.png`, `1/logo/0x….svg` → đều bị từ chối.
2. Tải lại **cùng tên** với `upsert: true` → phải bị từ chối.
3. `move(...)` sang tên/thư mục khác → phải bị từ chối. `copy(...)` sang thư mục tổ chức khác → bị từ chối.
4. Xem hàng vừa tải trong **Storage → file → Details** hoặc SQL Editor: `select name, owner_id from storage.objects order by created_at desc limit 5;` → `owner_id` phải đúng bằng `id` người dùng (Authentication → Users). Nếu `owner_id` rỗng hoặc khác, báo tôi ngay (khi đó xóa file sẽ bị từ chối, an toàn nhưng không dùng được).
5. Đăng nhập bằng Manager của tổ chức khác, thử `remove` file đó → phải bị từ chối.
6. **Phạm vi xem (SQL 5)**: tạo một cuộc bầu cử với ảnh bìa, chọn "Thông tin: Nội bộ". Ảnh phải nằm ở bucket `election-private` (URL trong hồ sơ dạng `…/storage/v1/object/authenticated/election-private/…`). Ví không thuộc tổ chức: mở trang cuộc bầu cử không thấy mô tả và ảnh, mở thẳng liên kết `authenticated` bị từ chối. Ví là thành viên đang hoạt động: sau khi bấm "Đăng nhập dữ liệu" thấy mô tả và ảnh (ảnh qua URL ký sống 10 phút). Chọn "Kết quả: Hạn chế": ví không có quyền thấy thông báo khóa ở trang Kết quả, nhưng sự kiện `Revealed` trên Etherscan vẫn công khai (đó là giới hạn của chuỗi khối, không phải lỗi).

## Kiểm thử

```bash
npm run test:supabase                  # 82 test: migration, RLS, ma trận quyền, Storage, nonce, và verify_deployment.sql (PGlite)
npx hardhat test test/SupabaseFunctions.test.js test/SupabaseSync.test.js   # logic dùng chung + đồng bộ chuỗi -> Supabase (CSDL giả)
npm i --no-save embedded-postgres pg   # chỉ một lần; KHÔNG chạy bằng quyền root
npm run test:supabase:pg               # 7 test truy cập ĐỒNG THỜI trên PostgreSQL thật (nhiều kết nối)
```
Test đồng thời chạy mỗi tình huống 3 bản (hàm thật; hàm thật + `pg_sleep` kéo dài khe race; hàm bỏ khóa + `pg_sleep`) và đòi bản cuối **phải vượt** giới hạn, để chứng minh test đủ nhạy bắt lỗi.

**Chưa kiểm thử được ở môi trường này** (phải tự kiểm trên Supabase thật, theo Phần A.5, D, G): `Deno.serve` và API `auth.admin.createUser/generateLink`, `verifyOtp`, PostgREST thật, RPC Sepolia thật, giới hạn dung lượng/MIME và hành vi `owner_id` của Storage API thật. PostgreSQL trong test là bản thật (14+), nhưng schema `auth` và `storage` được giả lập tối thiểu. Máy chủ kiểm thử không truy cập được `supabase.co`; việc hai hàm đã chạy trên dự án thật được xác nhận bằng lệnh bạn chạy ở Phần D.

## Phần H. Chạy giao diện `web/index.html` với Supabase

1. **Phải mở trang bằng máy chủ, không mở file trực tiếp** (file:// không có origin nên bị chặn). Trong thư mục dự án:
   ```powershell
   python -m http.server 8080 --directory web
   ```
   rồi mở `http://localhost:8080`. Địa chỉ này phải **trùng** `SITE_DOMAIN` (`localhost:8080`) và nằm trong `ALLOWED_ORIGINS` ở bước secrets (Phần C). Khi đưa lên tên miền thật, đổi cả hai secret rồi deploy lại `wallet-auth`.
2. Mở `web/index.html?contract=<địa chỉ ProjectCore>&chain=11155111` (hoặc dán địa chỉ vào ô trên trang). Giao diện tự đọc địa chỉ `OrganizationRegistry` từ `ProjectCore.registry()`, **chỉ cần một địa chỉ**.
3. Trong `index.html` chỉ có URL dự án và khóa **publishable** (công khai). Không bao giờ dán `service_role` hay secret key vào file này.
4. Nút **Đăng nhập dữ liệu** (trên cùng) yêu cầu ký một thông điệp, không tốn gas. Giao diện kiểm tra thông điệp đúng ví, nonce và chainId rồi mới cho ký. Phiên đăng nhập chỉ lưu trong tab (sessionStorage) và gắn với đúng ví đang kết nối.
5. Tệp tải lên (logo, ảnh bìa, ảnh ứng viên) nằm ở kho **công khai** và không thu hồi được. Giao diện có cảnh báo ngay cạnh nút gửi.
6. Nội dung chỉ được **xác thực** khi `chain-sync` đã đồng bộ (cần Giai đoạn 6: địa chỉ hợp đồng, `RPC_URL`, cron). Trước đó, tổ chức chưa có trong Supabase nên chưa lưu được bản nháp; hãy bỏ chọn “Lưu nội dung” và giữ file metadata (JSON) tải về.

**Kiểm thử giao diện:** `scripts/e2e/phase5_ui.js` (Hardhat cục bộ + Playwright, 51 kiểm tra) chạy toàn bộ luồng tổ chức, tạo cuộc bầu cử, duyệt/từ chối/rút/hết hạn, xác thực hash và bỏ phiếu. **Supabase trong script này là giả lập**, nên nó chỉ chứng minh giao diện nói đúng giao thức, không chứng minh Supabase thật chấp nhận (CORS, `verifyOtp`, Storage, PostgREST).

