<?php
declare(strict_types=1);

namespace App\State;

use App\Util\UrlGuard;

class HttpClient
{
    public const CONNECT_TIMEOUT = 5;
    public const TIMEOUT         = 15;

    /**
     * Perform a single HTTP request and return body/status/headers.
     *
     * @param string                              $method  GET, POST, …
     * @param string                              $url
     * @param array<string, string>               $headers Request headers; ['Name' => 'value']
     * @param string|null                         $body    Raw request body (already encoded)
     * @return array{body: string, status: int, headers: array<string, string>}
     */
    public function request(string $method, string $url, array $headers = [], ?string $body = null): array
    {
        UrlGuard::check($url);
        $ch = curl_init();
        if ($ch === false) {
            throw new \RuntimeException('curl_init failed');
        }

        $hdrLines = [];
        foreach ($headers as $k => $v) {
            $hdrLines[] = $k . ': ' . $v;
        }

        $responseHeaders = [];

        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_CUSTOMREQUEST  => strtoupper($method),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => self::CONNECT_TIMEOUT,
            CURLOPT_TIMEOUT        => self::TIMEOUT,
            CURLOPT_PROTOCOLS      => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_HTTPHEADER     => $hdrLines,
            CURLOPT_HEADERFUNCTION => function ($_ch, string $hdr) use (&$responseHeaders): int {
                $len  = strlen($hdr);
                $line = trim($hdr);
                if ($line !== '' && str_contains($line, ':')) {
                    [$name, $value] = explode(':', $line, 2);
                    $responseHeaders[strtolower(trim($name))] = trim($value);
                }
                return $len;
            },
        ]);

        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }

        $resp = curl_exec($ch);
        if ($resp === false) {
            $err = curl_error($ch);
            curl_close($ch);
            throw new \RuntimeException('cURL error: ' . $err);
        }

        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        return [
            'body'    => (string) $resp,
            'status'  => $status,
            'headers' => $responseHeaders,
        ];
    }

    /**
     * Perform multiple HTTP requests in parallel via curl_multi. Preserves the
     * caller's keys so results can be correlated with inputs.
     *
     * @param array<int|string, array{method: string, url: string, headers?: array<string, string>, body?: ?string}> $requests
     * @return array<int|string, array{body: string, status: int, headers: array<string, string>, error: ?string}>
     */
    public function requestMulti(array $requests): array
    {
        if ($requests === []) {
            return [];
        }

        $mh        = curl_multi_init();
        $handles   = [];
        $headerBag = [];

        foreach ($requests as $key => $req) {
            UrlGuard::check($req['url']);
            $ch = curl_init();
            if ($ch === false) {
                throw new \RuntimeException('curl_init failed');
            }
            $hdrLines = [];
            foreach (($req['headers'] ?? []) as $k => $v) {
                $hdrLines[] = $k . ': ' . $v;
            }
            $headerBag[$key] = [];
            curl_setopt_array($ch, [
                CURLOPT_URL            => $req['url'],
                CURLOPT_CUSTOMREQUEST  => strtoupper($req['method'] ?? 'GET'),
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CONNECTTIMEOUT => self::CONNECT_TIMEOUT,
                CURLOPT_TIMEOUT        => self::TIMEOUT,
                CURLOPT_PROTOCOLS      => CURLPROTO_HTTP | CURLPROTO_HTTPS,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_SSL_VERIFYHOST => 2,
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_HTTPHEADER     => $hdrLines,
                CURLOPT_HEADERFUNCTION => function ($_ch, string $hdr) use (&$headerBag, $key): int {
                    $len  = strlen($hdr);
                    $line = trim($hdr);
                    if ($line !== '' && str_contains($line, ':')) {
                        [$name, $value] = explode(':', $line, 2);
                        $headerBag[$key][strtolower(trim($name))] = trim($value);
                    }
                    return $len;
                },
            ]);
            if (($req['body'] ?? null) !== null) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, $req['body']);
            }
            curl_multi_add_handle($mh, $ch);
            $handles[$key] = $ch;
        }

        do {
            $status = curl_multi_exec($mh, $active);
            if ($active) {
                curl_multi_select($mh, 1.0);
            }
        } while ($active && $status === CURLM_OK);

        $results = [];
        foreach ($handles as $key => $ch) {
            $body  = curl_multi_getcontent($ch);
            $code  = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $err   = curl_error($ch) ?: null;
            $results[$key] = [
                'body'    => (string) $body,
                'status'  => $code,
                'headers' => $headerBag[$key] ?? [],
                'error'   => $err !== '' ? $err : null,
            ];
            curl_multi_remove_handle($mh, $ch);
            curl_close($ch);
        }
        curl_multi_close($mh);

        return $results;
    }
}
