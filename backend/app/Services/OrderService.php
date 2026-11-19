<?php

namespace App\Services;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\Subscription;
use App\Models\User;
use DomainException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class OrderService
{
    public function __construct(
        private InventoryService $inventory,
        private ShippingService $shipping,
        private PointsService $points,
    ) {}

    /**
     * Create an order from product lines. Everything happens in one transaction:
     * if any product is short on stock, nothing is saved.
     *
     * @param  array<int, array{product: Product, quantity: int}>  $lines
     * @param  array{
     *     shipping_name: string, shipping_phone: string, shipping_address: string,
     *     payment_method?: string, points_to_use?: int, distance_km?: int, note?: ?string,
     *     subscription?: ?Subscription, discount_percent?: int, delivery_date?: ?string
     * }  $data
     */
    public function place(User $user, array $lines, array $data): Order
    {
        if ($lines === []) {
            throw new DomainException('Giỏ hàng đang trống.');
        }

        $paymentMethod = $data['payment_method'] ?? Order::PAYMENT_COD;
        if (! in_array($paymentMethod, [Order::PAYMENT_COD, Order::PAYMENT_VNPAY], true)) {
            throw new DomainException('Phương thức thanh toán không hợp lệ.');
        }

        $discountPercent = (int) ($data['discount_percent'] ?? 0);

        return DB::transaction(function () use ($user, $lines, $data, $paymentMethod, $discountPercent) {
            $subtotal = 0;
            $prepared = [];

            foreach ($lines as $line) {
                /** @var Product $product */
                $product = $line['product'];
                $quantity = (int) $line['quantity'];

                if (! $product->is_active) {
                    throw new DomainException("Sản phẩm \"{$product->name}\" đã ngừng bán.");
                }
                if ($quantity < 1) {
                    throw new DomainException('Số lượng không hợp lệ.');
                }

                $unitPrice = intdiv($product->price * (100 - $discountPercent), 100);
                $lineTotal = $unitPrice * $quantity;
                $subtotal += $lineTotal;

                $prepared[] = compact('product', 'quantity', 'unitPrice', 'lineTotal');
            }

            $distanceKm = (int) ($data['distance_km'] ?? 0);
            $shippingFee = $this->shipping->fee($subtotal, $distanceKm);

            $pointsToUse = (int) ($data['points_to_use'] ?? 0);
            $discount = 0;
            $pointsUsed = 0;

            if ($pointsToUse > 0) {
                if ($user->fresh()->points_balance < $pointsToUse) {
                    throw new DomainException('Bạn không đủ điểm để sử dụng.');
                }
                $discount = $this->points->discountFor($pointsToUse, $subtotal);
                $pointsUsed = $this->points->pointsRequiredFor($discount);
            }

            $order = Order::create([
                'code' => $this->newCode(),
                'user_id' => $user->id,
                'subscription_id' => ($data['subscription'] ?? null)?->id,
                'status' => Order::STATUS_PENDING,
                'payment_method' => $paymentMethod,
                'payment_status' => 'unpaid',
                'subtotal' => $subtotal,
                'shipping_fee' => $shippingFee,
                'points_discount' => $discount,
                'total' => $subtotal + $shippingFee - $discount,
                'points_used' => $pointsUsed,
                'points_earned' => 0,
                'distance_km' => $distanceKm,
                'shipping_name' => $data['shipping_name'],
                'shipping_phone' => $data['shipping_phone'],
                'shipping_address' => $data['shipping_address'],
                'delivery_date' => $data['delivery_date'] ?? null,
                'note' => $data['note'] ?? null,
            ]);

            foreach ($prepared as $line) {
                // Throws (and rolls back the whole order) when stock is insufficient.
                $this->inventory->consume($line['product'], $line['quantity'], $order->id);

                OrderItem::create([
                    'order_id' => $order->id,
                    'product_id' => $line['product']->id,
                    'product_name' => $line['product']->name,
                    'unit_price' => $line['unitPrice'],
                    'quantity' => $line['quantity'],
                    'line_total' => $line['lineTotal'],
                ]);
            }

            if ($pointsUsed > 0) {
                $this->points->debit($user, $pointsUsed, 'Dùng điểm cho đơn '.$order->code, $order->id);
            }

            return $order->load('items');
        });
    }

    /** Mark an order as paid (idempotent) and award loyalty points once. */
    public function markPaid(Order $order, ?string $paymentRef = null): void
    {
        if ($order->paid_at !== null) {
            return;
        }

        DB::transaction(function () use ($order, $paymentRef) {
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            if ($order->paid_at !== null) {
                return;
            }

            $earned = $this->points->earnFor($order->total);
            $order->update([
                'payment_status' => 'paid',
                'payment_ref' => $paymentRef ?? $order->payment_ref,
                'paid_at' => now(),
                'points_earned' => $earned,
                'status' => $order->status === Order::STATUS_PENDING ? Order::STATUS_PAID : $order->status,
            ]);

            $this->points->credit($order->user, $earned, 'Tích điểm đơn '.$order->code, $order->id);
        });
    }

    /** Move an order through its lifecycle. */
    public function updateStatus(Order $order, string $status): Order
    {
        match ($status) {
            Order::STATUS_PAID => $this->markPaid($order),
            Order::STATUS_SHIPPING => $this->moveToShipping($order),
            Order::STATUS_DELIVERED => $this->markDelivered($order),
            Order::STATUS_CANCELLED => $this->cancel($order),
            default => throw new DomainException('Trạng thái không hợp lệ.'),
        };

        return $order->refresh();
    }

    public function cancel(Order $order): void
    {
        DB::transaction(function () use ($order) {
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();

            if (! in_array($order->status, [Order::STATUS_PENDING, Order::STATUS_PAID], true)) {
                throw new DomainException('Đơn đang giao hoặc đã kết thúc, không thể hủy.');
            }

            $this->inventory->restoreForOrder($order);

            if ($order->points_used > 0) {
                $this->points->credit($order->user, $order->points_used, 'Hoàn điểm do hủy đơn '.$order->code, $order->id);
            }

            // Take back points that were earned on a payment that is now reversed.
            if ($order->points_earned > 0) {
                $reclaim = min($order->points_earned, $order->user->fresh()->points_balance);
                $this->points->debit($order->user, $reclaim, 'Thu hồi điểm do hủy đơn '.$order->code, $order->id);
            }

            $order->update(['status' => Order::STATUS_CANCELLED]);
        });
    }

    private function moveToShipping(Order $order): void
    {
        if (! in_array($order->status, [Order::STATUS_PENDING, Order::STATUS_PAID], true)) {
            throw new DomainException('Chỉ đơn chưa giao mới chuyển sang đang giao.');
        }

        $order->update(['status' => Order::STATUS_SHIPPING]);
    }

    private function markDelivered(Order $order): void
    {
        if ($order->status !== Order::STATUS_SHIPPING) {
            throw new DomainException('Đơn phải ở trạng thái đang giao trước khi xác nhận đã giao.');
        }

        // Cash on delivery: money is collected at the door, so the order counts as paid now.
        if ($order->paid_at === null) {
            $this->markPaid($order);
        }

        $order->update(['status' => Order::STATUS_DELIVERED, 'delivered_at' => now()]);
    }

    private function newCode(): string
    {
        do {
            $code = 'FN'.now()->format('ymd').strtoupper(Str::random(5));
        } while (Order::where('code', $code)->exists());

        return $code;
    }
}
