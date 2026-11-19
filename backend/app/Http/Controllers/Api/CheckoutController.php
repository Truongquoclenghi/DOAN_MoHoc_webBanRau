<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\OrderService;
use App\Services\Payments\VnpayGateway;
use App\Services\ShippingService;
use DomainException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CheckoutController extends Controller
{
    public function __construct(
        private OrderService $orders,
        private VnpayGateway $vnpay,
        private ShippingService $shipping,
    ) {}

    public function estimate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'subtotal' => ['required', 'integer', 'min:0'],
            'distance_km' => ['nullable', 'integer', 'min:0', 'max:200'],
        ]);

        return response()->json([
            'shipping_fee' => $this->shipping->fee((int) $data['subtotal'], (int) ($data['distance_km'] ?? 0)),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'shipping_name' => ['required', 'string', 'max:100'],
            'shipping_phone' => ['required', 'string', 'regex:/^0[0-9]{8,10}$/'],
            'shipping_address' => ['required', 'string', 'max:255'],
            'payment_method' => ['required', 'in:'.Order::PAYMENT_COD.','.Order::PAYMENT_VNPAY],
            'points_to_use' => ['nullable', 'integer', 'min:0'],
            'distance_km' => ['nullable', 'integer', 'min:0', 'max:200'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        // Check that payment can be completed before any stock is reserved.
        $this->ensurePaymentAvailable($data['payment_method']);

        $user = $request->user();
        $lines = $user->cartItems()->with('product')->get()
            ->map(fn ($item) => ['product' => $item->product, 'quantity' => $item->quantity])
            ->values()
            ->all();

        $order = $this->orders->place($user, $lines, $data);
        $user->cartItems()->delete();

        return response()->json([
            'order' => $order,
            'payment_url' => $this->paymentUrl($order, $request),
        ], 201);
    }

    private function ensurePaymentAvailable(string $method): void
    {
        if ($method === Order::PAYMENT_VNPAY && ! $this->vnpay->isConfigured() && ! config('payments.mock_enabled')) {
            throw new DomainException('Cổng thanh toán VNPay chưa được cấu hình.');
        }
    }

    private function paymentUrl(Order $order, Request $request): ?string
    {
        if ($order->payment_method !== Order::PAYMENT_VNPAY) {
            return null;
        }

        if ($this->vnpay->isConfigured()) {
            return $this->vnpay->paymentUrl($order, $request->ip());
        }

        // Mock gateway: the frontend shows a simulated payment page for this order.
        return rtrim(config('payments.frontend_url'), '/').'/payment/mock/'.$order->code;
    }
}
