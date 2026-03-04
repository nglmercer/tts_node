import { startListener,EventTypeValue,stringKeyToKeycode,type KeyCode } from "rdev-node";

export class InputManager {
  private pressedKeys = new Set<KeyCode>();
  private shortcuts = new Map<string, () => void>();
  private activeShortcuts = new Set<string>();

  constructor() {
    this.init();
  }

  private init() {
    startListener((event) => {
      const { eventType, keyPress, keyRelease } = event;

      if (eventType === EventTypeValue.KeyPress && keyPress) {
        this.pressedKeys.add(keyPress.key);
        this.checkShortcuts();
      } 
      else if (eventType === EventTypeValue.KeyRelease && keyRelease) {
        this.pressedKeys.delete(keyRelease.key);
        this.activeShortcuts.clear(); 
      }
      return event;
    });
  }

  /**
   * Registra un shortcut
   */
  register(combo: string, callback: () => void) {
    const normalizedCombo = combo
      .split('+')
      .map(p => {
        const code = stringKeyToKeycode(p.trim());
        if (code === undefined) throw new Error(`Key no válida: ${p}`);
        return code;
      })
      .sort()
      .join(',');

    this.shortcuts.set(normalizedCombo, callback);
  }

  private checkShortcuts() {
    const currentKeysHash = Array.from(this.pressedKeys).sort().join(',');

    this.shortcuts.forEach((callback, comboHash) => {
      if (this.isComboPressed(comboHash) && !this.activeShortcuts.has(comboHash)) {
        callback();
        this.activeShortcuts.add(comboHash);
      }
    });
  }

  private isComboPressed(comboHash: string): boolean {
    const comboKeys = comboHash.split(',');
    return comboKeys.every(key => this.pressedKeys.has(stringKeyToKeycode(key)!));
  }
}