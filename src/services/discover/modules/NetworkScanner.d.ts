import type { ScanOptions, ScanResult } from '../types';
/** Well-known identity endpoint path */
export declare const IDENTITY_PATH = "/.well-known/discover";
/**
 * NetworkScanner: Active LAN scanning with TCP connect + HTTP identity probing.
 *
 * Strategy:
 * 1. Fast TCP SYN-like connect to detect open ports
 * 2. HTTP probe to /.well-known/discover for identity
 * 3. Fallback: probe root / for JSON or HTML title
 */
export declare class NetworkScanner {
    /**
     * Detect the local subnet(s) automatically.
     */
    static getLocalSubnets(): string[];
    /**
     * Parse a CIDR subnet into an array of IPs.
     * Supports /24, /16, etc. Caps at 254 hosts for safety.
     */
    static parseSubnet(cidr: string): string[];
    /**
     * Fast TCP connect check. Returns true if port is open.
     */
    static tcpConnect(ip: string, port: number, timeoutMs: number): Promise<boolean>;
    /**
     * HTTP identity probe. Tries /.well-known/discover first, then falls back to /.
     */
    static httpProbe(ip: string, port: number, timeoutMs: number): Promise<ScanResult>;
    /**
     * Scan a network for services.
     *
     * Uses a two-phase approach:
     * 1. Fast TCP connect to find open ports
     * 2. HTTP identity probe on open ports only
     *
     * This is MUCH faster than the naive approach of HTTP-probing every IP.
     */
    static scan(options?: ScanOptions): Promise<ScanResult[]>;
}
