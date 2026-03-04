import type { IPlugin, PluginContext } from "bun_plugins";
import { PLUGIN_NAMES, ACTIONS, HELPERS,PLATFORMS } from "../src/constants";
import { getRegistryPlugin } from "./Interface/ActionRegistryApi";
import { startListener,simulateEvent,EventTypeValue,stringKeyToKeycode,type KeyCode } from "rdev-node";
import { InputManager } from "./input/main"
export class inputPlugin implements IPlugin {
  name = "input-plugin";
  version = "1.0.0";
  private context?: PluginContext;
  private isListener?: boolean = false;

  async onLoad(context: PluginContext) {
    this.context = context;
    const inputManager = new InputManager();
    const registryPlugin = await getRegistryPlugin(context);
    if (!registryPlugin) return;
    registryPlugin.registry.register(ACTIONS.SEVENT, (action, ctx) => {
        const keysParam = action?.params?.keys || action?.params?.key;
        const type = String(action?.params?.type || "Tap"); 
        
        if (!keysParam) {
            console.warn("[InputPlugin] No keys provided for simulation");
            return false;
        }

        const keys = Array.isArray(keysParam) ? keysParam : [String(keysParam)];

        for (const keyItem of keys) {
            const keyName = String(keyItem || "");
            const key = stringKeyToKeycode(keyName);
            if (!key) {
                console.error(`[InputPlugin] Invalid key name: ${keyName}`);
                continue;
            }

            if (type === "KeyPress" || type === "Tap") {
                simulateEvent({
                    eventType: EventTypeValue.KeyPress,
                    time: 0,
                    keyPress: { key }
                });
            }

            if (type === "KeyRelease" || type === "Tap") {
                simulateEvent({
                    eventType: EventTypeValue.KeyRelease,
                    time: 0,
                    keyRelease: { key }
                });
            }
        }
        return true;
    });
    this.list(inputManager);
    //const spaceKey = stringKeyToKeycode("space");
    //const alt = stringKeyToKeycode("alt");

  }
  list(inputManager:InputManager) {
    if (this.isListener) return;
    this.isListener = true;
    this.context?.log.info("input-plugin onLoad");
    inputManager.register("Ctrl+Shift+1", () => {
      console.log("Ctrl+Shift+1 pressed!")
      this.context?.emit(PLATFORMS.SYSTEM, { eventName: 'test_trigger', data: {} });
    })
  }
  onUnload() {
    this.isListener = false;
  }


}
