<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Subscription extends Model
{
    public const STATUS_ACTIVE = 'active';
    public const STATUS_PAUSED = 'paused';
    public const STATUS_CANCELLED = 'cancelled';
    public const STATUS_COMPLETED = 'completed';

    protected $fillable = [
        'user_id',
        'subscription_plan_id',
        'status',
        'delivery_weekday',
        'starts_on',
        'ends_on',
        'next_order_on',
        'shipping_name',
        'shipping_phone',
        'shipping_address',
        'payment_method',
    ];

    protected function casts(): array
    {
        return [
            'delivery_weekday' => 'integer',
            'starts_on' => 'date',
            'ends_on' => 'date',
            'next_order_on' => 'date',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(SubscriptionPlan::class, 'subscription_plan_id');
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }
}
