<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Complaint;
use App\Models\Order;
use App\Services\MediaStorage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ComplaintController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(
            $request->user()->complaints()->with('order:id,code')->latest('id')->get()
        );
    }

    public function store(Request $request, MediaStorage $media): JsonResponse
    {
        $data = $request->validate([
            'subject' => ['required', 'string', 'max:150'],
            'content' => ['required', 'string', 'max:2000'],
            'order_code' => ['nullable', 'string'],
            'image' => ['nullable', 'image', 'max:5120'],
        ]);

        $user = $request->user();
        $order = null;
        if (! empty($data['order_code'])) {
            $order = $user->orders()->where('code', $data['order_code'])->firstOrFail();
        }

        $imageUrl = $request->hasFile('image')
            ? $media->store($request->file('image'), 'complaints')
            : null;

        $complaint = Complaint::create([
            'user_id' => $user->id,
            'order_id' => $order?->id,
            'subject' => $data['subject'],
            'content' => $data['content'],
            'image_url' => $imageUrl,
            'status' => Complaint::STATUS_OPEN,
        ]);

        return response()->json($complaint, 201);
    }
}
