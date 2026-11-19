<?php

namespace App\Services;

/**
 * Distance-based shipping fee. Free above a subtotal threshold.
 * Distance is supplied by the customer (estimate); no external maps API is called.
 */
class ShippingService
{
    public function fee(int $subtotal, int $distanceKm): int
    {
        $cfg = config('shop.shipping');

        if ($subtotal >= $cfg['free_threshold']) {
            return 0;
        }

        $distanceKm = min(max($distanceKm, 0), $cfg['max_km']);
        $extraKm = max(0, $distanceKm - $cfg['included_km']);

        return $cfg['base_fee'] + $extraKm * $cfg['per_km_fee'];
    }
}
