<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Subscription;
use App\Models\SubscriptionPlan;
use App\Services\SubscriptionService;
use DomainException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SubscriptionController extends Controller
{
    public function __construct(private SubscriptionService $subscriptions) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(
            $request->user()->subscriptions()->with('plan')->latest('id')->get()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'subscription_plan_id' => ['required', 'integer', 'exists:subscription_plans,id'],
            'delivery_weekday' => ['required', 'integer', 'between:0,6'],
            'shipping_name' => ['required', 'string', 'max:100'],
            'shipping_phone' => ['required', 'string', 'regex:/^0[0-9]{8,10}$/'],
            'shipping_address' => ['required', 'string', 'max:255'],
        ]);

        $plan = SubscriptionPlan::findOrFail($data['subscription_plan_id']);
        $subscription = $this->subscriptions->subscribe($request->user(), $plan, $data);

        return response()->json($subscription->load('plan'), 201);
    }

    /** Pause, resume or cancel a package. */
    public function update(Request $request, Subscription $subscription): JsonResponse
    {
        abort_unless($subscription->user_id === $request->user()->id, 404);

        $data = $request->validate([
            'status' => ['required', 'in:active,paused,cancelled'],
        ]);

        if (in_array($subscription->status, [Subscription::STATUS_CANCELLED, Subscription::STATUS_COMPLETED], true)) {
            throw new DomainException('Gói đã kết thúc, không thể thay đổi.');
        }

        if ($data['status'] === Subscription::STATUS_ACTIVE && $subscription->next_order_on->isPast()) {
            // Resuming after a pause: schedule the next order on the next matching weekday.
            $subscription->next_order_on = $this->subscriptions->nextWeekday($subscription->delivery_weekday);
        }

        $subscription->update(['status' => $data['status'], 'next_order_on' => $subscription->next_order_on]);

        return response()->json($subscription->refresh()->load('plan'));
    }
}
