import http from 'http';
import type { ServiceInfo } from '../types';
/**
 * IdentityServer: A tiny HTTP server that exposes a well-known endpoint
 * for active network scanners to identify this service.
 *
 * GET /.well-known/discover → returns JSON with service info
 *
 * This can either:
 * 1. Run standalone on a separate port (if no existing HTTP server)
 * 2. Be used as middleware for Express/Koa/Hono/etc.
 */
export declare class IdentityServer {
    private server;
    private serviceInfo;
    private port;
    private meta;
    constructor(serviceInfo: ServiceInfo, port: number, meta?: Record<string, any>);
    /**
     * Returns the identity payload for this service.
     */
    getIdentity(): Record<string, any>;
    /**
     * Returns a request handler function compatible with Node's http module.
     * Can also be used as Express/Connect middleware.
     */
    middleware(): (req: http.IncomingMessage, res: http.ServerResponse, next?: () => void) => void;
    /**
     * Start a standalone identity HTTP server on the service's port.
     * Only use this if you don't have an existing HTTP server.
     * The server will ONLY respond to /.well-known/discover.
     */
    startStandalone(listenPort?: number): Promise<void>;
    stop(): void;
}
