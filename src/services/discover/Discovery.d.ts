import { EventEmitter } from 'events';
import type { DiscoveryOptions, ServiceInfo, DiscoveredService, ScanOptions, ScanResult } from './types';
import { Registry } from './modules/Registry';
export declare class Discovery extends EventEmitter {
    private serviceInfo;
    private port;
    private options;
    private registry;
    private network;
    private clientFactory;
    private identityServer;
    private heartbeatTimer;
    private checkOfflineTimer;
    private processHooksSet;
    private onProcessExit;
    constructor(serviceInfo: ServiceInfo, port: number, options?: DiscoveryOptions);
    private setupEvents;
    start(): Promise<void>;
    private handleMessage;
    private startTimers;
    /**
     * Actively scan the local network for services.
     * Uses TCP connect probing + HTTP identity detection.
     *
     * Results are automatically registered in the internal registry.
     *
     * @example
     * const results = await discovery.scan({ ports: [3000, 3001, 8080] });
     * results.forEach(r => console.log(`${r.ip}:${r.port} → ${r.service?.name}`));
     */
    scan(options?: ScanOptions): Promise<ScanResult[]>;
    filter(criteria: Partial<ServiceInfo>): DiscoveredService[];
    private setupProcessHooks;
    private removeProcessHooks;
    stop(): void;
    createClient(criteria: string | Partial<ServiceInfo>, loadBalancer?: 'first' | 'random' | 'round-robin'): {
        get: (path: string, options?: RequestInit) => Promise<Response>;
        post: (path: string, options?: RequestInit) => Promise<Response>;
        put: (path: string, options?: RequestInit) => Promise<Response>;
        delete: (path: string, options?: RequestInit) => Promise<Response>;
    };
    /**
     * Get the identity server instance for middleware integration.
     * Use this with Express/Hono/etc:
     *
     * @example
     * const app = express();
     * app.use(discovery.getIdentityMiddleware());
     */
    getIdentityMiddleware(): (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, next?: (() => void) | undefined) => void;
    getInternalRegistry(): Registry;
    getServiceId(): string;
}
