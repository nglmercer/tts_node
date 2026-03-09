// Use variable to export default plugin with rcon or p2p
// Change USE_P2P to true to use P2P, false to use RCON
const USE_P2P = false;

import type { IPlugin, PluginContext } from "bun_plugins";
import { definePlugin } from "bun_plugins";

// Import both plugins
import rconPlugin from "./rcon";
import p2pPlugin from "./p2p";

// Export the selected plugin based on the USE_P2P variable
const defaultPlugin: ReturnType<typeof definePlugin> = USE_P2P ? p2pPlugin : rconPlugin;

export default defaultPlugin;
