<?php

namespace App\Services;

use App\Models\Subscription;
use App\Models\SubscriptionPlan;
use App\Models\User;
use Carbon\CarbonImmutable;
use DomainException;
use Illuminate\Support\Facades\Log;

/**
 * Monthly subscription packages: 4 weekly deliveries on the chosen weekday.
 * Orders are generated automatically by `subscriptions:generate-orders`.
 */
class SubscriptionService
{
    public const DELIVERIES_PER_PACKAGE = 4;

    public function __construct(private OrderService $orders) {}

    public function subscribe(User $user, SubscriptionPlan $plan, array $data): Subscription
    {
        if (! $plan->is_active) {
            throw new DomainException('Gói này hiện không mở đăng ký.');
        }
        if ($plan->items()->doesntExist()) {
            throw new DomainException('Gói này chưa có sản phẩm.');
        }

        $start = $this->nextWeekday((int) $data['delivery_weekday']);

        return Subscription::create([
            'user_id' => $user->id,
            'subscription_plan_id' => $plan->id,
            'status' => Subscription::STATUS_ACTIVE,
            'delivery_weekday' => $data['delivery_weekday'],
            'starts_on' => $start->toDateString(),
            'ends_on' => $start->addWeeks(self::DELIVERIES_PER_PACKAGE - 1)->toDateString(),
            'next_order_on' => $start->toDateString(),
            'shipping_name' => $data['shipping_name'],
            'shipping_phone' => $data['shipping_phone'],
            'shipping_address' => $data['shipping_address'],
            'payment_method' => $data['payment_method'] ?? 'cod',
        ]);
    }

    /**
     * Create an order for every active subscription whose order day has come.
     *
     * @return array{created: int, failed: int}
     */
    public function generateDueOrders(CarbonImmutable $today): array
    {
        $created = 0;
        $failed = 0;

        Subscription::query()
            ->with(['user', 'plan.items.product'])
            ->where('status', Subscription::STATUS_ACTIVE)
            ->whereDate('next_order_on', '<=', $today->toDateString())
            ->get()
            ->each(function (Subscription $sub) use (&$created, &$failed) {
                $lines = $sub->plan->items
                    ->filter(fn ($item) => $item->product !== null)
                    ->map(fn ($item) => ['product' => $item->product, 'quantity' => $item->quantity])
                    ->values()
                    ->all();

                try {
                    $this->orders->place($sub->user, $lines, [
                        'shipping_name' => $sub->shipping_name,
                        'shipping_phone' => $sub->shipping_phone,
                        'shipping_address' => $sub->shipping_address,
                        'payment_method' => $sub->payment_method,
                        'subscription' => $sub,
                        'discount_percent' => $sub->plan->discount_percent,
                        'delivery_date' => $sub->next_order_on->toDateString(),
                        'note' => 'Đơn tự động từ gói đăng ký #'.$sub->id,
                    ]);
                } catch (DomainException $e) {
                    // Keep next_order_on unchanged so the next run retries this delivery.
                    Log::warning('Subscription order skipped', ['subscription' => $sub->id, 'reason' => $e->getMessage()]);
                    $failed++;

                    return;
                }

                $next = $sub->next_order_on->addWeek();
                $sub->update([
                    'next_order_on' => $next->toDateString(),
                    'status' => $next->gt($sub->ends_on) ? Subscription::STATUS_COMPLETED : Subscription::STATUS_ACTIVE,
                ]);
                $created++;
            });

        return ['created' => $created, 'failed' => $failed];
    }

    /** The first date strictly after today that falls on the given weekday (0 = Sunday). */
    public function nextWeekday(int $weekday): CarbonImmutable
    {
        $date = CarbonImmutable::today()->addDay();

        while ((int) $date->dayOfWeek !== $weekday) {
            $date = $date->addDay();
        }

        return $date;
    }
}
