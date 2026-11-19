<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProductBatch extends Model
{
    public const STATUS_AVAILABLE = 'available';
    public const STATUS_DEPLETED = 'depleted';
    public const STATUS_EXPIRED = 'expired';
    public const STATUS_WRITTEN_OFF = 'written_off';

    protected $fillable = [
        'product_id',
        'farm_plot_id',
        'batch_code',
        'trace_code',
        'quantity_received',
        'quantity_on_hand',
        'harvested_on',
        'expires_on',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'harvested_on' => 'date',
            'expires_on' => 'date',
            'quantity_received' => 'integer',
            'quantity_on_hand' => 'integer',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function farmPlot(): BelongsTo
    {
        return $this->belongsTo(FarmPlot::class);
    }

    public function movements(): HasMany
    {
        return $this->hasMany(InventoryMovement::class);
    }

    /** Batches that can still be sold: in stock, marked available and not yet expired. */
    public function scopeSellable(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_AVAILABLE)
            ->where('quantity_on_hand', '>', 0)
            ->whereDate('expires_on', '>=', now()->toDateString());
    }

    /** Batches whose expiry falls within the next N days (for alerts / flash sale). */
    public function scopeExpiringWithin(Builder $query, int $days): Builder
    {
        return $query->sellable()
            ->whereDate('expires_on', '<=', now()->addDays($days)->toDateString());
    }
}
