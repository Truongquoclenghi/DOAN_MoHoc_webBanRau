<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\OrderService;
use App\Services\Payments\VnpayGateway;
use DomainException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class PaymentController extends Controller
{
    public function __construct(
        private VnpayGateway $vnpay,
        private OrderService $orders,
    ) {}

    /** Browser is redirected here by VNPay after the customer pays. */
    public function vnpayReturn(Request $request): RedirectResponse
    {
        $front = rtrim(config('payments.frontend_url'), '/');
        $input = $request->query();
        $code = (string) ($input['vnp_TxnRef'] ?? '');
        $order = Order::where('code', $code)->first();

        if (! $order || ! $this->vnpay->verifySignature($input)) {
            return redirect($front.'/orders?payment=invalid');
        }

        if ($this->vnpay->isSuccessful($input)) {
            $this->orders->markPaid($order, $input['vnp_TransactionNo'] ?? null);

            return redirect($front.'/orders/'.$code.'?payment=success');
        }

        return redirect($front.'/orders/'.$code.'?payment=failed');
    }

    /** Server-to-server notification from VNPay (IPN). Must answer with RspCode. */
    public function vnpayIpn(Request $request): JsonResponse
    {
        $input = $request->query();

        if (! $this->vnpay->verifySignature($input)) {
            return response()->json(['RspCode' => '97', 'Message' => 'Invalid signature']);
        }

        $order = Order::where('code', (string) ($input['vnp_TxnRef'] ?? ''))->first();
        if (! $order) {
            return response()->json(['RspCode' => '01', 'Message' => 'Order not found']);
        }

        if ((int) ($input['vnp_Amount'] ?? 0) !== $order->total * 100) {
            return response()->json(['RspCode' => '04', 'Message' => 'Invalid amount']);
        }

        if ($order->paid_at !== null) {
            return response()->json(['RspCode' => '02', 'Message' => 'Order already confirmed']);
        }

        if ($this->vnpay->isSuccessful($input)) {
            $this->orders->markPaid($order, $input['vnp_TransactionNo'] ?? null);
        } else {
            $order->update(['payment_status' => 'failed']);
        }

        return response()->json(['RspCode' => '00', 'Message' => 'Confirm Success']);
    }

    /**
     * Mock gateway for local development and demos. Simulates a successful payment
     * without any merchant account. Disabled unless PAYMENT_MOCK_ENABLED=true.
     */
    public function mockComplete(Request $request, string $code): JsonResponse
    {
        abort_unless(config('payments.mock_enabled'), 404);

        $order = $request->user()->orders()->where('code', $code)->firstOrFail();

        if ($order->status === Order::STATUS_CANCELLED) {
            throw new DomainException('Đơn đã bị hủy.');
        }

        $this->orders->markPaid($order, 'MOCK-'.Str::upper(Str::random(10)));

        return response()->json($order->refresh()->load('items'));
    }
}
