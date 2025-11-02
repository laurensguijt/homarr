// Re-export Proxmox types as they match the ClusterHealthMonitoring interface
export type {
  ComputeResourceBase,
  LxcResource,
  NodeResource,
  QemuResource,
  StorageResource,
} from "../proxmox/proxmox-types";

// Unraid-specific cluster info that maps to ClusterHealthMonitoring
export interface UnraidClusterInfo {
  nodes: NodeResource[];
  lxcs: LxcResource[]; // Empty for Unraid, but required by interface
  vms: QemuResource[]; // Mapped from Unraid VMs
  storages: StorageResource[];
}

