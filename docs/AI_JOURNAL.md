# NHẬT KÝ LÀM VIỆC VỚI AI — Club Voting (ECO2432)

Mỗi mục ghi: công cụ, prompt, AI trả về, đánh giá, chỗ sai, cách sửa, **ai phát hiện**. Các mục Lab 09–13 giữ nguyên như đã nộp (hợp đồng lúc đó là bản một cuộc bầu cử, dùng `registerVoters`; xem `GATE_REVIEW_1.md` phụ lục về thay đổi thiết kế sau đó).

## Lab 09 — Sinh mã và biên dịch hợp đồng lõi ProjectCore.sol
- **Công cụ:** Antigravity IDE (Gemini).
- **Yêu cầu:** Sinh mã hệ thống bỏ phiếu Club Voting từ `docs/SPEC.md` kế thừa `SimpleVoting.sol`.
- **Đánh giá:** Phải sửa trước khi biên dịch.
- **Chỗ sai:** Dòng 21 khai báo biến dính liền chuỗi `adminowner;` dẫn đến lỗi cú pháp ParserError.
- **Cách sửa:** Sửa thủ công thành `address public admin;`.
- **Ai phát hiện:** Sinh viên phát hiện.
- **Kết quả biên dịch:** Biên dịch thành công trên Remix IDE với compiler 0.8.20+, sinh đủ ABI và Bytecode trong artifacts/.


## Lab 10 — Rà soát mã nguồn do AI sinh ra (Audit ProjectCore.sol & VaultBuggy.sol)

### Bảng ghi nhận lỗi rà soát
| Lỗi | Mô tả | Ai phát hiện | Cách khắc phục |
| :---: | :--- | :---: | :--- |
| **1** | `VaultBuggy.sol`: Rút tiền chuyển ETH trước khi cập nhật số dư (Lỗ hổng Reentrancy). | AI / Sinh viên | Áp dụng Checks-Effects-Interactions: trừ số dư trước khi gửi tiền. |
| **2** | `VaultBuggy.sol`: Hàm khẩn cấp thiếu kiểm tra quyền `onlyOwner`. | AI | Bổ sung modifier `onlyOwner` kiểm tra quyền `msg.sender`. |
| **3** | `ProjectCore.sol`: Hàm `registerVoters` nhận mảng rỗng gây lãng phí gas không cần thiết. | AI | Bổ sung điều kiện kiểm tra `if (voters.length == 0) revert EmptyVoterList();`. |
| **4** | `ProjectCore.sol`: Hàm `vote()` chưa kiểm tra giới hạn `candidateId` bằng custom error. | **Sinh viên** | Bổ sung kiểm tra `if (candidateId >= candidates.length) revert InvalidCandidate();`. |

## Lab 11 — Nâng cấp Bầu cử kín Commit - Reveal có Quorum & Thực nghiệm Sepolia
- **Công cụ:** Antigravity IDE (Gemini).
- **Yêu cầu:** Nâng cấp kiến trúc hợp đồng `ProjectCore.sol` lên bầu cử kín 2 pha (Commit - Reveal) kết hợp Quorum basis points, chuẩn bị triển khai mạng Sepolia Testnet.
- **Đánh giá:** Dùng được sau khi tinh chỉnh logic bảo mật hàm băm.
- **Chỗ sai / Rủi ro bảo mật:** Ban đầu hàm băm `commitment` chưa ràng buộc địa chỉ ví `msg.sender`, dẫn đến nguy cơ cử tri khác sao chép mã băm trong mempool để bỏ phiếu theo (Copy-voting). Ngoài ra, tham số `_quorumBps` chưa chặn giới hạn trên 10,000 bps.
- **Cách sửa:** Sinh viên yêu cầu AI cập nhật mã băm thành `keccak256(abi.encodePacked(candidateId, salt, msg.sender))` và thêm điều kiện `if (_quorumBps > 10_000) revert InvalidParams();`.
- **Ai phát hiện:** Sinh viên phát hiện và yêu cầu khắc phục.
- **Kết quả thực nghiệm:** Triển khai thành công trên Sepolia (`0x7D3bC21A8532d2011cF970C0701413C236C53Ddd`), ghi nhận 1 ca hợp lệ (Block 11899220) và 1 ca vi phạm bị revert (Block 11899237).

## Lab 12 — Thẩm định Hồ sơ Gate Review 1 & Khóa Phạm vi (Scope Lock)
- **Công cụ:** Antigravity IDE (Gemini).
- **Yêu cầu:** Rà soát toàn bộ codebase, đối soát 5/5 tiêu chuẩn sức khỏe repo, xây dựng kịch bản thuyết trình demo 3 phút và khóa phạm vi cho giai đoạn Lab 13–15.
- **Đánh giá:** Dùng được, hỗ trợ lập cấu trúc biên bản Gate Review 1 chuẩn xác.
- **Điểm cần lưu ý:** AI đề xuất thêm các tính năng mở rộng như token quản trị ERC-20 và bầu cử nhiều vòng. Nhóm nhận định các tính năng này làm phình to mã nguồn vượt mức 150 dòng và tạo rủi ro phân tán nguồn lực.
- **Cách sửa:** Sinh viên chủ động quyết định cắt bỏ các tính năng đầu cơ (Out-of-scope), giữ hợp đồng tinh gọn 125 dòng mã, tập trung kiểm thử chuyên sâu và giao diện Web DApp cho giai đoạn Lab 13–15.
- **Ai phát hiện:** Sinh viên chủ động ra quyết định quản trị phạm vi (Scope Lock).
- **Kết quả nghiệm thu:** Đạt 5/5 tiêu chuẩn sức khỏe Repo, đề tài được phê duyệt ở mức Nâng cao (Qua / Approved).

## Lab 13 — Thẩm định An ninh, Phân tích Lỗ hổng Reentrancy & Kiểm thử Phân quyền (Negative Test)
- **Công cụ:** Antigravity IDE (Gemini).
- **Yêu cầu:** Phân tích cơ chế khai thác Reentrancy qua hàm `receive()` trong `VulnerableBank.sol`, so sánh 2 phương án khắc phục (CEI vs ReentrancyGuard), vá lỗi bằng mô hình Checks-Effects-Interactions, và xây dựng kịch bản kiểm thử Hardhat bắt mã lỗi `NotAdmin()` cho `ProjectCore.sol`.
- **Đánh giá:** Dùng được, hỗ trợ chuẩn hóa nguyên tắc Checks-Effects-Interactions và kịch bản test tự động.
- **Chỗ sai / Rủi ro an ninh đối chiếu:** Trong `VulnerableBank.sol`, lệnh `msg.sender.call{value: balance}("")` nằm trước `balances[msg.sender] = 0;`, cho phép `Attacker.receive()` gọi tái nhập hàm `withdraw()` rút cạn toàn bộ 6 ETH. Đối chiếu với hợp đồng đồ án `ProjectCore.sol`, nhóm kiểm tra thấy hàm `reveal()` đã tuân thủ đúng nguyên tắc CEI khi gán `hasRevealed[msg.sender] = true;` trước khi ghi nhận cộng dồn phiếu bầu.
- **Cách sửa:** Đưa lệnh `balances[msg.sender] = 0;` lên trước lệnh `call` trong `VulnerableBank.sol`. Viết kịch bản test tự động `test/ProjectCore.test.js` sử dụng `expect(...).to.be.revertedWithCustomError(projectCore, "NotAdmin")` để chứng minh cơ chế phân quyền hoạt động tin cậy.
- **Ai phát hiện:** Sinh viên và AI phối hợp rà soát thực nghiệm trên Remix VM.
- **Kết quả nghiệm thu:** Bản vá triệt tiêu hoàn toàn lỗ hổng Reentrancy; kịch bản test tự động bắt chính xác lỗi `NotAdmin()` khi tài khoản lạ cố can thiệp danh sách cử tri.


## Lab 15–17 — Đối chiếu sổ tay, đồng bộ mã–tài liệu–giao diện, kiểm thử và đo gas

- **Công cụ:** Claude (Claude Code, mô hình Sonnet 5.5), chạy trên bản sao repo của nhóm; không có quyền ghi lên GitHub.
- **Prompt 1 (nguyên văn):** "tôi mới tải lên nguồn sổ tay sinh viên, đây là học phần tiền điện tử và hợp đồng thông minh, nhóm chúng tôi đã chọn đề tài là bẩu cử và làm trên repo github với hce trace hue, bạn có thể đã đọc qua, bây giờ bạn đối chiếu xem thử là tiến độ đồ án hiện tại tôi ổn chưa, cần bổ sung gì để điểm cao không, vì tôi cảm thấy chưa ổn lắm. như phần spec hay nhiều phần khác trong repo nhóm"
- **AI trả về:** bản đối chiếu repo với sổ tay, nêu các lệch pha lớn giữa mã và tài liệu; đưa hai hướng (A: quay về hợp đồng ~125 dòng khớp tài liệu; B: giữ hợp đồng 287 dòng và sửa mọi thứ cho khớp).
- **Prompt 2 (nguyên văn):** "có thể quá 150 dòng như phải hoàn hảo. tôi cần đồ án điểm cao"
- **AI trả về:** thực hiện hướng B: kiểm thử, đo gas, tối ưu nhỏ, viết lại giao diện, viết lại tài liệu.
- **Đánh giá:** Dùng được sau khi chạy lại và đối chiếu; sinh viên phải tự đọc và giải thích được từng thay đổi trước buổi vấn đáp.

### Bảng phát hiện của lần làm việc này

| # | Phát hiện | Bằng chứng | Ai phát hiện | Xử lý |
| :-: | :--- | :--- | :---: | :--- |
| 1 | Tài liệu (SPEC, ECONOMIC_RULES, README, GATE_REVIEW) mô tả hợp đồng 125 dòng với `registerVoters`/`isVoter`, trong khi mã trong repo là bản nhiều cuộc bầu cử có Merkle và người duyệt (`createElection`, `approveElection`) | So tên hàm/lỗi trong tài liệu với `ProjectCore.sol` | **AI phát hiện** | Viết lại SPEC v3.0, ECONOMIC_RULES v3.0; thêm bài test đối chiếu ABI |
| 2 | Giao diện `web/index.html` gọi `commit(bytes32)`, `reveal(uint256,bytes32)`, `phase()` và địa chỉ cũ, không còn khớp hợp đồng hiện tại | So ABI trong HTML với ABI biên dịch | **AI phát hiện** | Viết lại `web/` (config.js, abi.js, app.js); chạy thử đầu cuối 14 bước trên Hardhat; địa chỉ để trống chờ deploy mới |
| 3 | Test cũ (`test/ProjectCore.test.js`) kiểm `NotAdmin()` — lỗi không còn trong hợp đồng hiện tại — nên không bao phủ hợp đồng đang nộp | So tên lỗi trong test với ABI biên dịch | **AI phát hiện** | Viết lại bộ test: nhóm A–H (luồng đúng, biên, gian lận, Merkle); nay 77 ca xanh |
| 4 | `voterCount` không có trần: giá trị rất lớn làm `result()` tràn số và revert vĩnh viễn (TB4) | Đọc hạng mục 4 của danh mục Lab 14, viết test tái hiện | **AI phát hiện**, nhóm xác nhận bằng test | Thêm `MAX_VOTERS = 1 000 000` + test |
| 5 | `evidence/lab-11/README.md` ghi TxHash ca 2 chỉ 63 ký tự hex (không hợp lệ); `GATE_REVIEW_1.md` ghi 64 ký tự | Đếm ký tự | **AI phát hiện** | Sửa theo bản 64 ký tự **nhưng nhóm phải mở Etherscan đối chiếu lại** |
| 6 | Giao dịch Lab 11 gọi `commit(0x1111…)` là cam kết giả, chưa có đủ vòng commit → reveal → result trên Sepolia | Đọc evidence lab-11 | **AI phát hiện** | Ghi chú trung thực trong evidence; chuẩn bị `SEPOLIA_RUNBOOK.md` để nhóm tự làm bản đầy đủ |
| 7 | Tối ưu gas: mapping `hasRevealed` có thể thay bằng giá trị đánh dấu ghi đè lên `commitments` (−19,5 nghìn gas mỗi lần mở phiếu) | Đo trước/sau, `GAS_REPORT.md` | **AI đề xuất**, test xác nhận hành vi không đổi | Áp dụng, giữ hàm `hasRevealed()` cho tương thích |

### Chỗ AI làm sai hoặc phải chỉnh

- Bản tối ưu đầu tiên (chỉ bỏ kiểm tra tràn số ở vòng lặp) **làm triển khai đắt hơn ≈ 1,7%** mà chỉ tiết kiệm ≈ 1,1 nghìn gas mỗi `commit`; lợi ích thật nằm ở thay đổi số 7. Báo cáo gas ghi cả hai mốc để không phóng đại.
- Bảng gas trong ECONOMIC_RULES cũ (ví dụ `commit` ≈ 44 500, triển khai ≈ 620 000) là **ước tính cho hợp đồng cũ**, không phải số đo, và không còn khớp hợp đồng hiện tại (đo được ≈ 68 650 và ≈ 2,6 triệu). Đã thay bằng số đo.
- AI không thể làm thay các việc cần ví thật: triển khai Sepolia, ghi giao dịch, ảnh Etherscan, poster, video. Các mục này để trống trong tài liệu, **không được điền số liệu giả**.

### Việc sinh viên cần tự kiểm chứng (chưa làm bởi AI)

- Chạy lại `npm install && npx hardhat test` trên máy mình và đọc kết quả.
- Mở từng hàm trong `ProjectCore.sol` và giải thích bằng lời của mình (đặc biệt `REVEALED`, Merkle, `phase()`).
- Đối chiếu lại các mã giao dịch Lab 11 trên Etherscan.

---

## Giai đoạn nâng cấp V2 (nhiều tổ chức, hồ sơ có hash, thẻ cử tri) và đồng bộ tài liệu

- **Công cụ:** Claude (Claude Code, mô hình Sonnet 5.5) làm việc trên bản sao repo nhóm, nhánh `phase4-supabase`. Mọi lần commit/đẩy lên GitHub chỉ thực hiện sau khi sinh viên nhắn đồng ý rõ ràng.
- **Việc AI làm:** viết giao diện chỉnh hồ sơ tổ chức, hiển thị ảnh và giới thiệu ứng viên ở trang bỏ phiếu và trang phê duyệt, cơ chế đối chiếu hash nội dung Supabase với hash trên chuỗi, viết test giao diện, cập nhật SPEC v4.0, ECONOMIC_RULES v4.0, GAS_REPORT, SELF_AUDIT, ARCHITECTURE_V2, FUNCTION_MAP, PRESENTATION_PLAN.
- **Việc sinh viên quyết định:** không sửa hợp đồng để thêm "ví ứng viên ký xác nhận" (sinh viên lập luận: ứng viên đã ứng cử nghĩa là đã đồng ý, nên bước ký chỉ là thủ tục; ghi là hướng phát triển); chưa làm ứng dụng cửa hàng ứng dụng; tự triển khai Vercel; tự chạy SQL trên Supabase; tự triển khai hợp đồng qua Remix.

### Bảng phát hiện của giai đoạn này

| # | Phát hiện | Bằng chứng | Ai phát hiện | Xử lý |
| :-: | :--- | :--- | :---: | :--- |
| 1 | Tài liệu (SPEC, ECONOMIC_RULES, README, SELF_AUDIT, GATE_REVIEW, PROJECT_PLAN, PRESENTATION_PLAN) vẫn mô tả bản đầu (313 dòng, 72–77 test, một tổ chức) trong khi mã đã là V2 (ba hợp đồng, 194 test Hardhat) | So số dòng, số test, tên hàm trong tài liệu với mã | **AI phát hiện** khi sinh viên yêu cầu cập nhật | Viết lại các tài liệu; số liệu lấy lại bằng lệnh chạy thật |
| 2 | Hồ sơ nội dung ở Supabase có thể bị sửa trộm mà giao diện vẫn hiển thị | Đọc luồng dữ liệu | **AI đề xuất** | Băm lại nội dung trong trình duyệt, chỉ hiện khi bằng hash trên chuỗi ("Đã xác thực hash"), ngược lại báo "KHÔNG khớp hash" |
| 3 | Phép thử giao diện lần đầu báo 1 lỗi sau khi sửa phần chọn loại lớp | Chạy lại riêng lẻ: 51/51 đạt | AI | Nguyên nhân là chạy song song nhiều bài test dùng chung một nút Hardhat; từ đó chạy tuần tự |

### Chỗ AI làm sai hoặc phải chỉnh

- **AI nói sai về hợp đồng:** AI từng khẳng định hợp đồng "không có ví ứng viên". Thực tế `createElection` có tham số tùy chọn `candidateWallets` (không lưu), chỉ dùng để **loại** ví đó khỏi nhóm duyệt khi chụp (`_snapshotApprovers`, xem `FUNCTION_MAP.md`). Đã sửa lại trong tài liệu sau khi đọc lại mã.
- **Số dòng viện dẫn sai:** bản nháp `SELF_AUDIT.md` ghi số dòng sai (ví dụ chỗ chặn commit trùng, chỗ loại đại diện). AI đã đối chiếu từng dòng bằng `sed -n` với mã và sửa lại.
- **Giới hạn của bằng chứng kiểm thử:** các test giao diện (phase5_ui, card_ui, viz_ui, meta_update_ui, org_profile_ui) dùng Supabase **giả lập**, chưa phải Supabase thật hay MetaMask thật. Tài liệu ghi rõ điều này.
- AI không thể làm thay: triển khai bằng ví thật, ghi mã giao dịch Etherscan, URL công khai, poster, video, báo cáo rà soát chéo từ nhóm bạn. Các mục này để trống, **không điền số liệu giả**.

### Việc sinh viên cần tự kiểm chứng

- Chạy lại `npx hardhat test` và `npm run test:supabase`, đối chiếu số lượng test.
- Đọc `docs/FUNCTION_MAP.md` kèm mã, tự giải thích từng hàm; số dòng cần kiểm lại nếu có sửa hợp đồng.
- Chạy một cuộc bầu đầy đủ bằng V2 trên Sepolia và điền `evidence/v2/README.md`.
