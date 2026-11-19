<?php

namespace App\Console\Commands;

use App\Services\SubscriptionService;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;

class GenerateSubscriptionOrders extends Command
{
    protected $signature = 'subscriptions:generate-orders';

    protected $description = 'Create orders for subscription packages whose weekly order day has arrived';

    public function handle(SubscriptionService $subscriptions): int
    {
        $result = $subscriptions->generateDueOrders(CarbonImmutable::today());

        $this->info("Created {$result['created']} order(s); {$result['failed']} skipped (see log).");

        return self::SUCCESS;
    }
}
