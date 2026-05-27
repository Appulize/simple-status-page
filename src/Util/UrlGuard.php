<?php
declare(strict_types=1);

namespace App\Util;

/**
 * Light SSRF defence for admin-supplied provider URLs. Resolves the host
 * and rejects ranges that have no legitimate monitoring use:
 *
 *   - 169.254.0.0/16  link-local (AWS / GCP / Azure metadata)
 *   - 100.64.0.0/10   CGNAT (sometimes routes to metadata in cloud envs)
 *   - 0.0.0.0/8       invalid
 *   - 224.0.0.0/4     multicast
 *   - 240.0.0.0/4     reserved
 *   - 255.255.255.255 broadcast
 *   - ::              IPv6 unspecified
 *   - ::1             permitted (legitimate self-host case)
 *   - fe80::/10       IPv6 link-local
 *   - ff00::/8        IPv6 multicast
 *   - fc00::/7        IPv6 ULA (sometimes used to route to metadata)
 *
 * RFC1918 (10/8, 172.16/12, 192.168/16) and IPv4 loopback (127/8) are *allowed*
 * — the primary use case is monitoring self-hosted infrastructure, which
 * routinely lives on those ranges. This is documented in SECURITY.md.
 *
 * Residual risk: DNS rebinding can swap the resolved IP between our check and
 * the curl call. Acceptable for an admin-only surface; document it.
 */
final class UrlGuard
{
    public static function check(string $url): void
    {
        $host = parse_url($url, PHP_URL_HOST);
        if (!is_string($host) || $host === '') {
            throw new \RuntimeException('URL has no host: ' . $url);
        }

        // If the host is already a literal IP, check it directly.
        if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
            self::checkIp($host);
            return;
        }

        // IPv6 literal in brackets — parse_url strips the brackets.
        $stripped = trim($host, '[]');
        if ($stripped !== $host && filter_var($stripped, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) !== false) {
            self::checkIp($stripped);
            return;
        }

        // Resolve A + AAAA records and reject if any candidate target is denied.
        $ipv4 = @gethostbynamel($host);
        $ipv6 = @dns_get_record($host, DNS_AAAA);
        $candidates = [];
        if (is_array($ipv4)) {
            foreach ($ipv4 as $ip) {
                $candidates[] = $ip;
            }
        }
        if (is_array($ipv6)) {
            foreach ($ipv6 as $rec) {
                if (isset($rec['ipv6']) && is_string($rec['ipv6'])) {
                    $candidates[] = $rec['ipv6'];
                }
            }
        }
        if ($candidates === []) {
            // Unresolvable host — let curl produce the canonical "could not
            // resolve" error rather than masking it with our own message.
            return;
        }
        foreach ($candidates as $ip) {
            self::checkIp($ip);
        }
    }

    private static function checkIp(string $ip): void
    {
        $v4 = filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4);
        if ($v4 !== false) {
            self::checkIpv4($ip);
            return;
        }
        $v6 = filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6);
        if ($v6 !== false) {
            self::checkIpv6($ip);
            return;
        }
        throw new \RuntimeException('URL host is not a valid IP: ' . $ip);
    }

    private static function checkIpv4(string $ip): void
    {
        $denied = [
            '169.254.0.0/16',
            '100.64.0.0/10',
            '0.0.0.0/8',
            '224.0.0.0/4',
            '240.0.0.0/4',
        ];
        if ($ip === '255.255.255.255') {
            throw new \RuntimeException('URL resolves to a denied range: ' . $ip);
        }
        $packed = ip2long($ip);
        if ($packed === false) {
            return;
        }
        foreach ($denied as $cidr) {
            [$net, $bits] = explode('/', $cidr);
            $netLong = ip2long($net);
            if ($netLong === false) {
                continue;
            }
            $mask = $bits === '0' ? 0 : (~0 << (32 - (int) $bits)) & 0xFFFFFFFF;
            if ((($packed & $mask) === ($netLong & $mask))) {
                throw new \RuntimeException('URL resolves to a denied range: ' . $ip);
            }
        }
    }

    private static function checkIpv6(string $ip): void
    {
        $bin = @inet_pton($ip);
        if ($bin === false || strlen($bin) !== 16) {
            return;
        }
        $hex = unpack('H*', $bin);
        if ($hex === false || !isset($hex[1])) {
            return;
        }
        $h = strtolower((string) $hex[1]);

        // :: (unspecified) — but allow ::1 (loopback)
        if ($h === '00000000000000000000000000000000') {
            throw new \RuntimeException('URL resolves to a denied range: ::');
        }
        // fe80::/10 link-local
        if (str_starts_with($h, 'fe8') || str_starts_with($h, 'fe9')
            || str_starts_with($h, 'fea') || str_starts_with($h, 'feb')) {
            throw new \RuntimeException('URL resolves to a denied range: ' . $ip);
        }
        // ff00::/8 multicast
        if (str_starts_with($h, 'ff')) {
            throw new \RuntimeException('URL resolves to a denied range: ' . $ip);
        }
        // fc00::/7 unique local
        if (str_starts_with($h, 'fc') || str_starts_with($h, 'fd')) {
            throw new \RuntimeException('URL resolves to a denied range: ' . $ip);
        }
    }
}
