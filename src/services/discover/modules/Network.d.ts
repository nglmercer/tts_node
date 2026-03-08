import { EventEmitter } from 'events';
import type { Message, ServiceInfo } from '../types';
export declare class Network extends EventEmitter {
    private socket;
    private senderSocket;
    private broadcastSocket;
    private options;
    private serviceInfo;
    private port;
    constructor(serviceInfo: ServiceInfo, port: number, options: Network['options']);
    getLocalInterfaces(): {
        address: string;
        broadcastAddress: string;
        internal: boolean;
    }[];
    private getLocalAddresses;
    start(): Promise<void>;
    private startMulticast;
    private startBroadcast;
    broadcastPresence(type: Message['type']): void;
    stop(): void;
}
