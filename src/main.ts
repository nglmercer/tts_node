import { RuleBuilder, RuleEngine, ActionRegistry, ExpressionEngine,TriggerLoader } from 'trigger_system/node';
import { BasePluginManager } from "./services/plugin";
import { parseSocketIo42Message } from "./utils/parsejson";
import { ensureDir } from "./utils/filepath";
import * as path from "path";
/* const testdata = {
    comment:'¡Hola! 😊 ¿Cómo estás? 🤔  🌐 🌍🌎🌏',
    uniqueId:"1234567890",
    nickname:"test"
} */
// const tts = new TTSService("./output"); // Moved to plugin
const manager = new BasePluginManager();

async function main() {
    const registry = ActionRegistry.getInstance();
    await manager.loadDefaultPlugins();
    const engine = manager.engine;
    manager.on('tiktok', (raw) => {
        const data = parseSocketIo42Message(raw);
        //console.log('TikTok event received:', {raw,data});
        engine.processEventSimple(data?.eventName!, data?.data);
    });
    const rulesDir = path.resolve(process.cwd(),"rules");
    const result = ensureDir(rulesDir);
    //watcher se ejecuta despues o demora al inicializar que los demas eventos
    const watcher = TriggerLoader.watchRules(rulesDir, async (newRules) => {        
        engine.updateRules(newRules);
        const ruleIds = engine.getRules().map(r => r.id);
        const loadedPlugins = manager.listPlugins();
        console.log({
            loadedPlugins,
            ruleIds,
            length: newRules.length
        });
        
        // Ejecutar prueba mediante el plugin RuleTester
        /*         const testerPlugin = manager.getPlugin("rule-tester");
        const tester = testerPlugin?.getSharedApi ? (testerPlugin.getSharedApi() as any) : null;
        if (tester?.testEvent) {
        //    await tester.testEvent(engine, "chat", testdata);
        } */
    });
    watcher.on('error', (err) => {
        console.error('Error watching rules:', err);
    });

    return result;
}
main().then(data=>console.log(data)).catch(err=>console.log(err));
process.on("SIGINT", () => {
    console.log("\n\nShutting down...");
    process.exit(0);
});