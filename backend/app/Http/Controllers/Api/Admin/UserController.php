<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use DomainException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = User::query()
            ->select(['id', 'name', 'email', 'phone', 'role', 'points_balance', 'is_active', 'created_at'])
            ->latest('id');

        if ($term = trim((string) $request->query('q'))) {
            $query->where(fn ($q) => $q->where('name', 'like', "%{$term}%")->orWhere('email', 'like', "%{$term}%"));
        }

        return response()->json($query->paginate(20));
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'role' => ['sometimes', 'in:'.User::ROLE_CUSTOMER.','.User::ROLE_ADMIN],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if ($user->id === $request->user()->id && (($data['is_active'] ?? true) === false || ($data['role'] ?? User::ROLE_ADMIN) !== User::ROLE_ADMIN)) {
            throw new DomainException('Không thể tự khóa hoặc tự hạ quyền tài khoản của chính mình.');
        }

        $user->update($data);

        return response()->json($user->only(['id', 'name', 'email', 'role', 'is_active']));
    }
}
