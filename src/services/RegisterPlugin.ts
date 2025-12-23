import type { IPlugin, PluginContext } from "bun_plugins";
import { ActionRegistry } from "trigger_system/node";

export class ActionRegistryPlugin implements IPlugin {
  name = "action-registry";
  version = "1.0.0";
  
  private get registry() {
    return ActionRegistry.getInstance();
  }

  constructor() {
    console.log(`${this.name} v${this.version}`);
    this.getSharedApi = this.getSharedApi.bind(this);
  }

  onLoad(context: PluginContext) {
    console.log(`${this.name} v${this.version} onLoad`);
  }

  onUnload() {
    console.log(`${this.name} v${this.version} onUnload`);
  }

  getSharedApi() {
    const registry = this.registry;
    console.log(`${this.name} v${this.version} getSharedApi`);
    return {
      register: registry.register.bind(registry),
      get: registry.get.bind(registry),
      registry: registry
    };
  }
}