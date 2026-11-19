<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Order extends Model
{
    public const STATUS_PENDING = 'pending';
    public const STATUS_PAID = 'paid';
    public const STATUS_SHIPPING = 'shipping';
    public const STATUS_DELIVERED = 'delivered';
    public const STATUS_CANCELLED = 'cancelled';

    public const PAYMENT_COD = 'cod';
    public const PAYMENT_VNPAY = 'vnpay';

    protected $fillable = [
        'code',
        'user_id',
        'subscription_id',
        'status',
        'payment_method',
        'payment_status',
        'payment_ref',
        'subtotal',
        'shipping_fee',
        'points_discount',
        'total',
        'points_used',
        'points_earned',
        'distance_km',
        'shipping_name',
        'shipping_phone',
        'shipping_address',
        'delivery_date',
        'note',
        'paid_at',
        'delivered_at',
    ];

    protected function casts(): array
    {
        return [
            'subtotal' => 'integer',
            'shipping_fee' => 'integer',
            'points_discount' => 'integer',
            'total' => 'integer',
            'points_used' => 'integer',
            'points_earned' => 'integer',
            'distance_km' => 'integer',
            'delivery_date' => 'date',
            'paid_at' => 'datetime',
            'delivered_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function subscription(): BelongsTo
    {
        return $this->belongsTo(Subscription::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }
}
