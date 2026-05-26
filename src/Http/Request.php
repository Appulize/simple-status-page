<?php
declare(strict_types=1);

namespace App\Http;

class Request
{
    private ?string $body = null;

    public function method(): string
    {
        return strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    }

    public function path(): string
    {
        return (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
    }

    public function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        // These two headers lack the HTTP_ prefix in $_SERVER
        if ($key === 'HTTP_CONTENT_TYPE') {
            $key = 'CONTENT_TYPE';
        } elseif ($key === 'HTTP_CONTENT_LENGTH') {
            $key = 'CONTENT_LENGTH';
        }
        $value = $_SERVER[$key] ?? null;
        return is_string($value) ? $value : null;
    }

    public function body(): string
    {
        if ($this->body === null) {
            $this->body = (string) file_get_contents('php://input');
        }
        return $this->body;
    }

    public function json(): array
    {
        try {
            $decoded = json_decode($this->body(), true, 512, JSON_THROW_ON_ERROR);
            return is_array($decoded) ? $decoded : [];
        } catch (\JsonException) {
            return [];
        }
    }

    public function post(string $key, mixed $default = null): mixed
    {
        return $_POST[$key] ?? $default;
    }

    public function isJson(): bool
    {
        return str_contains($this->header('Content-Type') ?? '', 'application/json');
    }

    public function bearerToken(): ?string
    {
        $auth = $this->header('Authorization');
        if ($auth !== null && str_starts_with($auth, 'Bearer ')) {
            return substr($auth, 7);
        }
        return null;
    }

    public function basicAuth(): ?array
    {
        $auth = $this->header('Authorization');
        if ($auth !== null && str_starts_with($auth, 'Basic ')) {
            $decoded = base64_decode(substr($auth, 6), true);
            if ($decoded !== false && str_contains($decoded, ':')) {
                [$user, $password] = explode(':', $decoded, 2);
                return ['user' => $user, 'password' => $password];
            }
        }
        return null;
    }

    public function ifNoneMatch(): ?string
    {
        return $this->header('If-None-Match');
    }

    public function host(): string
    {
        return (string) ($_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? 'localhost');
    }
}
