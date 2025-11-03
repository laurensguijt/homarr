"use client";

import { Accordion, Badge, Box, Center, Flex, Group, Paper, Progress, RingProgress, ScrollArea, Stack, Text, Tooltip, Grid } from "@mantine/core";
import { IconBrain, IconCheck, IconCpu, IconCube, IconDatabase, IconDeviceLaptop, IconServer, IconShield, IconTemperature, IconX, IconUsb } from "@tabler/icons-react";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";

const UNRAID_LOGO_URL = "https://media.invisioncic.com/u329766/monthly_2025_05/UN-logotype-gradient_1c12cf.png";

// Add CSS for pulse animation
const pulseAnimation = `
  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }
`;

import { clientApi } from "@homarr/api/client";
import { capitalize, humanFileSize } from "@homarr/common";
import type { Resource } from "@homarr/integrations/types";
import { useI18n } from "@homarr/translation/client";

import type { WidgetComponentProps } from "../../definition";
import { formatUptime } from "../system-health";
import { ResourcePopover } from "./resource-popover";

dayjs.extend(duration);

const running = (total: number, current: Resource) => {
  return current.isRunning ? total + 1 : total;
};

// Helper to format uptime without the "Uptime:" prefix
const formatUptimeTimeOnly = (uptimeInSeconds: number): string => {
  const uptimeDuration = dayjs.duration(uptimeInSeconds, "seconds");
  const months = uptimeDuration.months();
  const days = uptimeDuration.days();
  const hours = uptimeDuration.hours();
  const minutes = uptimeDuration.minutes();

  const parts: string[] = [];
  if (months > 0) parts.push(`${months} Month${months !== 1 ? "s" : ""}`);
  if (days > 0) parts.push(`${days} Day${days !== 1 ? "s" : ""}`);
  if (hours > 0) parts.push(`${hours} Hour${hours !== 1 ? "s" : ""}`);
  if (minutes > 0) parts.push(`${minutes} Minute${minutes !== 1 ? "s" : ""}`);

  return parts.join(", ") || "0 Minutes";
};

export const UnraidHealthMonitoring = ({
  integrationId,
  options,
  width,
}: WidgetComponentProps<"healthMonitoring"> & { integrationId: string }) => {
  const t = useI18n();
  const [healthData] = clientApi.widget.healthMonitoring.getClusterHealthStatus.useSuspenseQuery(
    {
      integrationId,
    },
    {
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
    },
  );

  const utils = clientApi.useUtils();
  clientApi.widget.healthMonitoring.subscribeClusterHealthStatus.useSubscription(
    { integrationId },
    {
      onData(data) {
        utils.widget.healthMonitoring.getClusterHealthStatus.setData({ integrationId }, data);
      },
    },
  );

  // Unraid is always a single server, so we take the first (and only) node
  const node = healthData.nodes[0];
  const serverName = node?.name || "Unraid Server";
  const cpuPercent = node ? node.cpu.utilization * 100 : 0;
  const memPercent = node ? (node.memory.used / node.memory.total) * 100 : 0;
  const uptime = node?.uptime || 0;

      // Parse extra server info from status (stored as JSON)
      let serverInfo: { 
        license?: string; 
        version?: string; 
        ip?: string; 
        processor?: string; 
        ram?: string;
        motherboard?: string;
        storagePercent?: number;
        arrayState?: string;
        cachePoolCount?: number;
        cachePoolPercent?: number;
        swap?: {
          total: number;
          used: number;
          percent: number;
        } | null;
        shares?: Array<{
          id: string;
          name: string | null;
          used: number;
          total: number;
          cache: boolean | null;
          comment: string | null;
        }>;
        ups?: {
          model?: string;
          status?: string;
          batteryLevel?: number;
          batteryRuntime?: number;
          batteryHealth?: string;
          loadPercentage?: number;
        } | null;
        parity?: {
          status?: string;
          date?: string | null;
          duration?: number | null;
          speed?: string | null;
          errors?: number | null;
          running?: boolean | null;
          progress?: number | null;
          correcting?: boolean | null;
          paused?: boolean | null;
        } | null;
        cpuCores?: Array<{
          percentTotal: number;
          percentUser?: number;
          percentSystem?: number;
          percentIdle?: number;
        }>;
        cpuDetails?: {
          vendor?: string;
          family?: string;
          model?: string;
          stepping?: number;
          processors?: number;
          socket?: string;
          cache?: {
            l1d?: number;
            l1i?: number;
            l2?: number;
            l3?: number;
          };
          flagsCount?: number;
        };
        memoryLayout?: Array<{
          id: string;
          size: number;
          bank?: string;
          type: string;
          clockSpeed?: number;
          partNum?: string;
          serialNum?: string;
          manufacturer: string;
          formFactor?: string;
        }>;
        usbDevices?: Array<{
          id: string;
          name: string;
          bus?: string;
          device?: string;
        }>;
        dockerContainers?: Array<{
          id: string;
          names: string[];
          image?: string;
          state: string;
          status: string;
          autoStart: boolean;
          sizeRootFs?: number;
          networkMode?: string;
          ports?: Array<{
            privatePort: number;
            publicPort: number | null;
            type: string;
          }>;
        }>;
      } | null = null;
  try {
    serverInfo = node?.status && node.status.startsWith("{") ? JSON.parse(node.status) : null;
  } catch {
    // If parsing fails, status is probably just "online"
    serverInfo = null;
  }

  const isTiny = width < 256;

  // Helper to get color based on percentage
  // All items under 70% are green, above 70% progressively orange/red
  const getUsageColor = (percent: number) => {
    if (percent > 90) return "red";
    if (percent > 75) return "orange";
    if (percent >= 70) return "yellow";
    return "green"; // Everything under 70% is green
  };

  // Helper to get storage type color - all orange (Unraid theme)
  const getStorageTypeColor = (type: string) => {
    return "orange"; // All storage types use orange (Unraid theme color)
  };

  // Helper to get array state color
  const getArrayStateColor = (state?: string) => {
    if (!state) return "gray";
    if (state === "STARTED") return "green";
    if (state === "STOPPED") return "red";
    return "orange"; // Other states like RECON_DISK, etc.
  };

  // Helper to get disk health color from color enum
  const getDiskHealthColor = (color?: string | null) => {
    if (!color) return "gray";
    if (color.includes("GREEN")) return "green";
    if (color.includes("RED")) return "red";
    if (color.includes("YELLOW")) return "yellow";
    if (color.includes("BLUE")) return "blue";
    return "gray";
  };

  return (
    <>
      <style>{pulseAnimation}</style>
      <ScrollArea h="100%">
        <Stack p="xs" gap={isTiny ? "xs" : "md"}>
      {/* Server Name */}
      <Paper p="md" radius="md" style={{ background: "var(--mantine-color-dark-7)" }}>
        <Group gap="sm" wrap="nowrap" align="flex-start" justify="space-between">
          <Stack gap="sm" style={{ flex: 1 }}>
            <Group gap="xs" wrap="nowrap" align="center">
              <Text fw={700} size={isTiny ? "sm" : "lg"}>
                {serverName}
              </Text>
              {serverInfo?.arrayState && (
                <Badge 
                  color={getArrayStateColor(serverInfo.arrayState)} 
                  variant="dot" 
                  size="sm"
                  style={{ textTransform: "none" }}
                >
                  Array {serverInfo.arrayState === "STARTED" ? "Started" : serverInfo.arrayState}
                </Badge>
              )}
            </Group>
            <Stack gap="xs">
              {serverInfo?.version && (
                <Group gap="xs" wrap="nowrap">
                  <Text size="xs" c="dimmed" style={{ minWidth: "100px" }}>
                    Unraid version:
                  </Text>
                  <Text size="xs" fw={500}>
                    {serverInfo.version}
                    {serverInfo.license && ` (${serverInfo.license} license)`}
                  </Text>
                </Group>
              )}
              {serverInfo?.ip && (
                <Group gap="xs" wrap="nowrap">
                  <Text size="xs" c="dimmed" style={{ minWidth: "100px" }}>
                    IP Address:
                  </Text>
                  <Text 
                    size="xs" 
                    fw={500}
                    style={{ cursor: "pointer", textDecoration: "underline" }}
                    onClick={() => {
                      const url = `http://${serverInfo.ip}`;
                      window.open(url, "_blank");
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "var(--mantine-color-orange-5)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "inherit";
                    }}
                  >
                    {serverInfo.ip}
                  </Text>
                </Group>
              )}
              {uptime > 0 && (
                <Group gap="xs" wrap="nowrap">
                  <Text size="xs" c="dimmed" style={{ minWidth: "100px" }}>
                    Uptime:
                  </Text>
                  <Text size="xs" fw={500}>
                    {formatUptimeTimeOnly(uptime)}
                  </Text>
                </Group>
              )}
              {serverInfo?.processor && (
                <Group gap="xs" wrap="nowrap">
                  <Text size="xs" c="dimmed" style={{ minWidth: "100px" }}>
                    Processor:
                  </Text>
                  <Text size="xs" fw={500}>
                    {serverInfo.processor}
                    {serverInfo.cpuDetails?.processors && serverInfo.cpuDetails.processors > 1 && (
                      <> ({serverInfo.cpuDetails.processors} sockets)</>
                    )}
                    {serverInfo.cpuDetails?.socket && (
                      <> • {serverInfo.cpuDetails.socket}</>
                    )}
                  </Text>
                </Group>
              )}
              {serverInfo?.cpuDetails?.cache && (
                <Group gap="xs" wrap="nowrap">
                  <Text size="xs" c="dimmed" style={{ minWidth: "100px" }}>
                    Cache:
                  </Text>
                  <Text size="xs" fw={500}>
                    L1: {humanFileSize(serverInfo.cpuDetails.cache.l1d || 0)} / {humanFileSize(serverInfo.cpuDetails.cache.l1i || 0)}
                    {serverInfo.cpuDetails.cache.l2 && ` • L2: ${humanFileSize(serverInfo.cpuDetails.cache.l2)}`}
                    {serverInfo.cpuDetails.cache.l3 && ` • L3: ${humanFileSize(serverInfo.cpuDetails.cache.l3)}`}
                  </Text>
                </Group>
              )}
              {serverInfo?.cpuDetails?.flagsCount && serverInfo.cpuDetails.flagsCount > 0 && (
                <Group gap="xs" wrap="nowrap">
                  <Text size="xs" c="dimmed" style={{ minWidth: "100px" }}>
                    CPU Flags:
                  </Text>
                  <Text size="xs" fw={500}>
                    {serverInfo.cpuDetails.flagsCount} features
                  </Text>
                </Group>
              )}
              {serverInfo?.ram && (
                <Group gap="xs" wrap="nowrap">
                  <Text size="xs" c="dimmed" style={{ minWidth: "100px" }}>
                    RAM:
                  </Text>
                  <Text size="xs" fw={500}>
                    {serverInfo.ram}
                  </Text>
                </Group>
              )}
              {serverInfo?.motherboard && (
                <Group gap="xs" wrap="nowrap">
                  <Text size="xs" c="dimmed" style={{ minWidth: "100px" }}>
                    Motherboard:
                  </Text>
                  <Text size="xs" fw={500}>
                    {serverInfo.motherboard}
                  </Text>
                </Group>
              )}
              {serverInfo?.ups && (
                <>
                  <Group gap="xs" wrap="nowrap" mt="xs" pt="xs" style={{ borderTop: "1px solid var(--mantine-color-dark-5)" }}>
                    <Text size="xs" c="dimmed" style={{ minWidth: "100px" }}>
                      UPS:
                    </Text>
                    <Text size="xs" fw={500}>
                      {serverInfo.ups.model} ({serverInfo.ups.status})
                    </Text>
                  </Group>
                  {(serverInfo.ups.batteryLevel !== null || serverInfo.ups.loadPercentage !== null) && (
                    <Group gap="xs" wrap="nowrap">
                      <Text size="xs" c="dimmed" style={{ minWidth: "100px" }}>
                        Battery:
                      </Text>
                      <Text size="xs" fw={500}>
                        {serverInfo.ups.batteryLevel !== null && `${serverInfo.ups.batteryLevel}%`}
                        {serverInfo.ups.batteryRuntime !== null && ` (${serverInfo.ups.batteryRuntime} min)`}
                        {serverInfo.ups.batteryHealth && ` - ${serverInfo.ups.batteryHealth}`}
                        {serverInfo.ups.loadPercentage !== null && (
                          <>
                            {serverInfo.ups.batteryLevel !== null && " • "}
                            {serverInfo.ups.loadPercentage}%
                          </>
                        )}
                      </Text>
                    </Group>
                  )}
                </>
              )}
            </Stack>
          </Stack>
          <Box
            style={{
              background: "var(--mantine-color-dark-8)",
              borderRadius: "8px",
              padding: isTiny ? "8px" : "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: isTiny ? "56px" : "72px",
              minHeight: isTiny ? "56px" : "72px",
            }}
          >
            <img
              src={UNRAID_LOGO_URL}
              alt="Unraid"
              style={{
                width: isTiny ? "40px" : "48px",
                height: isTiny ? "40px" : "48px",
                objectFit: "contain",
              }}
            />
          </Box>
        </Group>
      </Paper>

      {/* CPU, RAM, Storage, Cache Pool and Parity Stats */}
      {(options.cpu || options.memory || serverInfo?.storagePercent !== undefined || (serverInfo?.cachePoolCount !== undefined && serverInfo.cachePoolCount > 0)) && (
        <Paper p="md" radius="md" style={{ background: "var(--mantine-color-dark-7)" }}>
          <Group gap="md" justify="center" wrap="wrap">
            {options.cpu && (
              <Paper p="sm" radius="md" style={{ background: "var(--mantine-color-dark-8)", border: `1px solid var(--mantine-color-dark-5)`, flex: "1 1 0", minWidth: isTiny ? "100px" : "150px", maxWidth: isTiny ? "120px" : "180px", height: isTiny ? "160px" : "200px", display: "flex", flexDirection: "column" }}>
                <Flex direction="column" gap="xs" align="center" style={{ flex: 1, justifyContent: "space-between" }}>
                  <RingProgress
                    roundCaps
                    size={isTiny ? 64 : 80}
                    thickness={isTiny ? 6 : 8}
                    label={
                      <Center>
                        <IconCpu size={isTiny ? 20 : 28} color="var(--mantine-color-gray-4)" />
                      </Center>
                    }
                    sections={[{ value: cpuPercent, color: getUsageColor(cpuPercent) }]}
                  />
                  <Stack gap={2} align="center">
                    <Text fw={600} size={isTiny ? "sm" : "md"}>
                      CPU
                    </Text>
                    <Text fw={700} size={isTiny ? "md" : "lg"}>{cpuPercent.toFixed(1)}%</Text>
                    {node && <Text size="xs" c="dimmed">{node.cpu.cores} cores</Text>}
                    {serverInfo?.cpuDetails?.cache && (
                      <Text size="xs" c="dimmed" ta="center" lineClamp={1}>
                        L3: {humanFileSize(serverInfo.cpuDetails.cache.l3 || 0)}
                      </Text>
                    )}
                  </Stack>
                </Flex>
              </Paper>
            )}
            {options.memory && (
              <Paper p="sm" radius="md" style={{ background: "var(--mantine-color-dark-8)", border: `1px solid var(--mantine-color-dark-5)`, flex: "1 1 0", minWidth: isTiny ? "100px" : "150px", maxWidth: isTiny ? "120px" : "180px", height: isTiny ? "160px" : "200px", display: "flex", flexDirection: "column" }}>
                <Flex direction="column" gap="xs" align="center" style={{ flex: 1, justifyContent: "space-between" }}>
                  <RingProgress
                    roundCaps
                    size={isTiny ? 64 : 80}
                    thickness={isTiny ? 6 : 8}
                    label={
                      <Center>
                        <IconBrain size={isTiny ? 20 : 28} color="var(--mantine-color-gray-4)" />
                      </Center>
                    }
                    sections={[{ value: memPercent, color: getUsageColor(memPercent) }]}
                  />
                  <Stack gap={2} align="center">
                    <Text fw={600} size={isTiny ? "sm" : "md"}>
                      RAM
                    </Text>
                    <Text fw={700} size={isTiny ? "md" : "lg"}>{memPercent.toFixed(1)}%</Text>
                    {node && (
                      <Text size="xs" c="dimmed" ta="center">
                        {humanFileSize(node.memory.used)} / {humanFileSize(node.memory.total)}
                      </Text>
                    )}
                    {serverInfo?.swap && serverInfo.swap.total > 0 && (
                      <Text size="xs" c="dimmed" ta="center">
                        Swap: {serverInfo.swap.percent.toFixed(1)}% ({humanFileSize(serverInfo.swap.used)} / {humanFileSize(serverInfo.swap.total)})
                      </Text>
                    )}
                  </Stack>
                </Flex>
              </Paper>
            )}
            {serverInfo?.cachePoolCount !== undefined && serverInfo.cachePoolCount > 0 && (
              <Paper p="sm" radius="md" style={{ background: "var(--mantine-color-dark-8)", border: `1px solid var(--mantine-color-dark-5)`, flex: "1 1 0", minWidth: isTiny ? "100px" : "150px", maxWidth: isTiny ? "120px" : "180px", height: isTiny ? "160px" : "200px", display: "flex", flexDirection: "column" }}>
                <Flex direction="column" gap="xs" align="center" style={{ flex: 1, justifyContent: "space-between" }}>
                  <RingProgress
                    roundCaps
                    size={isTiny ? 64 : 80}
                    thickness={isTiny ? 6 : 8}
                    label={
                      <Center>
                        <IconDatabase size={isTiny ? 20 : 28} color="var(--mantine-color-gray-4)" />
                      </Center>
                    }
                    sections={[{ value: serverInfo.cachePoolPercent || 0, color: getUsageColor(serverInfo.cachePoolPercent || 0) }]}
                  />
                  <Stack gap={2} align="center">
                    <Text fw={600} size={isTiny ? "sm" : "md"}>
                      Cache Pool
                    </Text>
                    <Text fw={700} size={isTiny ? "md" : "lg"}>
                      {serverInfo.cachePoolPercent ? serverInfo.cachePoolPercent.toFixed(1) : "0"}%
                    </Text>
                    <Text size="xs" c="dimmed" ta="center">
                      {serverInfo.cachePoolCount} disk{serverInfo.cachePoolCount !== 1 ? "s" : ""}
                    </Text>
                  </Stack>
                </Flex>
              </Paper>
            )}
            {serverInfo?.storagePercent !== undefined && (
              <Paper p="sm" radius="md" style={{ background: "var(--mantine-color-dark-8)", border: `1px solid var(--mantine-color-dark-5)`, flex: "1 1 0", minWidth: isTiny ? "100px" : "150px", maxWidth: isTiny ? "120px" : "180px", height: isTiny ? "160px" : "200px", display: "flex", flexDirection: "column" }}>
                <Flex direction="column" gap="xs" align="center" style={{ flex: 1, justifyContent: "space-between" }}>
                  <RingProgress
                    roundCaps
                    size={isTiny ? 64 : 80}
                    thickness={isTiny ? 6 : 8}
                    label={
                      <Center>
                        <IconDatabase size={isTiny ? 20 : 28} color="var(--mantine-color-gray-4)" />
                      </Center>
                    }
                    sections={[{ value: serverInfo.storagePercent, color: getUsageColor(serverInfo.storagePercent) }]}
                  />
                  <Stack gap={2} align="center">
                    <Text fw={600} size={isTiny ? "sm" : "md"}>
                      Storage
                    </Text>
                    <Text fw={700} size={isTiny ? "md" : "lg"}>{serverInfo.storagePercent.toFixed(1)}%</Text>
                    {node && node.storage.total > 0 && (
                      <Text size="xs" c="dimmed" ta="center">
                        {humanFileSize(node.storage.used)} / {humanFileSize(node.storage.total)}
                      </Text>
                    )}
                  </Stack>
                </Flex>
              </Paper>
            )}
            {/* Parity block - always show for Unraid */}
            <Paper p="sm" radius="md" style={{ background: "var(--mantine-color-dark-8)", border: `1px solid var(--mantine-color-dark-5)`, flex: "1 1 0", minWidth: isTiny ? "100px" : "150px", maxWidth: isTiny ? "120px" : "180px", height: isTiny ? "160px" : "200px", display: "flex", flexDirection: "column" }}>
              <Flex direction="column" gap="xs" align="center" style={{ flex: 1, justifyContent: "space-between" }}>
                <RingProgress
                  roundCaps
                  size={isTiny ? 64 : 80}
                  thickness={isTiny ? 6 : 8}
                  label={
                    <Center>
                      <IconShield size={isTiny ? 20 : 28} color="var(--mantine-color-gray-4)" />
                    </Center>
                  }
                  sections={[
                    {
                      value: serverInfo?.parity?.running && serverInfo.parity.progress !== null
                        ? serverInfo.parity.progress
                        : serverInfo?.parity?.status === "done" || serverInfo?.parity?.status === "DONE" || serverInfo?.parity?.status === "COMPLETED"
                          ? 100
                          : 0,
                      color: serverInfo?.parity?.status === "done" || serverInfo?.parity?.status === "DONE" || serverInfo?.parity?.status === "COMPLETED"
                        ? "green"
                        : serverInfo?.parity?.running
                          ? "blue"
                          : serverInfo?.parity?.status === "CANCELLED" || serverInfo?.parity?.status === "aborted" || serverInfo?.parity?.status === "FAILED"
                            ? "red"
                            : serverInfo?.parity?.status === "PAUSED" || serverInfo?.parity?.paused
                              ? "yellow"
                              : "gray",
                    },
                  ]}
                />
                <Stack gap={2} align="center">
                  <Text fw={600} size={isTiny ? "sm" : "md"}>
                    Parity
                  </Text>
                  <Text fw={700} size={isTiny ? "md" : "lg"}>
                    {serverInfo?.parity?.running && serverInfo.parity.progress !== null
                      ? `${serverInfo.parity.progress.toFixed(0)}%`
                      : serverInfo?.parity?.status === "done" || serverInfo?.parity?.status === "DONE" || serverInfo?.parity?.status === "COMPLETED"
                        ? "Valid"
                        : serverInfo?.parity?.status && serverInfo.parity.status !== "unknown" && serverInfo.parity.status !== "unavailable"
                          ? capitalize(serverInfo.parity.status.toLowerCase())
                          : "N/A"}
                  </Text>
                  {serverInfo?.parity?.running && serverInfo.parity.progress !== null && serverInfo.parity.speed && serverInfo.parity.speed !== "0" && (
                    <Text size="xs" c="dimmed" ta="center" lineClamp={1}>
                      {serverInfo.parity.speed}
                    </Text>
                  )}
                  {serverInfo?.parity?.running && serverInfo.parity.progress !== null && serverInfo.parity.duration && serverInfo.parity.duration > 0 && (
                    <Text size="xs" c="dimmed" ta="center" lineClamp={1}>
                      {dayjs.duration(serverInfo.parity.duration, "seconds").humanize()}
                    </Text>
                  )}
                  {!serverInfo?.parity?.running && serverInfo?.parity?.status === "CANCELLED" && serverInfo.parity.date && (
                    <Text size="xs" c="orange" ta="center" lineClamp={1}>
                      Cancelled {dayjs(serverInfo.parity.date).fromNow()}
                    </Text>
                  )}
                  {!serverInfo?.parity?.running && serverInfo?.parity?.date && (
                    <Text size="xs" c="dimmed" ta="center" lineClamp={1}>
                      {dayjs(serverInfo.parity.date).fromNow()}
                    </Text>
                  )}
                  {serverInfo?.parity?.errors !== null && serverInfo.parity.errors !== undefined && serverInfo.parity.errors > 0 && (
                    <Badge color="red" variant="filled" size="xs">
                      {serverInfo.parity.errors} errors
                    </Badge>
                  )}
                </Stack>
              </Flex>
            </Paper>
          </Group>
        </Paper>
      )}

      {/* Storage Section */}
      {options.visibleClusterSections.includes("storage") && healthData.storages.length > 0 && (
        <Paper p="md" radius="md" style={{ background: "var(--mantine-color-dark-7)" }}>
          <Accordion variant="default" chevronPosition="right">
            <Accordion.Item value="storage">
              <Accordion.Control
                icon={
                  <Box
                    style={{
                      background: "var(--mantine-color-dark-6)",
                      borderRadius: "6px",
                      padding: "6px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <IconDatabase size={16} color="var(--mantine-color-gray-4)" />
                  </Box>
                }
                px={0}
                py="xs"
              >
                <Group gap="xs">
                  <Text fw={600} size={isTiny ? "sm" : "md"} tt="uppercase">
                    {t("widget.healthMonitoring.cluster.resource.storage.name")}
                  </Text>
                  <Badge variant="dot" color="green" size="sm">
                    {healthData.storages.filter((s) => s.isRunning).length} / {healthData.storages.length}
                  </Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="md" mt="xs">
            {healthData.storages.map((storage) => {
              const storagePercent = storage.total ? (storage.used / storage.total) * 100 : 0;
              // Parse status: format is "TYPE - STATUS • TEMP°C || JSON_METADATA" or "TYPE - STATUS || JSON_METADATA"
              let displayStatus = storage.status;
              let diskMetadata: {
                numReads?: number | null;
                numWrites?: number | null;
                numErrors?: number | null;
                color?: string | null;
                isSpinning?: boolean | null;
                warning?: number | null;
                critical?: number | null;
                device?: string;
                type?: string;
              } | null = null;

              // Extract metadata if present (format: "DISPLAY_STATUS || JSON_METADATA")
              if (storage.status.includes(" || ")) {
                const parts = storage.status.split(" || ");
                displayStatus = parts[0];
                try {
                  diskMetadata = JSON.parse(parts[1]);
                } catch {
                  // If parsing fails, ignore metadata
                }
              }

              // Parse display status: format is "TYPE - STATUS • TEMP°C" or "TYPE - STATUS"
              const statusParts = displayStatus.split(" - ");
              const diskType = statusParts[0] || "DATA";
              const restOfStatus = statusParts.slice(1).join(" - ");
              // Extract temperature if present (format: "DISK_OK • 39°C")
              const tempMatch = restOfStatus.match(/(\d+)°C/);
              const temperature = tempMatch ? parseInt(tempMatch[1], 10) : null;
              const diskStatus = restOfStatus.replace(/\s*•\s*\d+°C\s*/, "").trim() || restOfStatus;
              const typeColor = getStorageTypeColor(diskType);
              
              // Get disk health color from metadata
              const diskHealthColor = getDiskHealthColor(diskMetadata?.color);
              
              return (
                <ResourcePopover key={storage.id} item={storage}>
                  <Paper
                    p="sm"
                    radius="md"
                    style={{
                    cursor: "pointer",
                    background: "var(--mantine-color-dark-8)",
                    borderLeft: `4px solid var(--mantine-color-orange-7)`,
                    transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--mantine-color-dark-6)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "var(--mantine-color-dark-8)";
                    }}
                  >
                    <Stack gap="xs">
                      <Group gap="sm" justify="space-between" wrap="nowrap">
                        <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                          <Group gap={4} wrap="nowrap">
                            {/* Disk health indicator */}
                            {diskMetadata?.color && (
                              <Box
                                style={{
                                  width: "8px",
                                  height: "8px",
                                  borderRadius: "50%",
                                  backgroundColor: `var(--mantine-color-${diskHealthColor}-6)`,
                                  border: diskMetadata.color.includes("BLINK") ? `2px solid var(--mantine-color-${diskHealthColor}-4)` : "none",
                                  animation: diskMetadata.color.includes("BLINK") ? "pulse 2s infinite" : "none",
                                }}
                              />
                            )}
                            <Badge color={typeColor} variant="dot" size="sm">
                              {diskType}
                            </Badge>
                            {/* Spin status indicator */}
                            {diskMetadata?.isSpinning !== null && (
                              <Badge 
                                variant="light" 
                                color={diskMetadata.isSpinning ? "orange" : "gray"} 
                                size="xs"
                                style={{ textTransform: "none" }}
                              >
                                {diskMetadata.isSpinning ? "⭮" : "⏸"}
                              </Badge>
                            )}
                          </Group>
                          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                            <Text fw={500} size={isTiny ? "xs" : "sm"} lineClamp={1}>
                              {storage.name}
                            </Text>
                            <Group gap="xs" wrap="nowrap">
                              <Text size="xs" c="dimmed" lineClamp={1}>
                                {diskStatus}
                              </Text>
                              {temperature !== null && (
                                <Group gap={2} wrap="nowrap">
                                  <IconTemperature size={12} color="var(--mantine-color-orange-5)" />
                                  <Text size="xs" c="dimmed" fw={500}>
                                    {temperature}°C
                                  </Text>
                                </Group>
                              )}
                              {/* Error indicator */}
                              {diskMetadata?.numErrors !== null && diskMetadata.numErrors !== undefined && diskMetadata.numErrors > 0 && (
                                <Badge color="red" variant="filled" size="xs">
                                  {diskMetadata.numErrors} errors
                                </Badge>
                              )}
                            </Group>
                          </Stack>
                        </Group>
                        <Text fw={600} size={isTiny ? "sm" : "md"} c={`var(--mantine-color-${getUsageColor(storagePercent)}-5)`}>
                          {storagePercent.toFixed(1)}%
                        </Text>
                      </Group>
                      <Progress
                        value={storagePercent}
                        color={getUsageColor(storagePercent)}
                        radius="xl"
                        size="sm"
                        style={{ marginTop: "4px" }}
                      />
                      <Group gap="xs" justify="space-between" wrap="nowrap">
                        <Text size="xs" c="dimmed">
                          {humanFileSize(storage.used)}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {humanFileSize(storage.total)}
                        </Text>
                        {/* I/O stats if available and non-zero */}
                        {((diskMetadata?.numReads !== null && diskMetadata.numReads !== undefined && diskMetadata.numReads > 0) || 
                          (diskMetadata?.numWrites !== null && diskMetadata.numWrites !== undefined && diskMetadata.numWrites > 0)) && (
                          <Group gap={4} wrap="nowrap" ml="auto">
                            {diskMetadata.numReads !== null && diskMetadata.numReads !== undefined && diskMetadata.numReads > 0 && (
                              <Text size="xs" c="dimmed" title="Read operations">
                                R: {diskMetadata.numReads.toLocaleString()}
                              </Text>
                            )}
                            {diskMetadata.numWrites !== null && diskMetadata.numWrites !== undefined && diskMetadata.numWrites > 0 && (
                              <Text size="xs" c="dimmed" title="Write operations">
                                W: {diskMetadata.numWrites.toLocaleString()}
                              </Text>
                            )}
                          </Group>
                        )}
                      </Group>
                    </Stack>
                  </Paper>
                </ResourcePopover>
              );
            })}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Paper>
      )}

      {/* Docker Containers Section */}
      {((options.visibleClusterSections.includes("lxc") && healthData.lxcs.length > 0) || (serverInfo?.dockerContainers && serverInfo.dockerContainers.length > 0)) && (
        <Paper p="md" radius="md" style={{ background: "var(--mantine-color-dark-7)" }}>
          <Accordion variant="default" chevronPosition="right">
            <Accordion.Item value="dockers">
              <Accordion.Control
                icon={
                  <Box
                    style={{
                      background: "var(--mantine-color-dark-6)",
                      borderRadius: "6px",
                      padding: "6px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <IconCube size={16} color="var(--mantine-color-gray-4)" />
                  </Box>
                }
                px={0}
                py="xs"
              >
                <Group gap="xs">
                  <Text fw={600} size={isTiny ? "sm" : "md"} tt="uppercase">
                    Docker
                  </Text>
                  <Badge variant="dot" color="green" size="sm">
                    {serverInfo?.dockerContainers 
                      ? `${serverInfo.dockerContainers.filter((c) => c.state === "RUNNING").length} / ${serverInfo.dockerContainers.length}`
                      : `${healthData.lxcs.filter((lxc) => lxc.isRunning).length} / ${healthData.lxcs.length}`}
                  </Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm" mt="xs">
                  {/* Show extended Docker container info if available */}
                  {serverInfo?.dockerContainers && serverInfo.dockerContainers.length > 0
                    ? serverInfo.dockerContainers.map((container) => {
                        const isRunning = container.state === "RUNNING";
                        const containerName = container.names?.[0]?.replace(/^\//, "") || "Unknown";
                        const containerImage = container.image || "Unknown";
                        const containerSize = container.sizeRootFs ? humanFileSize(container.sizeRootFs) : null;
                        const exposedPorts = container.ports?.filter((p) => p.publicPort !== null && p.publicPort !== undefined) || [];
                        
                        return (
                          <Paper
                            key={container.id}
                            p="sm"
                            radius="md"
                            style={{
                              cursor: "pointer",
                              background: "var(--mantine-color-dark-8)",
                              borderLeft: `4px solid var(--mantine-color-${isRunning ? "green" : "orange"}-7)`,
                              transition: "all 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "var(--mantine-color-dark-6)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "var(--mantine-color-dark-8)";
                            }}
                          >
                            <Stack gap="xs">
                              <Group gap="sm" justify="space-between" wrap="nowrap">
                                <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                                  <Badge
                                    color={isRunning ? "green" : "orange"}
                                    variant="dot"
                                    size="lg"
                                    style={{ minWidth: "8px", height: "8px", padding: 0 }}
                                  />
                                  <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                                    <Text fw={500} size={isTiny ? "xs" : "sm"} lineClamp={1}>
                                      {containerName}
                                    </Text>
                                    <Text size="xs" c="dimmed" lineClamp={1}>
                                      {containerImage}
                                    </Text>
                                    <Text size="xs" c="dimmed" lineClamp={1}>
                                      {container.status}
                                    </Text>
                                  </Stack>
                                </Group>
                                {container.autoStart && (
                                  <Badge color="blue" variant="light" size="xs">
                                    Auto
                                  </Badge>
                                )}
                              </Group>
                              <Group gap="xs" wrap="wrap">
                                {container.networkMode && (
                                  <Badge variant="light" color="gray" size="xs">
                                    {container.networkMode}
                                  </Badge>
                                )}
                                {exposedPorts.length > 0 && (
                                  <Badge variant="light" color="blue" size="xs">
                                    {exposedPorts.length} port{exposedPorts.length !== 1 ? "s" : ""}
                                  </Badge>
                                )}
                                {containerSize && (
                                  <Text size="xs" c="dimmed">
                                    {containerSize}
                                  </Text>
                                )}
                              </Group>
                              {exposedPorts.length > 0 && exposedPorts.length <= 3 && (
                                <Group gap="xs" wrap="wrap">
                                  {exposedPorts.map((port, idx) => (
                                    <Badge key={idx} variant="outline" color="blue" size="xs">
                                      {port.publicPort}:{port.privatePort}/{port.type}
                                    </Badge>
                                  ))}
                                </Group>
                              )}
                            </Stack>
                          </Paper>
                        );
                      })
                    : healthData.lxcs.map((lxc) => {
                        const isRunning = lxc.isRunning;
                        return (
                          <ResourcePopover key={lxc.id} item={lxc}>
                            <Paper
                              p="sm"
                              radius="md"
                              style={{
                                cursor: "pointer",
                                background: "var(--mantine-color-dark-8)",
                                borderLeft: `4px solid var(--mantine-color-${isRunning ? "green" : "orange"}-7)`,
                                transition: "all 0.2s",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = "var(--mantine-color-dark-6)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = "var(--mantine-color-dark-8)";
                              }}
                            >
                              <Group gap="sm" justify="space-between" wrap="nowrap">
                                <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                                  <Badge
                                    color={isRunning ? "green" : "orange"}
                                    variant="dot"
                                    size="lg"
                                    style={{ minWidth: "8px", height: "8px", padding: 0 }}
                                  />
                                  <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                                    <Text fw={500} size={isTiny ? "xs" : "sm"} lineClamp={1}>
                                      {lxc.name?.startsWith("/") ? lxc.name.substring(1) : lxc.name}
                                    </Text>
                                    <Text size="xs" c="dimmed" lineClamp={1}>
                                      {lxc.status}
                                    </Text>
                                  </Stack>
                                </Group>
                                {lxc.uptime > 0 && (
                                  <Badge variant="light" color="orange" size="sm">
                                    {formatUptime(lxc.uptime, t)}
                                  </Badge>
                                )}
                              </Group>
                            </Paper>
                          </ResourcePopover>
                        );
                      })}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Paper>
      )}

      {/* Per-Core CPU Visualisation */}
      {options.cpu && serverInfo?.cpuCores && serverInfo.cpuCores.length > 0 && (
        <Paper p="md" radius="md" style={{ background: "var(--mantine-color-dark-7)" }}>
          <Accordion variant="default" chevronPosition="right">
            <Accordion.Item value="cpu-cores">
              <Accordion.Control
                icon={
                  <Box
                    style={{
                      background: "var(--mantine-color-dark-6)",
                      borderRadius: "6px",
                      padding: "6px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <IconCpu size={16} color="var(--mantine-color-gray-4)" />
                  </Box>
                }
                px={0}
                py="xs"
              >
                <Group gap="xs">
                  <Text fw={600} size={isTiny ? "sm" : "md"} tt="uppercase">
                    CPU Cores
                  </Text>
                  <Badge variant="dot" color="orange" size="sm">
                    {serverInfo.cpuCores.length}
                  </Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Grid gutter="xs" mt="xs">
                  {serverInfo.cpuCores.map((core, index) => {
                    const coreColor = getUsageColor(core.percentTotal);
                    return (
                      <Grid.Col key={index} span={isTiny ? 6 : 4}>
                        <Tooltip
                          label={
                            <Stack gap={2}>
                              <Text size="xs">Core {index + 1}</Text>
                              <Text size="xs">Total: {core.percentTotal.toFixed(1)}%</Text>
                              {core.percentUser !== undefined && (
                                <Text size="xs">User: {core.percentUser.toFixed(1)}%</Text>
                              )}
                              {core.percentSystem !== undefined && (
                                <Text size="xs">System: {core.percentSystem.toFixed(1)}%</Text>
                              )}
                              {core.percentIdle !== undefined && (
                                <Text size="xs">Idle: {core.percentIdle.toFixed(1)}%</Text>
                              )}
                            </Stack>
                          }
                        >
                          <Paper
                            p="xs"
                            radius="md"
                            style={{
                              background: "var(--mantine-color-dark-8)",
                              border: `2px solid var(--mantine-color-${coreColor}-6)`,
                              cursor: "pointer",
                              transition: "all 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = `var(--mantine-color-${coreColor}-4)`;
                              e.currentTarget.style.transform = "scale(1.05)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = `var(--mantine-color-${coreColor}-6)`;
                              e.currentTarget.style.transform = "scale(1)";
                            }}
                          >
                            <Stack gap={4} align="center">
                              <Text size="xs" fw={600} c={`var(--mantine-color-${coreColor}-5)`}>
                                Core {index + 1}
                              </Text>
                              <Progress
                                value={core.percentTotal}
                                color={coreColor}
                                radius="xl"
                                size="sm"
                                style={{ width: "100%" }}
                              />
                              <Text size="xs" fw={700} c={`var(--mantine-color-${coreColor}-5)`}>
                                {core.percentTotal.toFixed(0)}%
                              </Text>
                            </Stack>
                          </Paper>
                        </Tooltip>
                      </Grid.Col>
                    );
                  })}
                </Grid>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Paper>
      )}

      {/* Shares Section */}
      {serverInfo?.shares && serverInfo.shares.length > 0 && (
        <Paper p="md" radius="md" style={{ background: "var(--mantine-color-dark-7)" }}>
          <Accordion variant="default" chevronPosition="right">
            <Accordion.Item value="shares">
              <Accordion.Control
                icon={
                  <Box
                    style={{
                      background: "var(--mantine-color-dark-6)",
                      borderRadius: "6px",
                      padding: "6px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <IconServer size={16} color="var(--mantine-color-gray-4)" />
                  </Box>
                }
                px={0}
                py="xs"
              >
                <Group gap="xs">
                  <Text fw={600} size={isTiny ? "sm" : "md"} tt="uppercase">
                    Shares
                  </Text>
                  <Badge variant="dot" color="orange" size="sm">
                    {serverInfo.shares.length}
                  </Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm" mt="xs">
                  {serverInfo.shares.map((share) => {
                    const sharePercent = share.total > 0 ? (share.used / share.total) * 100 : 0;
                    return (
                      <Paper
                        key={share.id}
                        p="sm"
                        radius="md"
                        style={{
                          background: "var(--mantine-color-dark-8)",
                          borderLeft: `4px solid var(--mantine-color-orange-7)`,
                          transition: "all 0.2s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "var(--mantine-color-dark-6)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "var(--mantine-color-dark-8)";
                        }}
                      >
                        <Stack gap="xs">
                          <Group gap="sm" justify="space-between" wrap="nowrap">
                            <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                              {share.cache && (
                                <Badge color="blue" variant="dot" size="sm">
                                  Cache
                                </Badge>
                              )}
                              <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                                <Text fw={500} size={isTiny ? "xs" : "sm"} lineClamp={1}>
                                  {share.name || "Unnamed Share"}
                                </Text>
                                {share.comment && (
                                  <Text size="xs" c="dimmed" lineClamp={1}>
                                    {share.comment}
                                  </Text>
                                )}
                              </Stack>
                            </Group>
                            <Text fw={600} size={isTiny ? "sm" : "md"} c={`var(--mantine-color-${getUsageColor(sharePercent)}-5)`}>
                              {sharePercent.toFixed(1)}%
                            </Text>
                          </Group>
                          <Progress
                            value={sharePercent}
                            color={getUsageColor(sharePercent)}
                            radius="xl"
                            size="sm"
                            style={{ marginTop: "4px" }}
                          />
                          <Group gap="xs" justify="space-between">
                            <Text size="xs" c="dimmed">
                              {humanFileSize(share.used)}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {humanFileSize(share.total)}
                            </Text>
                          </Group>
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Paper>
      )}

      {/* VMs Section */}
      {options.visibleClusterSections.includes("qemu") && healthData.vms.length > 0 && (
        <Paper p="md" radius="md" style={{ background: "var(--mantine-color-dark-7)" }}>
          <Accordion variant="default" chevronPosition="right">
            <Accordion.Item value="vms">
              <Accordion.Control
                icon={
                      <Box
                        style={{
                          background: "var(--mantine-color-dark-6)",
                          borderRadius: "6px",
                          padding: "6px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <IconDeviceLaptop size={16} color="var(--mantine-color-gray-4)" />
                      </Box>
                }
                px={0}
                py="xs"
              >
                <Group gap="xs">
                  <Text fw={600} size={isTiny ? "sm" : "md"} tt="uppercase">
                    {t("widget.healthMonitoring.cluster.resource.qemu.name")}
                  </Text>
                  <Badge variant="dot" color="green" size="sm">
                    {healthData.vms.filter((vm) => vm.isRunning).length} / {healthData.vms.length}
                  </Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm" mt="xs">
                  {healthData.vms.map((vm) => {
                    const isRunning = vm.isRunning;
                    return (
                      <ResourcePopover key={vm.id} item={vm}>
                        <Paper
                          p="sm"
                          radius="md"
                          style={{
                            cursor: "pointer",
                            background: "var(--mantine-color-dark-8)",
                            borderLeft: `4px solid var(--mantine-color-${isRunning ? "green" : "orange"}-7)`,
                            transition: "all 0.2s",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "var(--mantine-color-dark-6)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "var(--mantine-color-dark-8)";
                          }}
                        >
                          <Group gap="sm" justify="space-between" wrap="nowrap">
                            <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                              <Badge
                                color={isRunning ? "green" : "orange"}
                                variant="dot"
                                size="lg"
                                style={{ minWidth: "8px", height: "8px", padding: 0 }}
                              />
                              <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                                <Text fw={500} size={isTiny ? "xs" : "sm"} lineClamp={1}>
                                  {vm.name}
                                </Text>
                                <Text size="xs" c="dimmed">
                                  {capitalize(vm.status.toLowerCase())}
                                </Text>
                              </Stack>
                            </Group>
                                {vm.uptime > 0 && (
                                  <Badge variant="light" color="orange" size="sm">
                                    {formatUptime(vm.uptime, t)}
                                  </Badge>
                                )}
                          </Group>
                        </Paper>
                      </ResourcePopover>
                    );
                  })}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Paper>
      )}

      {/* Memory Layout Section */}
      {options.memory && serverInfo?.memoryLayout && serverInfo.memoryLayout.length > 0 && (
        <Paper p="md" radius="md" style={{ background: "var(--mantine-color-dark-7)" }}>
          <Accordion variant="default" chevronPosition="right">
            <Accordion.Item value="memory-layout">
              <Accordion.Control
                icon={
                  <Box
                    style={{
                      background: "var(--mantine-color-dark-6)",
                      borderRadius: "6px",
                      padding: "6px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <IconBrain size={16} color="var(--mantine-color-gray-4)" />
                  </Box>
                }
                px={0}
                py="xs"
              >
                <Group gap="xs">
                  <Text fw={600} size={isTiny ? "sm" : "md"} tt="uppercase">
                    Memory Layout
                  </Text>
                  <Badge variant="dot" color="orange" size="sm">
                    {serverInfo.memoryLayout.length}
                  </Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm" mt="xs">
                  {serverInfo.memoryLayout.map((stick) => {
                    const sizeGB = stick.size / (1024 ** 3);
                    return (
                      <Paper
                        key={stick.id}
                        p="sm"
                        radius="md"
                        style={{
                          background: "var(--mantine-color-dark-8)",
                          borderLeft: `4px solid var(--mantine-color-orange-7)`,
                        }}
                      >
                        <Stack gap="xs">
                          <Group gap="xs" justify="space-between" wrap="nowrap">
                            <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                              {stick.bank && (
                                <Badge color="blue" variant="dot" size="sm">
                                  {stick.bank}
                                </Badge>
                              )}
                              <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                                <Text fw={500} size={isTiny ? "xs" : "sm"} lineClamp={1}>
                                  {stick.manufacturer} {stick.type}
                                </Text>
                                {stick.partNum && (
                                  <Text size="xs" c="dimmed" lineClamp={1}>
                                    {stick.partNum}
                                  </Text>
                                )}
                              </Stack>
                            </Group>
                            <Text fw={600} size={isTiny ? "sm" : "md"} c="orange">
                              {sizeGB.toFixed(0)} GB
                            </Text>
                          </Group>
                          <Group gap="xs" wrap="nowrap">
                            {stick.clockSpeed && (
                              <Badge variant="light" color="orange" size="xs">
                                {stick.clockSpeed} MHz
                              </Badge>
                            )}
                            {stick.formFactor && (
                              <Badge variant="light" color="gray" size="xs">
                                {stick.formFactor}
                              </Badge>
                            )}
                            {stick.serialNum && stick.serialNum !== "00000000" && (
                              <Text size="xs" c="dimmed" lineClamp={1}>
                                S/N: {stick.serialNum}
                              </Text>
                            )}
                          </Group>
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Paper>
      )}

      {/* USB Devices Section */}
      {serverInfo?.usbDevices && serverInfo.usbDevices.length > 0 && (
        <Paper p="md" radius="md" style={{ background: "var(--mantine-color-dark-7)" }}>
          <Accordion variant="default" chevronPosition="right">
            <Accordion.Item value="usb-devices">
              <Accordion.Control
                icon={
                  <Box
                    style={{
                      background: "var(--mantine-color-dark-6)",
                      borderRadius: "6px",
                      padding: "6px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <IconUsb size={16} color="var(--mantine-color-gray-4)" />
                  </Box>
                }
                px={0}
                py="xs"
              >
                <Group gap="xs">
                  <Text fw={600} size={isTiny ? "sm" : "md"} tt="uppercase">
                    USB Devices
                  </Text>
                  <Badge variant="dot" color="orange" size="sm">
                    {serverInfo.usbDevices.length}
                  </Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="xs" mt="xs">
                  {serverInfo.usbDevices.map((device) => (
                    <Paper
                      key={device.id}
                      p="sm"
                      radius="md"
                      style={{
                        background: "var(--mantine-color-dark-8)",
                        borderLeft: `4px solid var(--mantine-color-orange-7)`,
                      }}
                    >
                      <Group gap="xs" justify="space-between" wrap="nowrap">
                        <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                          <IconUsb size={16} color="var(--mantine-color-orange-5)" />
                          <Text fw={500} size={isTiny ? "xs" : "sm"} lineClamp={1}>
                            {device.name}
                          </Text>
                        </Group>
                        {device.bus && device.device && (
                          <Text size="xs" c="dimmed">
                            {device.bus}:{device.device}
                          </Text>
                        )}
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Paper>
      )}
        </Stack>
      </ScrollArea>
    </>
  );
};

