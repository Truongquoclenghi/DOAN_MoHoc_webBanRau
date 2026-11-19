<?php

namespace Tests\Feature;

use App\Models\FarmPlot;
use App\Models\Order;
use App\Models\PointTransaction;
use App\Models\Product;
use App\Models\ProductBatch;
use App\Models\SubscriptionPlan;
use App\Models\SubscriptionPlanItem;
use App\Models\User;
use App\Services\InventoryService;
use App\Services\OrderService;
use App\Services\Payments\VnpayGateway;
use App\Services\SubscriptionService;
use Carbon\CarbonImmutable;
use DomainException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FarmShopTest extends TestCase
{
    use RefreshDatabase;

    private const ADDRESS = [
        'shipping_name' => 'Nguyễn Văn A',
        'shipping_phone' => '0901234567',
        'shipping_address' => 'Đà Lạt, Lâm Đồng',
    ];

    private function makeUser(string $role = 'customer'): User
    {
        return User::create([
            'name' => 'User '.uniqid(),
            'email' => uniqid().'@test.local',
            'password' => 'password-123',
            'role' => $role,
        ]);
    }

    private function makeProduct(int $price = 50000, string $name = 'Cà chua bi'): Product
    {
        return Product::create([
            'name' => $name,
            'slug' => str($name)->slug().'-'.uniqid(),
            'unit' => 'kg',
            'price' => $price,
            'is_active' => true,
        ]);
    }

    private function batchFor(Product $product, int $qty, string $expiresOn, User $actor, ?FarmPlot $plot = null): ProductBatch
    {
        return app(InventoryService::class)->receive([
            'product_id' => $product->id,
            'farm_plot_id' => $plot?->id,
            'quantity_received' => $qty,
            'harvested_on' => now()->subDays(2)->toDateString(),
            'expires_on' => $expiresOn,
        ], $actor->id);
    }

    public function test_fefo_takes_stock_from_the_earliest_expiring_batch_first(): void
    {
        $admin = $this->makeUser('admin');
        $product = $this->makeProduct();
        $soon = $this->batchFor($product, 4, now()->addDays(2)->toDateString(), $admin);
        $later = $this->batchFor($product, 10, now()->addDays(20)->toDateString(), $admin);

        $plan = app(InventoryService::class)->allocateFefo($product, 6);

        $this->assertSame($soon->id, $plan[0]['batch']->id);
        $this->assertSame(4, $plan[0]['quantity']);
        $this->assertSame($later->id, $plan[1]['batch']->id);
        $this->assertSame(2, $plan[1]['quantity']);
    }

    public function test_expired_batches_are_never_sold(): void
    {
        $admin = $this->makeUser('admin');
        $product = $this->makeProduct();
        $this->batchFor($product, 5, now()->subDay()->toDateString(), $admin);

        $this->expectException(DomainException::class);
        app(InventoryService::class)->allocateFefo($product, 1);
    }

    public function test_customer_checks_out_from_cart_and_stock_is_deducted(): void
    {
        $admin = $this->makeUser('admin');
        $customer = $this->makeUser();
        $product = $this->makeProduct(50000);
        $batch = $this->batchFor($product, 10, now()->addDays(10)->toDateString(), $admin);

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/cart', ['product_id' => $product->id, 'quantity' => 3])
            ->assertCreated();

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/checkout', self::ADDRESS + ['payment_method' => 'cod', 'distance_km' => 5])
            ->assertCreated()
            ->assertJsonPath('order.subtotal', 150000)
            // Below the free-shipping threshold: 15,000 base + 2 extra km x 5,000.
            ->assertJsonPath('order.shipping_fee', 25000)
            ->assertJsonPath('order.total', 175000)
            ->assertJsonPath('payment_url', null);

        $this->assertSame(7, $batch->fresh()->quantity_on_hand);
        $this->assertDatabaseCount('cart_items', 0);
        $this->assertDatabaseHas('inventory_movements', [
            'product_batch_id' => $batch->id,
            'type' => 'sale',
            'quantity' => -3,
        ]);
    }

    public function test_checkout_is_rejected_with_no_side_effects_when_stock_drops_below_cart(): void
    {
        $admin = $this->makeUser('admin');
        $customer = $this->makeUser();
        $product = $this->makeProduct();
        $batch = $this->batchFor($product, 2, now()->addDays(10)->toDateString(), $admin);

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/cart', ['product_id' => $product->id, 'quantity' => 2])
            ->assertCreated();

        // Two of the batch's kilos are destroyed after the item was added to the cart.
        app(InventoryService::class)->recordWaste($batch, 2, 'Dập nát khi vận chuyển', $admin->id);

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/checkout', self::ADDRESS + ['payment_method' => 'cod'])
            ->assertStatus(422);

        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseCount('cart_items', 1);
        $this->assertSame(0, $batch->fresh()->quantity_on_hand);
    }

    public function test_paid_order_earns_points_points_can_be_spent_and_cancel_restores_everything(): void
    {
        $admin = $this->makeUser('admin');
        $customer = $this->makeUser();
        $product = $this->makeProduct(100000, 'Dưa lưới');
        $batch = $this->batchFor($product, 20, now()->addDays(10)->toDateString(), $admin);
        $service = app(OrderService::class);

        // 500,000 VND order: 50 points earned on payment.
        $first = $service->place($customer, [['product' => $product, 'quantity' => 5]], self::ADDRESS);
        $service->markPaid($first);
        $this->assertSame(50, $customer->fresh()->points_balance);

        // Spend 20 points (= 20,000 VND) on the next order.
        $second = $service->place($customer->fresh(), [['product' => $product, 'quantity' => 1]],
            self::ADDRESS + ['points_to_use' => 20, 'distance_km' => 0]);

        $this->assertSame(20, $second->points_used);
        $this->assertSame(20000, $second->points_discount);
        $this->assertSame(95000, $second->total); // 100,000 + 15,000 shipping - 20,000 points
        $this->assertSame(30, $customer->fresh()->points_balance);
        $this->assertSame(14, $batch->fresh()->quantity_on_hand);

        $service->cancel($second->fresh());

        $this->assertSame(Order::STATUS_CANCELLED, $second->fresh()->status);
        $this->assertSame(50, $customer->fresh()->points_balance);
        $this->assertSame(15, $batch->fresh()->quantity_on_hand);
        // Ledger: +50 earned, -20 spent, +20 refunded on cancel.
        $this->assertSame(3, PointTransaction::query()->where('user_id', $customer->id)->count());
    }

    public function test_monthly_subscription_generates_orders_on_schedule(): void
    {
        $admin = $this->makeUser('admin');
        $customer = $this->makeUser();
        $product = $this->makeProduct(40000, 'Rau xà lách');
        $this->batchFor($product, 50, now()->addDays(30)->toDateString(), $admin);

        $plan = SubscriptionPlan::create(['name' => 'Gói rau tuần', 'discount_percent' => 10, 'is_active' => true]);
        SubscriptionPlanItem::create(['subscription_plan_id' => $plan->id, 'product_id' => $product->id, 'quantity' => 2]);

        $service = app(SubscriptionService::class);
        $subscription = $service->subscribe($customer, $plan, [
            'delivery_weekday' => 1,
            ...self::ADDRESS,
        ]);

        // A monthly package is four weekly deliveries.
        $this->assertSame(
            $subscription->starts_on->addWeeks(3)->toDateString(),
            $subscription->ends_on->toDateString(),
        );

        // Simulate that the order day has arrived today.
        $subscription->update(['next_order_on' => CarbonImmutable::today()->toDateString()]);

        $result = $service->generateDueOrders(CarbonImmutable::today());

        $this->assertSame(['created' => 1, 'failed' => 0], $result);
        $order = Order::where('subscription_id', $subscription->id)->with('items')->firstOrFail();
        $this->assertSame(72000, $order->subtotal); // 2 x 40,000 with 10% off
        $this->assertSame(2, $order->items->first()->quantity);
        $this->assertSame(
            CarbonImmutable::today()->addWeek()->toDateString(),
            $subscription->fresh()->next_order_on->toDateString(),
        );
    }

    public function test_vnpay_urls_are_signed_and_tampering_is_detected(): void
    {
        config([
            'payments.vnpay.tmn_code' => 'TESTTMN',
            'payments.vnpay.hash_secret' => 'TEST_SECRET',
            'payments.vnpay.url' => 'https://sandbox.example/pay',
        ]);

        $customer = $this->makeUser();
        $product = $this->makeProduct(100000);
        $this->batchFor($product, 5, now()->addDays(5)->toDateString(), $this->makeUser('admin'));
        $order = app(OrderService::class)->place($customer, [['product' => $product, 'quantity' => 1]], self::ADDRESS + [
            'payment_method' => Order::PAYMENT_VNPAY,
        ]);

        $gateway = app(VnpayGateway::class);
        parse_str((string) parse_url($gateway->paymentUrl($order, '127.0.0.1'), PHP_URL_QUERY), $params);

        $this->assertTrue($gateway->verifySignature($params));
        $this->assertSame((string) ($order->total * 100), $params['vnp_Amount']);

        $params['vnp_Amount'] = '1';
        $this->assertFalse($gateway->verifySignature($params));
    }

    public function test_vnpay_ipn_marks_order_paid_once(): void
    {
        config([
            'payments.vnpay.tmn_code' => 'TESTTMN',
            'payments.vnpay.hash_secret' => 'TEST_SECRET',
        ]);

        $customer = $this->makeUser();
        $product = $this->makeProduct(100000);
        $this->batchFor($product, 5, now()->addDays(5)->toDateString(), $this->makeUser('admin'));
        $order = app(OrderService::class)->place($customer, [['product' => $product, 'quantity' => 1]], self::ADDRESS + [
            'payment_method' => Order::PAYMENT_VNPAY,
        ]);

        $input = [
            'vnp_TxnRef' => $order->code,
            'vnp_Amount' => (string) ($order->total * 100),
            'vnp_ResponseCode' => '00',
            'vnp_TransactionStatus' => '00',
            'vnp_TransactionNo' => '13579',
        ];
        ksort($input);
        $input['vnp_SecureHash'] = hash_hmac('sha512', http_build_query($input), 'TEST_SECRET');

        $this->getJson('/api/payments/vnpay/ipn?'.http_build_query($input))
            ->assertOk()->assertJsonPath('RspCode', '00');
        $this->getJson('/api/payments/vnpay/ipn?'.http_build_query($input))
            ->assertOk()->assertJsonPath('RspCode', '02'); // already confirmed

        $order->refresh();
        $this->assertSame('paid', $order->payment_status);
        $this->assertSame('13579', $order->payment_ref);
    }

    public function test_waste_cannot_exceed_stock_and_is_recorded(): void
    {
        $admin = $this->makeUser('admin');
        $product = $this->makeProduct();
        $batch = $this->batchFor($product, 5, now()->addDays(5)->toDateString(), $admin);
        $inventory = app(InventoryService::class);

        try {
            $inventory->recordWaste($batch, 6, 'Thử vượt tồn', $admin->id);
            $this->fail('Expected DomainException');
        } catch (DomainException) {
        }

        $inventory->recordWaste($batch, 5, 'Héo úa', $admin->id);

        $this->assertSame(0, $batch->fresh()->quantity_on_hand);
        $this->assertSame('written_off', $batch->fresh()->status);
        $this->assertDatabaseHas('inventory_movements', [
            'product_batch_id' => $batch->id,
            'type' => 'waste',
            'quantity' => -5,
        ]);
    }

    public function test_customers_cannot_use_admin_endpoints(): void
    {
        $this->actingAs($this->makeUser(), 'sanctum')
            ->getJson('/api/admin/dashboard')
            ->assertForbidden();
    }

    public function test_anonymous_requests_to_protected_routes_are_rejected(): void
    {
        $this->getJson('/api/cart')->assertUnauthorized();
    }

    public function test_qr_trace_endpoint_shows_origin_of_a_batch(): void
    {
        $admin = $this->makeUser('admin');
        $plot = FarmPlot::create(['code' => 'LO-01', 'name' => 'Lô A - Đà Lạt', 'certification' => 'VietGAP']);
        $product = $this->makeProduct();
        $batch = $this->batchFor($product, 5, now()->addDays(5)->toDateString(), $admin, $plot);

        $this->getJson('/api/trace/'.strtolower($batch->trace_code))
            ->assertOk()
            ->assertJsonPath('farm_plot.certification', 'VietGAP')
            ->assertJsonPath('product.name', $product->name)
            ->assertJsonPath('is_expired', false);
    }
}
