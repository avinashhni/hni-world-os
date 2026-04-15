export type CommandScope = "system" | "os" | "module";

export interface GlobalCommand {
  commandId: string;
  tenantId: string;
  issuedBy: string;
  scope: CommandScope;
  target: string;
  instruction: string;
  via: "voice" | "search" | "direct";
  issuedAt: string;
}

export interface EmergencyControlState {
  tenantId: string;
  killSwitchActive: boolean;
  recoveryMode: boolean;
  updatedAt: string;
}

export class GlobalCommandControlService {
  private readonly commands: GlobalCommand[] = [];
  private readonly emergencyByTenant = new Map<string, EmergencyControlState>();

  dispatch(input: Omit<GlobalCommand, "issuedAt">): GlobalCommand {
    const command: GlobalCommand = {
      ...input,
      issuedAt: new Date().toISOString(),
    };
    this.commands.push(command);
    return command;
  }

  setEmergencyControl(tenantId: string, killSwitchActive: boolean, recoveryMode: boolean): EmergencyControlState {
    const state: EmergencyControlState = {
      tenantId,
      killSwitchActive,
      recoveryMode,
      updatedAt: new Date().toISOString(),
    };

    this.emergencyByTenant.set(tenantId, state);
    return state;
  }

  getEmergencyControl(tenantId: string): EmergencyControlState {
    return this.emergencyByTenant.get(tenantId) ?? {
      tenantId,
      killSwitchActive: false,
      recoveryMode: false,
      updatedAt: new Date().toISOString(),
    };
  }

  getCommandCount(): number {
    return this.commands.length;
  }
}
