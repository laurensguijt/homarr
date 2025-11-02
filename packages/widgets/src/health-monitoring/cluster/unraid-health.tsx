"use client";

import { Accordion, Badge, Box, Center, Flex, Group, Paper, Progress, RingProgress, ScrollArea, Stack, Text } from "@mantine/core";
import { IconBrain, IconCheck, IconCpu, IconCube, IconDatabase, IconDeviceLaptop, IconServer, IconShield, IconTemperature, IconX } from "@tabler/icons-react";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";

const UNRAID_LOGO_URL = "https://media.invisioncic.com/u329766/monthly_2025_05/UN-logotype-gradient_1c12cf.png";

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
      errors?: number | null;
      running?: boolean | null;
      progress?: number | null;
    } | null;
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

  return (
    <ScrollArea h="100%">
      <Stack p="xs" gap={isTiny ? "xs" : "md"}>
      {/* Server Name */}
      <Paper p="md" radius="md" style={{ background: "var(--mantine-color-dark-7)" }}>
        <Group gap="sm" wrap="nowrap" align="flex-start" justify="space-between">
          <Stack gap="sm" style={{ flex: 1 }}>
            <Text fw={700} size={isTiny ? "sm" : "lg"}>
              {serverName}
            </Text>
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
                  <Text size="xs" fw={500}>
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

      {/* CPU, RAM, Storage and Parity Stats */}
      {(options.cpu || options.memory || serverInfo?.storagePercent !== undefined) && (
        <Paper p="md" radius="md" style={{ background: "var(--mantine-color-dark-7)" }}>
          <Group gap="md" justify="center" wrap="wrap">
            {options.cpu && (
              <Paper p="sm" radius="md" style={{ background: "var(--mantine-color-dark-8)", border: `1px solid var(--mantine-color-dark-5)`, flex: "1 1 0", minWidth: isTiny ? "100px" : "150px", maxWidth: isTiny ? "120px" : "180px" }}>
                <Flex direction="column" gap="xs" align="center">
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
                  </Stack>
                </Flex>
              </Paper>
            )}
            {options.memory && (
              <Paper p="sm" radius="md" style={{ background: "var(--mantine-color-dark-8)", border: `1px solid var(--mantine-color-dark-5)`, flex: "1 1 0", minWidth: isTiny ? "100px" : "150px", maxWidth: isTiny ? "120px" : "180px" }}>
                <Flex direction="column" gap="xs" align="center">
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
                  </Stack>
                </Flex>
              </Paper>
            )}
            {serverInfo?.storagePercent !== undefined && (
              <Paper p="sm" radius="md" style={{ background: "var(--mantine-color-dark-8)", border: `1px solid var(--mantine-color-dark-5)`, flex: "1 1 0", minWidth: isTiny ? "100px" : "150px", maxWidth: isTiny ? "120px" : "180px" }}>
                <Flex direction="column" gap="xs" align="center">
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
            <Paper p="sm" radius="md" style={{ background: "var(--mantine-color-dark-8)", border: `1px solid var(--mantine-color-dark-5)`, flex: "1 1 0", minWidth: isTiny ? "100px" : "150px", maxWidth: isTiny ? "120px" : "180px" }}>
              <Flex direction="column" gap="xs" align="center">
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
                        : serverInfo?.parity?.status === "done" || serverInfo?.parity?.status === "DONE"
                          ? 100
                          : 0,
                      color: serverInfo?.parity?.status === "done" || serverInfo?.parity?.status === "DONE"
                        ? "green"
                        : serverInfo?.parity?.running
                          ? "blue"
                          : serverInfo?.parity?.status === "CANCELLED" || serverInfo?.parity?.status === "aborted"
                            ? "red"
                            : "yellow",
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
                      : serverInfo?.parity?.status === "done" || serverInfo?.parity?.status === "DONE"
                        ? "Valid"
                        : serverInfo?.parity?.status && serverInfo.parity.status !== "unknown" && serverInfo.parity.status !== "unavailable"
                          ? capitalize(serverInfo.parity.status.toLowerCase())
                          : "N/A"}
                  </Text>
                  {serverInfo?.parity?.date && (
                    <Text size="xs" c="dimmed" ta="center" lineClamp={1}>
                      {dayjs(serverInfo.parity.date).fromNow()}
                    </Text>
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
              // Parse status: format is "TYPE - STATUS • TEMP°C" or "TYPE - STATUS"
              const statusParts = storage.status.split(" - ");
              const diskType = statusParts[0] || "DATA";
              const restOfStatus = statusParts.slice(1).join(" - ");
              // Extract temperature if present (format: "DISK_OK • 39°C")
              const tempMatch = restOfStatus.match(/(\d+)°C/);
              const temperature = tempMatch ? parseInt(tempMatch[1], 10) : null;
              const diskStatus = restOfStatus.replace(/\s*•\s*\d+°C\s*/, "").trim() || restOfStatus;
              const typeColor = getStorageTypeColor(diskType);
              
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
                          <Badge color="orange" variant="dot" size="sm">
                            {diskType}
                          </Badge>
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
                      <Group gap="xs" justify="space-between">
                        <Text size="xs" c="dimmed">
                          {humanFileSize(storage.used)}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {humanFileSize(storage.total)}
                        </Text>
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

      {/* Docker Containers Section */}
      {options.visibleClusterSections.includes("lxc") && healthData.lxcs.length > 0 && (
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
                    {healthData.lxcs.filter((lxc) => lxc.isRunning).length} / {healthData.lxcs.length}
                  </Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm" mt="xs">
                  {healthData.lxcs.map((lxc) => {
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
                                  {lxc.name}
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
      </Stack>
    </ScrollArea>
  );
};

