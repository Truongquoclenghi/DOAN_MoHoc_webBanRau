<?php

namespace App\Services\Payments;

use App\Models\Order;

/**
 * VNPay (sandbox-ready) integration.
 *
 * Signing follows VNPay's published scheme: all vnp_* parameters sorted by key,
 * url-encoded as a query string, signed with HMAC-SHA512 using the hash secret.
 * Real money only moves once a merchant account is configured in .env.
 */
class VnpayGateway
{
    public function isConfigured(): bool
    {
        return filled(config('payments.vnpay.tmn_code')) && filled(config('payments.vnpay.hash_secret'));
    }

    public function paymentUrl(Order $order, string $ipAddress): string
    {
        $cfg = config('payments.vnpay');
        $now = now('Asia/Ho_Chi_Minh');

        $params = [
            'vnp_Version' => '2.1.0',
            'vnp_Command' => 'pay',
            'vnp_TmnCode' => $cfg['tmn_code'],
            'vnp_Amount' => $order->total * 100, // VNPay expects the amount x100
            'vnp_CreateDate' => $now->format('YmdHis'),
            'vnp_ExpireDate' => $now->copy()->addMinutes(15)->format('YmdHis'),
            'vnp_CurrCode' => 'VND',
            'vnp_IpAddr' => $ipAddress,
            'vnp_Locale' => 'vn',
            'vnp_OrderInfo' => 'Thanh toan don hang '.$order->code,
            'vnp_OrderType' => 'other',
            'vnp_ReturnUrl' => $cfg['return_url'],
            'vnp_TxnRef' => $order->code,
        ];

        ksort($params);
        $query = http_build_query($params);
        $signature = hash_hmac('sha512', $query, $cfg['hash_secret']);

        return $cfg['url'].'?'.$query.'&vnp_SecureHash='.$signature;
    }

    /** Verify the signature on a return or IPN request from VNPay. */
    public function verifySignature(array $input): bool
    {
        $received = (string) ($input['vnp_SecureHash'] ?? '');
        unset($input['vnp_SecureHash'], $input['vnp_SecureHashType']);

        ksort($input);
        $expected = hash_hmac('sha512', http_build_query($input), config('payments.vnpay.hash_secret'));

        return $received !== '' && hash_equals($expected, strtolower($received));
    }

    public function isSuccessful(array $input): bool
    {
        return ($input['vnp_ResponseCode'] ?? null) === '00'
            && ($input['vnp_TransactionStatus'] ?? '00') === '00';
    }
}
