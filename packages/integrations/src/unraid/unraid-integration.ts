import { fetchWithTrustedCertificatesAsync } from "@homarr/certificates/server";
import { logger } from "@homarr/log";

import { HandleIntegrationErrors } from "../base/errors/decorator";
import type { IntegrationTestingInput } from "../base/integration";
import { Integration } from "../base/integration";
import type { TestingResult } from "../base/test-connection/test-connection-service";
import type { IClusterHealthMonitoringIntegration } from "../interfaces/health-monitoring/health-monitoring-integration";
import { UnraidApiErrorHandler } from "./unraid-error-handler";
import type {
  LxcResource,
  NodeResource,
  QemuResource,
  StorageResource,
} from "../proxmox/proxmox-types";
import type { ClusterHealthMonitoring } from "../interfaces/health-monitoring/health-monitoring-types";

interface UnraidGraphQLResponse<T> {
  data?: T;
  errors?: Array<{
    message: string;
    extensions?: {
      code?: string;
    };
  }>;
}

interface UnraidSystemInfo {
  info: {
    id: string;
    time: string;
    baseboard: {
      id: string;
      manufacturer: string;
      model: string;
      memMax: number; // Total memory capacity in bytes
      memSlots: number;
    };
    cpu: {
      id: string;
      manufacturer: string;
      brand: string;
      vendor?: string;
      family?: string;
      model?: string;
      stepping?: number;
      revision?: string;
      voltage?: string;
      cores: number;
      threads: number;
      processors?: number;
      socket?: string;
      speed: number;
      speedmin: number;
      speedmax: number;
      cache?: {
        l1d?: number;
        l1i?: number;
        l2?: number;
        l3?: number;
      };
      flags?: string[];
    };
    memory: {
      id: string;
      layout: Array<{
        id: string;
        size: number; // Memory size per stick in bytes
        bank?: string;
        type: string;
        clockSpeed?: number;
        partNum?: string;
        serialNum?: string;
        manufacturer: string;
        formFactor?: string;
      }>;
    };
    devices?: {
      id: string;
      network?: Array<{
        id: string;
        iface: string;
        model?: string;
        vendor?: string;
        mac?: string;
        virtual?: boolean;
        speed?: string;
        dhcp?: boolean;
      }>;
      gpu?: Array<{
        id: string;
        type?: string | null; // May be null for some GPU items
        typeid: string;
        blacklisted: boolean;
        class: string;
        productid: string;
        vendorname?: string;
      }> | null;
      usb?: Array<{
        id: string;
        name: string;
        bus?: string;
        device?: string;
      }>;
    };
    os: {
      id: string;
      platform: string;
      distro: string;
      release: string;
      uptime: string; // DateTime string like "2025-10-31T14:13:38.634Z"
      hostname: string;
      fqdn: string;
      kernel: string;
      arch: string;
      serial: string; // License ID
    };
    system: {
      id: string;
      manufacturer: string;
      model: string;
      uuid: string;
    };
    versions?: {
      core?: {
        unraid?: string;
        api?: string;
        kernel?: string;
      };
    };
  };
}

interface UnraidNetworkInfo {
  network: {
    accessUrls: Array<{
      type: string;
      name: string;
      ipv4: string | null;
      ipv6: string | null;
    }>;
  };
}

interface UnraidUpsDevice {
  id: string;
  name: string;
  model: string;
  status: string;
  battery: {
    chargeLevel: number;
    estimatedRuntime: number;
    health: string;
  } | null;
  power: {
    inputVoltage: number;
    outputVoltage: number;
    loadPercentage: number;
  } | null;
}

interface UnraidUpsInfo {
  upsDevices: UnraidUpsDevice[];
}

// Old interface - removed, using new UnraidArrayInfo with parities/disks/caches

interface UnraidGraphQLArrayDisks {
  array: {
    disks: Array<{
      name: string;
      size: number;
      status: string;
      temp: number | null;
    }>;
  };
}

interface UnraidGraphQLVms {
  vms: {
    id: string;
    domains: Array<{
      id: string;
      name: string;
      state: string;
    }>;
  } | null;
}

interface UnraidGraphQLDockers {
  docker: {
    containers: Array<{
      id: string;
      names: string[];
      image?: string;
      imageId?: string;
      command?: string;
      created?: number;
      state: string;
      status: string;
      autoStart: boolean;
      sizeRootFs?: number;
      ports?: Array<{
        ip?: string;
        privatePort: number;
        publicPort: number | null;
        type: string;
      }>;
      labels?: Record<string, unknown>;
      hostConfig?: {
        networkMode?: string;
      };
      networkSettings?: Record<string, unknown>;
      mounts?: Array<Record<string, unknown>>;
    }>;
  };
}

interface UnraidMetrics {
  metrics: {
    id: string;
    cpu?: {
      id: string;
      percentTotal: number; // CPU usage percentage (0-100)
      cpus?: Array<{
        percentTotal: number;
        percentUser?: number;
        percentSystem?: number;
        percentNice?: number;
        percentIdle?: number;
        percentIrq?: number;
        percentGuest?: number;
        percentSteal?: number;
      }>;
    };
    memory?: {
      id: string;
      total: number; // Total memory in bytes (number, not string!)
      used: number; // Used memory in bytes (number, not string!)
      free?: number; // Free memory in bytes
      available?: number; // Available memory in bytes
      buffcache?: number; // Buffer/cache memory in bytes
      percentTotal: number; // Memory usage percentage (0-100)
      swapTotal?: number;
      swapUsed?: number;
      percentSwapTotal?: number;
    };
  };
}

interface UnraidArrayDisk {
  name: string;
  size: number;
  status: string;
  temp: number | null;
}

interface UnraidArrayDiskDetail {
  id: string;
  idx: number;
  name: string;
  device: string;
  type: string; // PARITY, DATA, CACHE
  size: number; // Size in KB
  status: string; // DISK_OK, etc.
  fsUsed: number | null; // Used space in KB (null for parity or unformatted)
  fsSize: number | null; // Total filesystem size in KB (null for parity or unformatted)
  fsFree: number | null; // Free space in KB (null for parity or unformatted)
  temp: number | null; // Temperature in Celsius
  isSpinning: boolean | null;
  numReads: number | null; // I/O read count
  numWrites: number | null; // I/O write count
  numErrors: number | null; // Unrecoverable errors
  color: string | null; // ArrayDiskFsColor enum (GREEN_ON, RED_ON, etc.)
  warning: number | null; // Disk space warning threshold (%)
  critical: number | null; // Disk space critical threshold (%)
}

interface UnraidParityCheckStatus {
  status: string; // e.g. "incomplete", "done", "aborted", "running", "CANCELLED"
  date: string | null; // ISO date string
  duration: number | null; // duration in seconds
  speed: string | null; // speed string
  errors: number | null; // number of errors found
  progress: number | null; // 0-100 if running
  correcting: boolean | null;
  paused: boolean | null;
  running: boolean | null;
}

interface UnraidParityInfo {
  array: {
    id: string;
    state: string;
    parityCheckStatus: UnraidParityCheckStatus;
  };
}

interface UnraidRegistrationInfo {
  registration: {
    type: string; // e.g. "BASIC", "PLUS", "PRO"
  };
}

interface UnraidArrayInfo {
  array: {
    id: string;
    state: string; // STARTED, STOPPED, etc.
    parities: UnraidArrayDiskDetail[];
    disks: UnraidArrayDiskDetail[];
    caches: UnraidArrayDiskDetail[];
    capacity?: {
      kilobytes?: {
        total?: string;
        used?: string;
        free?: string;
      };
    };
  };
}

interface UnraidVm {
  id: string;
  name: string;
  state: string;
}

interface UnraidDocker {
  id: string;
  names: string[];
  image?: string;
  imageId?: string;
  command?: string;
  created?: number;
  state: string;
  status: string;
  autoStart: boolean;
  sizeRootFs?: number;
  ports?: Array<{
    ip?: string;
    privatePort: number;
    publicPort: number | null;
    type: string;
  }>;
  labels?: Record<string, unknown>;
  hostConfig?: {
    networkMode?: string;
  };
  networkSettings?: Record<string, unknown>;
  mounts?: Array<Record<string, unknown>>;
}

interface UnraidServer {
  server: {
    id: string;
    name: string;
    guid: string;
    status: string;
    wanip: string;
    lanip: string;
    localurl: string;
    remoteurl: string;
  };
}

interface UnraidShare {
  id: string;
  name: string | null;
  free: number | null; // KB
  used: number | null; // KB
  size: number | null; // KB
  cache: boolean | null;
  comment: string | null;
}

interface UnraidSharesInfo {
  shares: UnraidShare[];
}

@HandleIntegrationErrors([new UnraidApiErrorHandler()])
export class UnraidIntegration extends Integration implements IClusterHealthMonitoringIntegration {
  protected async testingAsync(input: IntegrationTestingInput): Promise<TestingResult> {
    // Use GraphQL query to test connection
    const query = `
      query {
        info {
          os {
            platform
            distro
            release
          }
          cpu {
            manufacturer
            brand
            cores
          }
        }
      }
    `;

    const graphqlUrl = this.getGraphQLEndpoint();
    const response = await input.fetchAsync(graphqlUrl, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        query,
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        message: `Failed to connect to Unraid API: ${response.status} ${response.statusText}`,
      };
    }

    const data = (await response.json()) as UnraidGraphQLResponse<UnraidSystemInfo>;
    if (data.errors && data.errors.length > 0) {
      return {
        success: false,
        message: data.errors[0]?.message ?? "Unknown error from Unraid GraphQL API",
      };
    }

    if (!data.data) {
      return {
        success: false,
        message: "No data returned from Unraid GraphQL API",
      };
    }

    return { success: true };
  }

  public async getClusterInfoAsync(): Promise<ClusterHealthMonitoring> {
    const [systemInfo, arrayInfo, vms, dockers, metrics, serverInfo, networkInfo, upsInfo, parityInfo, registrationInfo, sharesInfo] = await Promise.all([
      this.getSystemInfoAsync(),
      this.getArrayInfoAsync(),
      this.getVmsAsync(),
      this.getDockersAsync(),
      this.getMetricsAsync(),
      this.getServerInfoAsync(),
      this.getNetworkInfoAsync(),
      this.getUpsInfoAsync(),
      this.getParityStatusAsync(),
      this.getRegistrationAsync(),
      this.getSharesAsync(),
    ]);

    // Calculate total memory from baseboard or sum of memory sticks
    const totalMemoryBytes =
      systemInfo.info.baseboard?.memMax ||
      systemInfo.info.memory?.layout?.reduce((sum, stick) => sum + stick.size, 0) ||
      0;

    // Get memory usage from metrics if available
    // Memory values come as numbers (BigInt serialized as number in JSON)
    // Note: metrics.memory.used includes buffcache, so we calculate actual used as total - available
    // This gives us the real memory usage excluding cached data
    const memoryTotal = metrics?.metrics?.memory?.total ?? totalMemoryBytes;
    const memoryAvailable = metrics?.metrics?.memory?.available ?? 0;
    const memoryUsed = memoryTotal - memoryAvailable; // Actual used memory (excluding buffcache)

    // Get CPU utilization from metrics (convert percentage 0-100 to 0-1 range)
    const cpuUtilization = metrics?.metrics?.cpu?.percentTotal
      ? metrics.metrics.cpu.percentTotal / 100
      : 0;

    // Calculate total storage for node (sum of all array disks)
    // Exclude disks with 0% usage (parity/raid disks that don't provide extra space)
    const allArrayDisks = [...arrayInfo.parities, ...arrayInfo.disks, ...arrayInfo.caches];
    // Filter out disks with 0% usage (parity disks and unformatted disks)
    const usableDisks = allArrayDisks.filter((disk) => {
      const diskSizeBytes = disk.size * 1024;
      const diskUsedBytes = (disk.fsUsed ?? 0) * 1024;
      const diskUsedPercent = diskSizeBytes > 0 ? (diskUsedBytes / diskSizeBytes) * 100 : 0;
      return diskUsedPercent > 0 || disk.fsSize !== null; // Include disks with actual filesystem or usage
    });
    const totalArraySizeBytes = usableDisks.reduce((sum, disk) => {
      // Use fsSize if available, otherwise use disk size
      const diskSize = (disk.fsSize ?? disk.size) * 1024;
      return sum + diskSize;
    }, 0);
    const totalArrayUsedBytes = usableDisks.reduce(
      (sum, disk) => sum + ((disk.fsUsed ?? 0) * 1024),
      0,
    );
    const totalStoragePercent = totalArraySizeBytes > 0 ? (totalArrayUsedBytes / totalArraySizeBytes) * 100 : 0;

    // Map system info to node resource
    // Use server name if available, otherwise fallback to system model or CPU brand
    const serverName = serverInfo?.name || systemInfo.info.os.hostname || systemInfo.info.system?.model || `${systemInfo.info.cpu.brand || "Unraid"} Server`;
    
    // Get license type from registration API
    const licenseType = registrationInfo?.type || "Unknown";
    const unraidVersion = systemInfo.info.versions?.core?.unraid || "Unknown";
    
    // Get LAN IP from network access URLs (prefer LAN IPv4)
    const lanIp = networkInfo?.accessUrls?.find((url) => url.type === "LAN" && url.ipv4)?.ipv4 || 
                  networkInfo?.accessUrls?.find((url) => url.ipv4)?.ipv4 || 
                  null;
    // Extract IP from URL (e.g., "https://192.168.68.123:3443/" -> "192.168.68.123")
    const ipAddress = lanIp ? lanIp.replace(/^https?:\/\/([^:]+).*$/, "$1") : null;
    
    // Get processor info
    const processorInfo = systemInfo.info.cpu.brand || "Unknown";
    
    // Get RAM info - format nicely with total, type and manufacturer
    const ramTotalGB = (memoryTotal || totalMemoryBytes) / (1024 ** 3);
    const ramSticks = systemInfo.info.memory?.layout || [];
    const ramType = ramSticks.length > 0 ? ramSticks[0].type : null;
    const ramManufacturer = ramSticks.length > 0 ? ramSticks[0].manufacturer : null;
    
    let ramInfo = `${ramTotalGB.toFixed(0)} GB`;
    if (ramType) {
      ramInfo += ` ${ramType}`;
    }
    if (ramManufacturer) {
      ramInfo += ` (${ramManufacturer})`;
    }
    
    // Get motherboard info separately
    const baseboard = systemInfo.info.baseboard;
    const motherboardInfo = baseboard?.manufacturer && baseboard?.model 
      ? `${baseboard.manufacturer} ${baseboard.model}` 
      : null;
    
    // Format UPS info if available
    let formattedUpsInfo = null;
    if (upsInfo && upsInfo.length > 0) {
      const ups = upsInfo[0]; // Take first UPS device
      formattedUpsInfo = {
        model: ups.model,
        status: ups.status,
        batteryLevel: ups.battery?.chargeLevel ?? null,
        batteryRuntime: ups.battery?.estimatedRuntime ?? null,
        batteryHealth: ups.battery?.health ?? null,
        loadPercentage: ups.power?.loadPercentage ?? null,
      };
    }
    
    // Format parity check status if available
    // Always include parity info for Unraid (even if query fails, we want to show the block)
    // Note: parityInfo is already the array object (UnraidParityInfo["array"]), not the full UnraidParityInfo
    let formattedParityInfo: {
      status: string;
      date: string | null;
      duration: number | null;
      speed: string | null;
      errors: number | null;
      running: boolean | null;
      progress: number | null;
      correcting: boolean | null;
      paused: boolean | null;
    } | null = null;
    
    if (parityInfo) {
      const parity = parityInfo.parityCheckStatus;
      if (parity) {
        logger.debug(`Parity status found: ${parity.status}, date: ${parity.date}`);
        formattedParityInfo = {
          status: parity.status,
          date: parity.date,
          duration: parity.duration,
          speed: parity.speed,
          errors: parity.errors,
          running: parity.running === true, // Convert null to false
          progress: parity.progress,
          correcting: parity.correcting === true, // Convert null to false
          paused: parity.paused === true, // Convert null to false
        };
      } else {
        // If array exists but no parityCheckStatus, show as unavailable
        logger.debug("Parity array exists but no parityCheckStatus");
        formattedParityInfo = {
          status: "unknown",
          date: null,
          duration: null,
          speed: null,
          errors: null,
          running: false,
          progress: null,
          correcting: null,
          paused: null,
        };
      }
    } else {
      // If parity query failed or returned null, still show block with unknown status
      // This ensures the parity block is always visible for Unraid servers
      logger.debug("Parity info is null, showing unavailable");
      formattedParityInfo = {
        status: "unavailable",
        date: null,
        duration: null,
        speed: null,
        errors: null,
        running: false,
        progress: null,
        correcting: null,
        paused: null,
      };
    }
    
    // Get swap memory info from metrics if available
    const swapTotal = metrics?.metrics?.memory?.swapTotal ?? 0;
    const swapUsed = metrics?.metrics?.memory?.swapUsed ?? 0;
    const swapPercent = swapTotal > 0 ? (swapUsed / swapTotal) * 100 : 0;
    
    // Calculate cache pool usage (sum of all cache disks)
    const cacheDisks = arrayInfo.caches || [];
    const cacheTotalBytes = cacheDisks.reduce((sum, disk) => {
      const diskSize = (disk.fsSize ?? disk.size) * 1024;
      return sum + diskSize;
    }, 0);
    const cacheUsedBytes = cacheDisks.reduce((sum, disk) => sum + ((disk.fsUsed ?? 0) * 1024), 0);
    const cachePoolPercent = cacheTotalBytes > 0 ? (cacheUsedBytes / cacheTotalBytes) * 100 : 0;
    
    // Store extra server info in status as JSON (temporary solution until we have a better way)
    // Uptime is already in node.uptime, so we don't need to include it here
    const extraInfo = JSON.stringify({
      license: licenseType,
      version: unraidVersion,
      ip: ipAddress,
      processor: processorInfo,
      ram: ramInfo,
      motherboard: motherboardInfo,
      storagePercent: totalStoragePercent,
      ups: formattedUpsInfo,
      parity: formattedParityInfo,
      arrayState: arrayInfo.state, // Array state (STARTED, STOPPED, etc.)
      cachePoolCount: arrayInfo.caches.length, // Number of cache disks
      cachePoolPercent: cachePoolPercent, // Cache pool usage percentage
      swap: swapTotal > 0 ? {
        total: swapTotal,
        used: swapUsed,
        percent: swapPercent,
      } : null,
      shares: sharesInfo?.shares?.map((share) => {
        // Calculate total size: if size is 0 or null, use used + free
        const usedKB = share.used ?? 0;
        const freeKB = share.free ?? 0;
        const sizeKB = share.size && share.size > 0 ? share.size : (usedKB + freeKB);
        
        return {
          id: share.id,
          name: share.name,
          used: usedKB * 1024, // Convert KB to bytes
          total: sizeKB * 1024, // Convert KB to bytes
          cache: share.cache ?? null, // May be missing from API response
          comment: share.comment ?? null, // May be missing from API response
        };
      }) || [],
      // Per-core CPU data
      cpuCores: metrics?.metrics?.cpu?.cpus?.map((core) => ({
        percentTotal: core.percentTotal,
        percentUser: core.percentUser,
        percentSystem: core.percentSystem,
        percentIdle: core.percentIdle,
      })) || [],
      // CPU details
      cpuDetails: {
        vendor: systemInfo.info.cpu.vendor,
        family: systemInfo.info.cpu.family,
        model: systemInfo.info.cpu.model,
        stepping: systemInfo.info.cpu.stepping,
        processors: systemInfo.info.cpu.processors,
        socket: systemInfo.info.cpu.socket,
        cache: systemInfo.info.cpu.cache,
        flagsCount: systemInfo.info.cpu.flags?.length || 0,
      },
      // Memory layout details
      memoryLayout: systemInfo.info.memory?.layout?.map((stick) => ({
        id: stick.id,
        size: stick.size,
        bank: stick.bank,
        type: stick.type,
        clockSpeed: stick.clockSpeed,
        partNum: stick.partNum,
        serialNum: stick.serialNum,
        manufacturer: stick.manufacturer,
        formFactor: stick.formFactor,
      })) || [],
      // USB devices
      usbDevices: systemInfo.info.devices?.usb?.map((device) => ({
        id: device.id,
        name: device.name,
        bus: device.bus,
        device: device.device,
      })) || [],
      // Docker container details (extended)
      dockerContainers: dockers.map((container) => ({
        id: container.id,
        names: container.names,
        image: container.image,
        state: container.state,
        status: container.status,
        autoStart: container.autoStart,
        sizeRootFs: container.sizeRootFs,
        networkMode: container.hostConfig?.networkMode,
        ports: container.ports?.map((port) => ({
          privatePort: port.privatePort,
          publicPort: port.publicPort,
          type: port.type,
        })) || [],
      })),
    });
    
    const node: NodeResource = {
      type: "node",
      id: "unraid-node",
      name: serverName,
      node: "unraid-node",
      isRunning: true,
      status: extraInfo, // Store extra info in status field temporarily
      cpu: {
        utilization: cpuUtilization,
        cores: systemInfo.info.cpu.cores,
      },
      memory: {
        used: memoryUsed,
        total: memoryTotal || totalMemoryBytes, // Use metrics total if available, otherwise fallback
      },
      storage: {
        used: totalArrayUsedBytes,
        total: totalArraySizeBytes,
        read: null,
        write: null,
      },
      network: {
        in: 0, // Not available in basic info query
        out: 0, // Not available in basic info query
      },
      uptime: this.parseUptimeToSeconds(systemInfo.info.os.uptime),
      haState: null,
    };

    // Map VMs as QemuResource (following Proxmox pattern)
    const mappedVms: QemuResource[] = vms.map((vm) => ({
      type: "qemu",
      id: `vm-${vm.id}`,
      name: vm.name,
      node: "unraid-node",
      isRunning: vm.state === "RUNNING",
      status: vm.state,
      vmId: parseInt(vm.id, 10) || 0,
      cpu: {
        utilization: 0, // Not available in basic VM query
        cores: 0, // Not available in basic VM query
      },
      memory: {
        used: 0, // Not available in basic VM query
        total: 0, // Not available in basic VM query
      },
      storage: {
        used: 0,
        total: 0,
        read: null,
        write: null,
      },
      network: {
        in: null,
        out: null,
      },
      uptime: 0,
      haState: null,
    }));

    // Map Docker containers as LxcResource (similar to Proxmox LXCs)
    const mappedDockers: LxcResource[] = dockers.map((docker) => ({
      type: "lxc",
      id: `docker-${docker.id}`,
      name: docker.names[0] || docker.id, // Use first name from array
      node: "unraid-node",
      isRunning: docker.state === "RUNNING",
      status: docker.status,
      vmId: parseInt(docker.id, 10) || 0,
      cpu: {
        utilization: 0, // Not available in basic container query
        cores: 0,
      },
      memory: {
        used: 0, // Not available in basic container query
        total: 0, // Not available in basic container query
      },
      storage: {
        used: 0,
        total: 0,
        read: null,
        write: null,
      },
      network: {
        in: null,
        out: null,
      },
      uptime: 0,
      haState: null,
    }));

    // Map storage - combine parities, disks, and caches
    // Include device and type info in the name for better identification
    const mapStorageDisk = (disk: UnraidArrayDiskDetail, prefix: string): StorageResource => {
      // Convert size from KB to bytes
      const totalBytes = (disk.size ?? 0) * 1024;
      // Use fsSize if available (actual filesystem size), otherwise use disk size
      // fsUsed is in KB, convert to bytes
      // For cache disks, fsUsed might be null, so we calculate from fsSize and fsFree if available
      let usedBytes = 0;
      let fsSizeBytes = totalBytes;
      
      if (disk.fsUsed !== null && disk.fsUsed !== undefined && disk.fsUsed > 0) {
        usedBytes = disk.fsUsed * 1024;
        fsSizeBytes = (disk.fsSize ?? disk.fsUsed) * 1024;
      } else if (disk.fsSize !== null && disk.fsSize !== undefined && disk.fsFree !== null && disk.fsFree !== undefined) {
        // Calculate used from fsSize - fsFree (for cache pools)
        fsSizeBytes = disk.fsSize * 1024;
        usedBytes = (disk.fsSize - disk.fsFree) * 1024;
      } else if (disk.fsSize !== null && disk.fsSize !== undefined) {
        fsSizeBytes = disk.fsSize * 1024;
      }

      // Build descriptive name: "parity (sdc)" or "disk1 (sdb)" or "cache (nvme1n1)"
      // Include temperature in status if available
      const tempInfo = disk.temp !== null && disk.temp !== undefined ? ` • ${disk.temp}°C` : "";
      const displayName = disk.name ? `${disk.name}${disk.device ? ` (${disk.device})` : ""}` : (disk.device || "Unknown");

      // Store extra disk metadata as JSON in status field (after the display status)
      // Format: "DISPLAY_STATUS || JSON_METADATA"
      // Only include non-null values to reduce JSON size
      const extraMetadata: Record<string, unknown> = {};
      if (disk.numReads !== null && disk.numReads !== undefined) extraMetadata.numReads = disk.numReads;
      if (disk.numWrites !== null && disk.numWrites !== undefined) extraMetadata.numWrites = disk.numWrites;
      if (disk.numErrors !== null && disk.numErrors !== undefined && disk.numErrors > 0) extraMetadata.numErrors = disk.numErrors;
      if (disk.color !== null && disk.color !== undefined) extraMetadata.color = disk.color;
      if (disk.isSpinning !== null && disk.isSpinning !== undefined) extraMetadata.isSpinning = disk.isSpinning;
      if (disk.warning !== null && disk.warning !== undefined) extraMetadata.warning = disk.warning;
      if (disk.critical !== null && disk.critical !== undefined) extraMetadata.critical = disk.critical;
      if (disk.device) extraMetadata.device = disk.device;
      if (disk.type) extraMetadata.type = disk.type;
      
      const metadataJson = Object.keys(extraMetadata).length > 0 ? JSON.stringify(extraMetadata) : "";
      const displayStatus = `${disk.type || "DATA"} - ${disk.status || "UNKNOWN"}${tempInfo}`;
      const fullStatus = metadataJson ? `${displayStatus} || ${metadataJson}` : displayStatus;

      return {
        type: "storage",
        id: disk.id,
        name: displayName,
        node: "unraid-node",
        isRunning: disk.status === "DISK_OK" || disk.status?.toLowerCase().includes("ok"),
        status: fullStatus,
        storagePlugin: "unraid",
        used: usedBytes,
        total: fsSizeBytes || totalBytes, // Use filesystem size if available, otherwise disk size
        isShared: false,
      };
    };

    const mappedStorages: StorageResource[] = [
      ...arrayInfo.parities.map((disk) => mapStorageDisk(disk, "parity")),
      ...arrayInfo.disks.map((disk) => mapStorageDisk(disk, "data")),
      ...arrayInfo.caches.map((disk) => mapStorageDisk(disk, "cache")),
    ];

    logger.info(
      `Found resources in Unraid: node=1 vms=${vms.length} dockers=${dockers.length} storages=${mappedStorages.length} (${arrayInfo.parities.length} parity, ${arrayInfo.disks.length} data, ${arrayInfo.caches.length} cache)`,
    );

    return {
      nodes: [node],
      lxcs: mappedDockers, // Docker containers mapped as LXCs
      vms: mappedVms,
      storages: mappedStorages,
    };
  }

  private async getServerInfoAsync(): Promise<UnraidServer["server"] | null> {
    const query = `
      query {
        server {
          id
          name
          guid
          status
          wanip
          lanip
          localurl
          remoteurl
        }
      }
    `;

    try {
      const response = await this.executeGraphQLQueryAsync<UnraidServer>(query);

      if (!response.data?.server) {
        logger.warn("Failed to fetch server info: no data returned");
        return null;
      }

      return response.data.server;
    } catch (error) {
      logger.warn(`Failed to fetch server info: ${error instanceof Error ? error.message : "Unknown error"}`);
      return null;
    }
  }

  private async getNetworkInfoAsync(): Promise<UnraidNetworkInfo["network"] | null> {
    const query = `
      query {
        network {
          accessUrls {
            type
            name
            ipv4
            ipv6
          }
        }
      }
    `;

    try {
      const response = await this.executeGraphQLQueryAsync<UnraidNetworkInfo>(query);

      if (!response.data?.network) {
        logger.warn("Failed to fetch network info: no data returned");
        return null;
      }

      return response.data.network;
    } catch (error) {
      logger.warn(`Failed to fetch network info: ${error instanceof Error ? error.message : "Unknown error"}`);
      return null;
    }
  }

  private async getUpsInfoAsync(): Promise<UnraidUpsInfo["upsDevices"] | null> {
    const query = `
      query {
        upsDevices {
          id
          name
          model
          status
          battery {
            chargeLevel
            estimatedRuntime
            health
          }
          power {
            inputVoltage
            outputVoltage
            loadPercentage
          }
        }
      }
    `;

    try {
      const response = await this.executeGraphQLQueryAsync<UnraidUpsInfo>(query);

      if (!response.data?.upsDevices || response.data.upsDevices.length === 0) {
        // No UPS devices found, return null
        return null;
      }

      return response.data.upsDevices;
    } catch (error) {
      logger.warn(`Failed to fetch UPS info: ${error instanceof Error ? error.message : "Unknown error"}`);
      return null;
    }
  }

  private async getParityStatusAsync(): Promise<UnraidParityInfo["array"] | null> {
    const query = `
      query {
        array {
          id
          state
          parityCheckStatus {
            status
            date
            duration
            speed
            errors
            progress
            correcting
            paused
            running
          }
        }
      }
    `;

    try {
      const response = await this.executeGraphQLQueryAsync<UnraidParityInfo>(query);

      if (!response.data?.array) {
        logger.warn("Failed to fetch parity status: no data returned");
        return null;
      }

      return response.data.array;
    } catch (error) {
      logger.warn(`Failed to fetch parity status: ${error instanceof Error ? error.message : "Unknown error"}`);
      return null;
    }
  }

  private async getRegistrationAsync(): Promise<UnraidRegistrationInfo["registration"] | null> {
    const query = `
      query {
        registration {
          type
        }
      }
    `;

    try {
      const response = await this.executeGraphQLQueryAsync<UnraidRegistrationInfo>(query);

      if (!response.data?.registration) {
        logger.warn("Failed to fetch registration info: no data returned");
        return null;
      }

      return response.data.registration;
    } catch (error) {
      logger.warn(`Failed to fetch registration info: ${error instanceof Error ? error.message : "Unknown error"}`);
      return null;
    }
  }

  private async getSharesAsync(): Promise<UnraidSharesInfo | null> {
    const query = `
      query {
        shares {
          id
          name
          free
          used
          size
          cache
          comment
        }
      }
    `;

    try {
      const response = await this.executeGraphQLQueryAsync<UnraidSharesInfo>(query);

      if (!response.data?.shares) {
        logger.warn("Failed to fetch shares info: no data returned");
        return null;
      }

      return response.data;
    } catch (error) {
      logger.warn(`Failed to fetch shares info: ${error instanceof Error ? error.message : "Unknown error"}`);
      return null;
    }
  }

  private async getArrayInfoAsync(): Promise<UnraidArrayInfo["array"]> {
    const query = `
      query {
        array {
          id
          state
          capacity {
            kilobytes {
              total
              used
              free
            }
          }
          parities {
            id
            idx
            name
            device
            type
            size
            status
            fsUsed
            fsSize
            fsFree
            temp
            isSpinning
            numReads
            numWrites
            numErrors
            color
            warning
            critical
          }
          disks {
            id
            idx
            name
            device
            type
            size
            status
            fsUsed
            fsSize
            fsFree
            temp
            isSpinning
            numReads
            numWrites
            numErrors
            color
            warning
            critical
          }
          caches {
            id
            idx
            name
            device
            type
            size
            status
            fsUsed
            fsSize
            fsFree
            temp
            isSpinning
            numReads
            numWrites
            numErrors
            color
            warning
            critical
            fsType
          }
        }
      }
    `;

    try {
      const response = await this.executeGraphQLQueryAsync<UnraidArrayInfo>(query);

      if (!response.data?.array) {
        throw new Error("Failed to fetch array info: no data returned");
      }

      return response.data.array;
    } catch (error) {
      logger.warn(`Failed to fetch array info: ${error instanceof Error ? error.message : "Unknown error"}`);
      // Return empty structure on error
      return {
        id: "",
        state: "unknown",
        parities: [],
        disks: [],
        caches: [],
      };
    }
  }

  /**
   * Parse uptime DateTime string to seconds
   * Input format: "2025-10-31T14:13:38.634Z"
   * Returns seconds since that timestamp
   */
  private parseUptimeToSeconds(uptimeString: string): number {
    try {
      const uptimeDate = new Date(uptimeString);
      const now = new Date();
      return Math.floor((now.getTime() - uptimeDate.getTime()) / 1000);
    } catch {
      return 0;
    }
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    // Add API key - required for Unraid GraphQL API
    if (this.hasSecretValue("apiKey")) {
      headers["X-API-Key"] = this.getSecretValue("apiKey");
    } else {
      throw new Error("API key is required for Unraid integration");
    }

    return headers;
  }

  /**
   * Get the GraphQL endpoint URL
   * Handles both base URLs and full /graphql URLs
   */
  private getGraphQLEndpoint(): string {
    const baseUrl = this.integration.url.trim();
    // If URL already ends with /graphql, use it directly
    if (baseUrl.endsWith("/graphql")) {
      return baseUrl;
    }
    // Otherwise, append /graphql to the base URL
    const urlWithoutTrailingSlash = baseUrl.replace(/\/$/, "");
    return `${urlWithoutTrailingSlash}/graphql`;
  }

  /**
   * Execute a GraphQL query against the Unraid API
   */
  private async executeGraphQLQueryAsync<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<UnraidGraphQLResponse<T>> {
    const response = await fetchWithTrustedCertificatesAsync(this.getGraphQLEndpoint(), {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as UnraidGraphQLResponse<T>;

    if (data.errors && data.errors.length > 0) {
      const errorMessages = data.errors.map((e) => e.message).join(", ");
      throw new Error(`GraphQL errors: ${errorMessages}`);
    }

    return data;
  }

  private async getSystemInfoAsync(): Promise<UnraidSystemInfo> {
    const query = `
      query {
        info {
          id
          time
          baseboard {
            id
            manufacturer
            model
            memMax
            memSlots
          }
          cpu {
            id
            manufacturer
            brand
            vendor
            family
            model
            stepping
            revision
            voltage
            cores
            threads
            processors
            socket
            speed
            speedmin
            speedmax
            cache
            flags
          }
          memory {
            id
            layout {
              id
              size
              bank
              type
              clockSpeed
              partNum
              serialNum
              manufacturer
              formFactor
            }
          }
          devices {
            id
            # Network interfaces query removed - API returns empty array, not useful
            # GPU query removed - Some systems have GPU items with null values for non-nullable fields
            # Since we don't use GPU information in the UI, we skip it to avoid GraphQL errors
            # gpu {
            #   id
            #   typeid
            #   blacklisted
            #   class
            #   productid
            #   vendorname
            # }
            usb {
              id
              name
              bus
              device
            }
          }
          os {
            id
            platform
            distro
            release
            uptime
            hostname
            fqdn
            kernel
            arch
            serial
          }
          system {
            id
            manufacturer
            model
            uuid
          }
          versions {
            core {
              unraid
              api
              kernel
            }
          }
        }
      }
    `;

    const response = await this.executeGraphQLQueryAsync<UnraidSystemInfo>(query);

    if (!response.data?.info) {
      throw new Error("Failed to fetch system info: no data returned");
    }

    return response.data;
  }


  private async getVmsAsync(): Promise<UnraidVm[]> {
    const query = `
      query {
        vms {
          id
          domains {
            id
            name
            state
          }
        }
      }
    `;

    try {
      const response = await this.executeGraphQLQueryAsync<UnraidGraphQLVms>(query);

      if (!response.data?.vms?.domains) {
        logger.warn("Failed to fetch VMs: no data returned");
        return [];
      }

      // Map domains to VMs
      return response.data.vms.domains.map((domain) => ({
        id: domain.id,
        name: domain.name,
        state: domain.state,
      }));
    } catch (error) {
      logger.warn(`Failed to fetch VMs: ${error instanceof Error ? error.message : "Unknown error"}`);
      return [];
    }
  }

  private async getDockersAsync(): Promise<UnraidDocker[]> {
    const query = `
      query {
        docker {
          containers(skipCache: false) {
            id
            names
            image
            imageId
            command
            created
            state
            status
            autoStart
            sizeRootFs
            ports {
              ip
              privatePort
              publicPort
              type
            }
            labels
            hostConfig {
              networkMode
            }
            networkSettings
            mounts
          }
        }
      }
    `;

    try {
      const response = await this.executeGraphQLQueryAsync<UnraidGraphQLDockers>(query);

      if (!response.data?.docker?.containers) {
        logger.warn("Failed to fetch Docker containers: no data returned");
        return [];
      }

      // Map to UnraidDocker interface
      return response.data.docker.containers.map((container) => ({
        id: container.id,
        names: container.names,
        image: container.image,
        imageId: container.imageId,
        command: container.command,
        created: container.created,
        state: container.state,
        status: container.status,
        autoStart: container.autoStart,
        sizeRootFs: container.sizeRootFs,
        ports: container.ports,
        labels: container.labels,
        hostConfig: container.hostConfig,
        networkSettings: container.networkSettings,
        mounts: container.mounts,
      }));
    } catch (error) {
      logger.warn(`Failed to fetch Docker containers: ${error instanceof Error ? error.message : "Unknown error"}`);
      return [];
    }
  }

  private async getMetricsAsync(): Promise<UnraidMetrics | null> {
    const query = `
      query {
        metrics {
          id
          cpu {
            id
            percentTotal
            cpus {
              percentTotal
              percentUser
              percentSystem
              percentNice
              percentIdle
              percentIrq
              percentGuest
              percentSteal
            }
          }
          memory {
            id
            total
            used
            available
            free
            buffcache
            active
            percentTotal
            swapTotal
            swapUsed
            swapFree
            percentSwapTotal
          }
        }
      }
    `;

    try {
      const response = await this.executeGraphQLQueryAsync<UnraidMetrics>(query);
      
      // Log metrics for debugging (only if data exists)
      if (response.data?.metrics) {
        const memUsedGB = ((response.data.metrics.memory?.used ?? 0) / 1024 / 1024 / 1024).toFixed(2);
        logger.debug(
          `Metrics received: CPU=${response.data.metrics.cpu?.percentTotal?.toFixed(2)}%, Memory=${response.data.metrics.memory?.percentTotal?.toFixed(2)}% (${memUsedGB}GB used)`,
        );
      } else {
        logger.warn("Metrics query returned no data");
      }
      
      return response.data || null;
    } catch (error) {
      logger.warn(`Failed to fetch metrics: ${error instanceof Error ? error.message : "Unknown error"}`);
      return null;
    }
  }
}

