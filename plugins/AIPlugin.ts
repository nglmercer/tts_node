import type { IPlugin, PluginContext } from "bun_plugins";
import { ActionRegistry } from "trigger_system/node";
import { ACTIONS, LOG_MESSAGES } from "../src/constants";
import { createCommentResponder } from 'plugins/ai/workflow';
// Create responder with built-in semantic memory for context-aware responses

export class AIPlugin implements IPlugin {
  name = "ai-service";
  version = "1.0.0";

  async onLoad(context: PluginContext) {
    const { storage, log } = context;
    console.log(`${this.name} initialized`);

    // Initialize AI module

    const registry = ActionRegistry.getInstance();
    const responder = createCommentResponder({
      onResponse: (response) => {
        console.log(`\n🤖 bot: ${response.response}`);
      },
      onDecision: (_msg, decision) => {
        console.log('  [Decision:', decision.decision, ']');
      },
      minPriorityToRespond: 1,
      batchSize: 5,
    });
    // Register AI_RESPOND action
    registry.register(ACTIONS.AI_RESPOND, async (action, ctx) => {
      console.log(`[${ACTIONS.AI_RESPOND}]`, action, Object.keys(ctx));
      if (!action.params?.prompt) {
        log.warn("No prompt provided for AI_RESPOND");
        return null;
      }
      const user = String(action.params.user)
      const prompt = String(action.params.prompt);
      try {
        const response = await responder.submit({
          id: crypto.randomUUID(),
          author: user,
          content: prompt
        })
        return response;
      } catch (error) {
        log.error("AI_RESPOND error:", error);
        return null;
      }
    });
  }

  onUnload() {}
}
