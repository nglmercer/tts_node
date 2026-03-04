import type { IPlugin, PluginContext } from "bun_plugins";
import { definePlugin } from "bun_plugins";
import { P2PGuardianClient } from "./p2p.client";
import { PLUGIN_NAMES, ACTIONS, HELPERS } from "../../src/constants";
import { getRegistryPlugin } from "../Interface/ActionRegistryApi";

function getArray(value: string | string[]) {
    if (Array.isArray(value)) {
        return value;
    } else {
        return [value];
    }
}

/**
 * P2P Manager wrapper with singleton pattern similar to RconManager
 */
class P2PManager {
    private static instance: P2PManager;
    private client: P2PGuardianClient | null = null;
    private peerAddress: string = "";
    private isConnected: boolean = false;
    private commandQueue: Array<{ command: string; resolve: (value: string) => void; reject: (reason: Error) => void }> = [];
    private isProcessingQueue: boolean = false;

    private constructor() {}

    public static getInstance(): P2PManager {
        if (!P2PManager.instance) {
            P2PManager.instance = new P2PManager();
        }
        return P2PManager.instance;
    }

    public static resetInstance(): void {
        if (P2PManager.instance) {
            P2PManager.instance.disconnect();
            P2PManager.instance = null as any;
        }
    }

    public async connect(peerAddress: string): Promise<void> {
        this.peerAddress = peerAddress;
        this.client = new P2PGuardianClient();
        
        try {
            await this.client.initClient(0);
            console.log("[P2P] Client initialized, looking for peers...");
            
            // Wait for peer discovery
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const selfId = this.client.node?.peerId.toString();
            const peers = this.client.getDiscoveredPeers().filter(id => id !== selfId);
            
            if (peers.length > 0) {
                // Connect to the first discovered peer
                const targetPeer = peers[0];
                if (!targetPeer) {
                    console.log("[P2P] No valid peer found");
                    return;
                }
                const addrs = this.client.getPeerMultiaddrs(targetPeer);
                const bestAddr = addrs.find(a => !a.toString().includes('127.0.0.1')) || addrs[0];
                
                if (bestAddr) {
                    await this.client.connectToPeer(bestAddr);
                    this.isConnected = true;
                    console.log("[P2P] Connected to peer");
                    this.processQueue();
                }
            } else if (peerAddress) {
                // Connect to manually specified address
                await this.client.connectToPeer(peerAddress);
                this.isConnected = true;
                console.log("[P2P] Connected to peer:", peerAddress);
                this.processQueue();
            } else {
                console.log("[P2P] No peers found and no address specified");
            }
        } catch (error) {
            console.error("[P2P] Connection error:", error);
            throw error;
        }
    }

    public async send(command: string): Promise<string> {
        if (!this.isConnected || !this.client) {
            return this.queueCommand(command);
        }

        try {
            const response = await this.client.sendCommand(command);
            if (response.success) {
                return JSON.stringify(response.result);
            } else {
                throw new Error(response.error || "Command failed");
            }
        } catch (error) {
            console.error("[P2P] Command error:", error);
            return this.queueCommand(command);
        }
    }

    public async sendMultiple(commands: string[]): Promise<string[]> {
        const promises = commands.map(cmd => this.send(cmd));
        return Promise.all(promises);
    }

    private queueCommand(command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            this.commandQueue.push({ command, resolve, reject });
        });
    }

    private async processQueue(): Promise<void> {
        if (this.isProcessingQueue || this.commandQueue.length === 0 || !this.isConnected) {
            return;
        }

        this.isProcessingQueue = true;

        while (this.commandQueue.length > 0 && this.isConnected) {
            const item = this.commandQueue.shift()!;
            
            try {
                const response = await this.client!.sendCommand(item.command);
                if (response.success) {
                    item.resolve(JSON.stringify(response.result));
                } else {
                    item.reject(new Error(response.error || "Command failed"));
                }
            } catch (error) {
                item.reject(error as Error);
            }
        }

        this.isProcessingQueue = false;
    }

    public async disconnect(): Promise<void> {
        if (this.client) {
            try {
                await this.client.stop();
            } catch (error) {
                // Ignore errors during disconnect
            }
            this.client = null;
        }
        this.isConnected = false;
    }

    public getStatus(): { isConnected: boolean; queueLength: number } {
        return {
            isConnected: this.isConnected,
            queueLength: this.commandQueue.length
        };
    }
}

export default definePlugin({
    name: "minecraft-p2p",
    version: "1.0.0",
    async onLoad(context: PluginContext) {
        const registryPlugin = await getRegistryPlugin(context);
     
        if (!registryPlugin) return;
        
        console.log("Minecraft P2P plugin initialized");
        
        // Connect to P2P network - configure peer address here
        const peerAddress = ""; // Set peer address here or leave empty for auto-discovery
        const manager = P2PManager.getInstance();
        
        try {
            await manager.connect(peerAddress);
        } catch (error) {
            console.error("[P2P] Failed to connect:", error);
        }

        context.on('minecraft:command', (command: string | string[]) => {
            manager.sendMultiple(getArray(command));
        });
        
        registryPlugin.registry?.register(ACTIONS.MC_COMMAND, (action, _ctx) => {
            const msg = String(action?.params?.message);
            manager.sendMultiple(getArray(msg));
        });
    },
    onUnload() {
        P2PManager.resetInstance();
    }
});
