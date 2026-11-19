<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Complaint;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ComplaintController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Complaint::query()->with(['user:id,name,email', 'order:id,code'])->latest('id');

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        return response()->json($query->paginate(20));
    }

    public function update(Request $request, Complaint $complaint): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', 'in:open,in_progress,resolved'],
            'admin_reply' => ['nullable', 'string', 'max:2000'],
        ]);

        $complaint->update($data);

        return response()->json($complaint->fresh());
    }
}
