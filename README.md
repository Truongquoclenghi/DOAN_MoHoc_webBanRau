# Website thương mại điện tử nông sản sạch (Single Farm)

Nền tảng TMĐT dành riêng cho một nông trại: bán nông sản tươi, **truy xuất nguồn gốc bằng QR theo từng lô**, nhật ký canh tác, quản lý tồn kho theo lô hạn sử dụng (FEFO), gói đăng ký hàng tháng, tích điểm và khiếu nại.

- **Backend:** Laravel 12 REST API + Laravel Sanctum (token), MySQL (production) / SQLite (mặc định khi chạy thử).
- **Frontend:** React 19 + React Router + Vite (SPA), có trang quản trị.
- **Dịch vụ bên thứ ba:** VNPay (chữ ký HMAC-SHA512 theo tài liệu VNPay), Cloudinary (tùy chọn), cổng thanh toán giả lập cho môi trường thử.

## 1. Phạm vi theo ma trận MoSCoW (Tuần 1) và trạng thái

| Mức | Chức năng | Trạng thái | Ghi chú triển khai |
|---|---|---|---|
| Must | Giỏ hàng, đặt hàng, thanh toán | Xong | COD, VNPay (sandbox), cổng giả lập |
| Must | Tồn kho theo **lô** (batch) có hạn sử dụng | Xong | `product_batches`, mỗi lô có mã QR riêng |
| Must | Xuất kho tự động theo **FEFO** | Xong | Trừ kho lô sắp hết hạn trước khi bán; `GET /admin/products/{id}/fefo-preview` xem trước |
| Must | Tạo và truy xuất mã QR | Xong (tạo + trang truy xuất) | Quét bằng máy quét mã (gõ + Enter) hoặc nhập tay. Chưa quét bằng camera |
| Must | Ghi nhận xuất hủy / hao hụt | Xong | `POST /admin/batches/{id}/waste`, có audit trong `inventory_movements` |
| Should | Mua theo gói định kỳ tự sinh đơn | Xong | 4 lần giao/tháng vào thứ đã chọn; lệnh `subscriptions:generate-orders` chạy hằng ngày |
| Should | Nhật ký canh tác (ảnh/video) | Xong | Hiển thị trên trang truy xuất QR |
| Should | Tích điểm thành viên | Xong | 10.000 ₫ = 1 điểm; 1 điểm = 1.000 ₫; tối đa 50% giá trị đơn |
| Should | Khiếu nại kèm ảnh | Xong | Admin phản hồi và đổi trạng thái |
| Could | Phí ship động | Một phần | Tính theo khoảng cách khách nhập, **chưa** dùng Google Maps / Ahamove |
| Could | Flash sale cho lô sắp hết hạn | Chưa làm | Đã có cảnh báo lô sắp hết hạn và giá trị tồn để làm cơ sở |
| Could | MoMo / VNPay thực tế | Một phần | VNPay đã có luồng URL, chữ ký, IPN; **chưa kiểm thử với merchant thật** |
| Won't | App di động, đa gian hàng, AI dự báo | Không làm | Đúng như phạm vi |

## 2. Yêu cầu chức năng đồ án (Tuần 3)

Đăng ký/đăng nhập · tìm kiếm · mua hàng · danh mục · xem giá · nhật ký canh tác/QR · tích điểm · giỏ hàng · thanh toán · gói đăng ký hàng tháng · quản lý ô (lô đất) · quản lý đơn hàng/khiếu nại · quản lý tài khoản · doanh thu/báo cáo.

## 3. Chạy dự án

Yêu cầu: PHP 8.2+, Composer, Node.js 20+.

Backend (Laravel API, cổng 8000):

```powershell
cd backend
composer install
copy .env.example .env
php artisan key:generate
php artisan migrate --seed
php artisan storage:link
php artisan serve
```

Lập lịch chạy nền (đơn định kỳ, đánh dấu lô hết hạn) khi phát triển:

```powershell
php artisan schedule:work
```

Frontend (cổng 5173, tự proxy `/api` sang backend):

```powershell
cd frontend
npm install
npm run dev
```

Mở http://localhost:5173

**Tài khoản demo** (tạo bởi seeder):

- Quản trị: `admin@farm.local` / `password`
- Khách hàng: `khach@farm.local` / `password`

Kiểm thử backend:

```powershell
cd backend
php artisan test
```

Bộ kiểm thử gồm 14 ca: FEFO, hết hạn không được bán, checkout và trừ kho, hủy đơn hoàn kho và điểm, tích điểm và dùng điểm, gói đăng ký sinh đơn, chữ ký VNPay (ký, phát hiện sửa đổi, IPN chỉ xử lý một lần), xuất hủy không vượt tồn, phân quyền admin, truy xuất QR.

## 4. Cấu hình (.env)

| Biến | Ý nghĩa |
|---|---|
| `PAYMENT_MOCK_ENABLED` | `true` để dùng cổng thanh toán giả lập. **Đặt `false` khi đưa lên production.** |
| `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_URL` | Thông số VNPay sandbox. Để trống sẽ dùng cổng giả lập |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Lưu ảnh lên Cloudinary. Để trống sẽ lưu ở đĩa `public` |
| `FRONTEND_URL` | Địa chỉ frontend, dùng để chuyển hướng sau thanh toán |
| `SHOP_*` | Ngưỡng miễn phí ship, phí cơ bản, phí theo km |

Để dùng MySQL, đổi `DB_CONNECTION=mysql` và các biến `DB_*` trong `.env`.

## 5. Quản lý rủi ro kỹ thuật (theo yêu cầu Tuần 1)

| Rủi ro | Phương án dự phòng đã triển khai |
|---|---|
| API thanh toán bên thứ ba lỗi hoặc chưa có tài khoản | Cổng thanh toán giả lập (`PAYMENT_MOCK_ENABLED`) chạy được toàn bộ luồng đặt hàng và thanh toán |
| Cloudinary lỗi hoặc chưa cấu hình | Tự động lưu ảnh ở đĩa cục bộ |
| Đặt đơn khi tồn kho vừa thay đổi | Toàn bộ đặt hàng nằm trong một transaction, khóa dòng lô (`lockForUpdate`); thiếu hàng thì không tạo đơn nào |
| Gửi lặp IPN của VNPay | Đơn đã xác nhận trả mã `02`, không cộng điểm hai lần |
| Lô quá hạn vẫn được bán | Truy vấn bán hàng loại lô hết hạn; lệnh chạy 00:05 đánh dấu lô hết hạn |

## 6. Hạn chế đã biết

- Chưa kiểm thử với cổng VNPay thật (cần TMN code và hash secret của merchant). Chữ ký đã được kiểm thử nội bộ.
- Phí ship chưa lấy khoảng cách tự động từ bản đồ.
- Chưa có flash sale tự động.
- Quét QR bằng camera chưa có; trang truy xuất là đường dẫn công khai cho mọi mã lô.
- Hủy đơn đã thanh toán chưa tự động hoàn tiền qua cổng; cần xử lý thủ công.
- Gói đăng ký chỉ dùng thanh toán khi nhận hàng (COD).

## 7. Cấu trúc thư mục

```
backend/
  app/Services/          # InventoryService (FEFO, lô, xuất hủy), OrderService, PointsService,
                         # ShippingService, SubscriptionService, MediaStorage, Payments/VnpayGateway
  app/Http/Controllers/Api/        # API cho khách hàng
  app/Http/Controllers/Api/Admin/  # API quản trị
  database/migrations/   # 16 migration: lô, tồn kho, nhật ký, đơn, gói, khiếu nại, điểm
  database/seeders/DemoSeeder.php
  routes/api.php         # toàn bộ API
  tests/Feature/FarmShopTest.php
frontend/
  src/pages/Shop.jsx     # sản phẩm, chi tiết, giỏ hàng, thanh toán, cổng giả lập
  src/pages/Account.jsx  # đơn hàng, điểm, gói đăng ký, khiếu nại
  src/pages/Trace.jsx    # trang truy xuất QR và nhật ký canh tác
  src/pages/Admin.jsx    # tổng quan, sản phẩm & lô, nông trại, đơn, khiếu nại, gói, người dùng
```
