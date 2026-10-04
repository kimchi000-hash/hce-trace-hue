# BÁO CÁO ĐO LƯỜNG GAS FEES — LAB 09 (TimeLockVault)

- **Người thực hiện:** Võ Thị Thư (SV: 23k4300038)
- **Môi trường:** Remix VM (Cancun)

## Bảng chỉ số Gas tiêu thụ thực tế

| Thao tác | Đầu vào (Input) | Kết quả | Transaction Cost | Execution Cost |
| :--- | :--- | :--- | :--- | :--- |
| **1. Deploy Contract** | `lockDurationSeconds = 120`, Value = 1 ETH | Thành công | ~322,487 gas | ~250,000 gas |
| **2. Deposit** | Value = 1 ETH | Thành công | ~43,212 gas | ~28,000 gas |
| **3. Withdraw (Lần 1)** | Gọi khi chưa đủ 2 phút | **Thất bại** (`StillLocked`) | ~23,415 gas | ~12,000 gas |
| **4. Withdraw (Lần 2)** | Gọi sau 2 phút, Value = 0 wei | **Thành công** | **32,055 gas** | **10,991 gas** |
