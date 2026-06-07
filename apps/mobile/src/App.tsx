import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  MOBILE_GATEWAY_DEFAULT_DEV_TOKEN,
  parseMobilePairingUrl,
  type MobileDashboardSnapshot,
  type MobileProjectSummary,
  type MobileTaskSummary,
} from '../../../src/shared/mobile-api';
import { createDemand, fetchSnapshot, type MobileConnection } from './api-client';
import { clearConnection, loadConnection, saveConnection } from './connection-storage';

const COLORS = {
  page: '#F7F7F2',
  surface: '#FFFFFF',
  ink: '#171717',
  muted: '#686B6F',
  faint: '#E7E4DC',
  line: '#D8D4CB',
  blue: '#2563EB',
  green: '#1F8A70',
  amber: '#B7791F',
  red: '#B42318',
  charcoal: '#2D3135',
};

const POLL_INTERVAL_MS = 8_000;
const DEV_GATEWAY_DEFAULT_PORT = '3879';

type ConnectDraft = {
  baseUrl: string;
  token: string;
};

type TaskScope = 'all' | 'open' | 'inProgress' | 'review';

function taskScopeLabel(scope: TaskScope): string {
  switch (scope) {
    case 'open':
      return 'Open project tasks';
    case 'inProgress':
      return 'In progress';
    case 'review':
      return 'Review tasks';
    case 'all':
      return 'Active tasks';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'in_progress':
      return 'In progress';
    case 'review':
      return 'Review';
    case 'done':
      return 'Done';
    case 'cancelled':
      return 'Cancelled';
    case 'todo':
      return 'Todo';
    default:
      return status;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'in_progress':
      return COLORS.blue;
    case 'review':
      return COLORS.amber;
    case 'done':
      return COLORS.green;
    case 'cancelled':
      return COLORS.red;
    default:
      return COLORS.muted;
  }
}

function formatTimestamp(value?: string): string {
  if (!value) return 'No activity yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function projectName(projects: MobileProjectSummary[], projectId: string): string {
  return projects.find((project) => project.id === projectId)?.displayName ?? 'Unknown project';
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function redactPairingUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.searchParams.has('token')) {
      url.searchParams.set('token', '<redacted>');
    }
    return url.toString();
  } catch {
    return value;
  }
}

function envValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function inferDevGatewayConnection(urls: string[]): MobileConnection | null {
  if (!__DEV__) return null;

  const envBaseUrl = envValue(process.env.EXPO_PUBLIC_YODA_MOBILE_GATEWAY_URL);
  const envToken =
    envValue(process.env.EXPO_PUBLIC_YODA_MOBILE_GATEWAY_TOKEN) ?? MOBILE_GATEWAY_DEFAULT_DEV_TOKEN;
  if (envBaseUrl) return { baseUrl: envBaseUrl, token: envToken };

  const port =
    envValue(process.env.EXPO_PUBLIC_YODA_MOBILE_GATEWAY_PORT) ?? DEV_GATEWAY_DEFAULT_PORT;
  for (const value of urls) {
    try {
      const url = new URL(value);
      if (!url.hostname || url.hostname === 'localhost' || url.hostname === '127.0.0.1') continue;
      return { baseUrl: `http://${url.hostname}:${port}`, token: envToken };
    } catch {
      continue;
    }
  }

  return null;
}

async function getInitialPairing(): Promise<{
  pairingUrl: string | null;
  devConnection: MobileConnection | null;
}> {
  const initialUrl = await Linking.getInitialURL().catch(() => null);
  const candidates = uniqueStrings([
    initialUrl,
    Constants.linkingUri,
    Constants.experienceUrl,
    Constants.intentUri,
  ]);

  if (candidates.length > 0) {
    console.info('Yoda Mobile initial URL candidates', candidates.map(redactPairingUrl));
  }

  return {
    pairingUrl: candidates.find((url) => parseMobilePairingUrl(url)) ?? initialUrl,
    devConnection: inferDevGatewayConnection(candidates),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function App() {
  const [booting, setBooting] = useState(true);
  const [connection, setConnection] = useState<MobileConnection | null>(null);
  const [connectDraft, setConnectDraft] = useState<ConnectDraft>({
    baseUrl: 'http://192.168.1.10:3879',
    token: '',
  });
  const [snapshot, setSnapshot] = useState<MobileDashboardSnapshot | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState('all');
  const [taskScope, setTaskScope] = useState<TaskScope>('all');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [demandProjectId, setDemandProjectId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyPairingUrl = useCallback(async (url: string | null) => {
    if (!url) return false;
    const next = parseMobilePairingUrl(url);
    if (!next) return false;

    setConnectDraft(next);
    setConnection(next);
    setSnapshot(null);
    setSelectedProjectId('all');
    setTaskScope('all');
    setExpandedTaskId(null);
    setError(null);
    await saveConnection(next);
    return true;
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([loadConnection(), getInitialPairing()])
      .then(async ([saved, initial]) => {
        if (!active) return;
        if (await applyPairingUrl(initial.pairingUrl)) return;
        if (initial.devConnection) {
          setConnection(initial.devConnection);
          setConnectDraft(initial.devConnection);
          await saveConnection(initial.devConnection);
          return;
        }
        if (saved) {
          setConnection(saved);
          setConnectDraft(saved);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setBooting(false);
      });
    return () => {
      active = false;
    };
  }, [applyPairingUrl]);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void applyPairingUrl(url).catch((e: unknown) => {
        setError(errorMessage(e));
      });
    });
    return () => subscription.remove();
  }, [applyPairingUrl]);

  const loadDashboard = useCallback(
    async (quiet = false) => {
      if (!connection) return;
      if (!quiet) setLoading(true);
      try {
        const next = await fetchSnapshot(connection);
        setSnapshot(next);
        setError(null);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [connection]
  );

  useEffect(() => {
    if (!connection) return;
    void loadDashboard(false);
    const timer = setInterval(() => {
      void loadDashboard(true);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [connection, loadDashboard]);

  const visibleProjects = useMemo(
    () => snapshot?.projects.filter((project) => !project.isInternal) ?? [],
    [snapshot]
  );

  const openProjectIds = useMemo(
    () =>
      new Set(
        snapshot?.projects.filter((project) => project.isOpen).map((project) => project.id) ?? []
      ),
    [snapshot]
  );

  const filteredTasks = useMemo(() => {
    const tasks = snapshot?.tasks ?? [];
    return tasks.filter((task) => {
      if (selectedProjectId !== 'all' && task.projectId !== selectedProjectId) return false;
      if (taskScope === 'open' && !openProjectIds.has(task.projectId)) return false;
      if (taskScope === 'inProgress' && task.status !== 'in_progress') return false;
      if (taskScope === 'review' && task.status !== 'review' && !task.needsReview) return false;
      return true;
    });
  }, [openProjectIds, selectedProjectId, snapshot, taskScope]);

  useEffect(() => {
    if (!expandedTaskId) return;
    if (filteredTasks.some((task) => task.id === expandedTaskId)) return;
    setExpandedTaskId(null);
  }, [expandedTaskId, filteredTasks]);

  const handleMetricSelect = useCallback((scope: TaskScope) => {
    setTaskScope(scope);
    setSelectedProjectId('all');
    setExpandedTaskId(null);
  }, []);

  const handleConnect = useCallback(async () => {
    const next = {
      baseUrl: connectDraft.baseUrl.trim(),
      token: connectDraft.token.trim(),
    };
    if (!next.baseUrl || !next.token) {
      setError('Gateway URL and token are required.');
      return;
    }

    setLoading(true);
    try {
      await fetchSnapshot(next);
      await saveConnection(next);
      setConnection(next);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [connectDraft]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDashboard(false);
    setRefreshing(false);
  }, [loadDashboard]);

  const handleSubmitDemand = useCallback(async () => {
    if (!connection || !prompt.trim() || submitting) return;
    setSubmitting(true);
    try {
      const result = await createDemand(connection, {
        projectId: demandProjectId,
        prompt: prompt.trim(),
      });
      setPrompt('');
      setSelectedProjectId(result.task.projectId);
      await loadDashboard(true);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }, [connection, demandProjectId, loadDashboard, prompt, submitting]);

  if (booting) {
    return (
      <SafeAreaView style={styles.page}>
        <StatusBar style="dark" />
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.charcoal} />
        </View>
      </SafeAreaView>
    );
  }

  if (!connection) {
    return (
      <ConnectionScreen
        draft={connectDraft}
        error={error}
        loading={loading}
        onChange={setConnectDraft}
        onConnect={handleConnect}
      />
    );
  }

  return (
    <SafeAreaView style={styles.page}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={COLORS.charcoal}
              onRefresh={handleRefresh}
            />
          }
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.kicker}>Yoda Mobile</Text>
              <Text style={styles.title}>Project control</Text>
            </View>
            <Pressable
              accessibilityLabel="Disconnect"
              style={styles.iconButton}
              onPress={() => {
                void clearConnection();
                setConnection(null);
                setSnapshot(null);
                setExpandedTaskId(null);
              }}
            >
              <Ionicons color={COLORS.charcoal} name="log-out-outline" size={21} />
            </Pressable>
          </View>

          {error ? <Notice message={error} tone="error" /> : null}
          {loading && !snapshot ? <ActivityIndicator color={COLORS.charcoal} /> : null}

          {snapshot ? (
            <>
              <Metrics
                selectedScope={taskScope}
                snapshot={snapshot}
                onSelectScope={handleMetricSelect}
              />
              <ProjectRail
                projects={visibleProjects}
                selectedProjectId={selectedProjectId}
                onSelect={(projectId) => {
                  setSelectedProjectId(projectId);
                  setExpandedTaskId(null);
                }}
              />
              <DemandComposer
                projects={visibleProjects}
                prompt={prompt}
                selectedProjectId={demandProjectId}
                submitting={submitting}
                onPromptChange={setPrompt}
                onProjectChange={setDemandProjectId}
                onSubmit={handleSubmitDemand}
              />
              <TaskList
                expandedTaskId={expandedTaskId}
                projects={snapshot.projects}
                tasks={filteredTasks}
                title={selectedProjectId === 'all' ? taskScopeLabel(taskScope) : 'Project tasks'}
                onToggleTask={(taskId) => {
                  setExpandedTaskId((current) => (current === taskId ? null : taskId));
                }}
              />
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ConnectionScreen({
  draft,
  error,
  loading,
  onChange,
  onConnect,
}: {
  draft: ConnectDraft;
  error: string | null;
  loading: boolean;
  onChange: (next: ConnectDraft) => void;
  onConnect: () => void;
}) {
  return (
    <SafeAreaView style={styles.page}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.connectionContent}>
          <View style={styles.brandMark}>
            <Ionicons color={COLORS.surface} name="git-network-outline" size={25} />
          </View>
          <Text style={styles.connectionTitle}>Connect to desktop</Text>
          <Text style={styles.connectionCopy}>
            Scan the connection code from the desktop sidebar, or enter the gateway details
            manually.
          </Text>

          {error ? <Notice message={error} tone="error" /> : null}

          <View style={styles.formGroup}>
            <Text style={styles.label}>Gateway URL</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="http://192.168.1.10:3879"
              placeholderTextColor="#9A958C"
              style={styles.input}
              value={draft.baseUrl}
              onChangeText={(baseUrl) => onChange({ ...draft, baseUrl })}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Token</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Desktop gateway token"
              placeholderTextColor="#9A958C"
              secureTextEntry
              style={styles.input}
              value={draft.token}
              onChangeText={(token) => onChange({ ...draft, token })}
            />
          </View>

          <Pressable
            accessibilityLabel="Connect to desktop gateway"
            disabled={loading}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed ? styles.buttonPressed : null,
              loading ? styles.buttonDisabled : null,
            ]}
            onPress={onConnect}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.surface} />
            ) : (
              <>
                <Ionicons color={COLORS.surface} name="phone-portrait-outline" size={18} />
                <Text style={styles.primaryButtonText}>Connect</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Notice({ message, tone }: { message: string; tone: 'error' | 'info' }) {
  const color = tone === 'error' ? COLORS.red : COLORS.blue;
  return (
    <View style={[styles.notice, { borderColor: color }]}>
      <Ionicons
        color={color}
        name={tone === 'error' ? 'alert-circle-outline' : 'information-circle-outline'}
        size={18}
      />
      <Text style={styles.noticeText}>{message}</Text>
    </View>
  );
}

function Metrics({
  selectedScope,
  snapshot,
  onSelectScope,
}: {
  selectedScope: TaskScope;
  snapshot: MobileDashboardSnapshot;
  onSelectScope: (scope: TaskScope) => void;
}) {
  const metrics = [
    {
      label: 'Projects',
      value: snapshot.metrics.projectCount,
      icon: 'folder-outline',
      scope: 'all',
    },
    {
      label: 'Open',
      value: snapshot.metrics.openProjectCount,
      icon: 'desktop-outline',
      scope: 'open',
    },
    {
      label: 'Progress',
      value: snapshot.metrics.inProgressTaskCount,
      icon: 'flash-outline',
      scope: 'inProgress',
    },
    {
      label: 'Review',
      value: snapshot.metrics.reviewTaskCount,
      icon: 'checkmark-done-outline',
      scope: 'review',
    },
  ] as const;

  return (
    <View style={styles.metricsGrid}>
      {metrics.map((metric) => (
        <Pressable
          key={metric.label}
          accessibilityLabel={`Filter ${metric.label}`}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.metricCard,
            selectedScope === metric.scope ? styles.metricCardActive : null,
            pressed ? styles.buttonPressed : null,
          ]}
          onPress={() => onSelectScope(metric.scope)}
        >
          <Ionicons color={COLORS.charcoal} name={metric.icon} size={18} />
          <Text style={styles.metricValue}>{metric.value}</Text>
          <Text style={styles.metricLabel}>{metric.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ProjectRail({
  projects,
  selectedProjectId,
  onSelect,
}: {
  projects: MobileProjectSummary[];
  selectedProjectId: string;
  onSelect: (projectId: string) => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Projects</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        <ProjectChip
          active={selectedProjectId === 'all'}
          label="All"
          meta={`${projects.length}`}
          onPress={() => onSelect('all')}
        />
        {projects.map((project) => (
          <ProjectChip
            key={project.id}
            active={selectedProjectId === project.id}
            label={project.displayName}
            meta={project.isOpen ? 'Open' : 'Idle'}
            onPress={() => onSelect(project.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function ProjectChip({
  active,
  label,
  meta,
  onPress,
}: {
  active: boolean;
  label: string;
  meta: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.projectChip,
        active ? styles.projectChipActive : null,
        pressed ? styles.buttonPressed : null,
      ]}
      onPress={onPress}
    >
      <Text
        style={[styles.projectChipLabel, active ? styles.projectChipLabelActive : null]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text style={[styles.projectChipMeta, active ? styles.projectChipMetaActive : null]}>
        {meta}
      </Text>
    </Pressable>
  );
}

function DemandComposer({
  projects,
  prompt,
  selectedProjectId,
  submitting,
  onPromptChange,
  onProjectChange,
  onSubmit,
}: {
  projects: MobileProjectSummary[];
  prompt: string;
  selectedProjectId: string | null;
  submitting: boolean;
  onPromptChange: (prompt: string) => void;
  onProjectChange: (projectId: string | null) => void;
  onSubmit: () => void;
}) {
  const canSubmit = prompt.trim().length > 0 && !submitting;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>New request</Text>
      </View>
      <TextInput
        multiline
        placeholder="Describe the requirement..."
        placeholderTextColor="#9A958C"
        style={styles.promptInput}
        textAlignVertical="top"
        value={prompt}
        onChangeText={onPromptChange}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        <ProjectChip
          active={selectedProjectId === null}
          label="Drafts"
          meta="Default"
          onPress={() => onProjectChange(null)}
        />
        {projects.map((project) => (
          <ProjectChip
            key={project.id}
            active={selectedProjectId === project.id}
            label={project.displayName}
            meta={project.isOpen ? 'Open' : 'Will open'}
            onPress={() => onProjectChange(project.id)}
          />
        ))}
      </ScrollView>
      <Pressable
        accessibilityLabel="Submit new mobile request"
        disabled={!canSubmit}
        style={({ pressed }) => [
          styles.primaryButton,
          !canSubmit ? styles.buttonDisabled : null,
          pressed ? styles.buttonPressed : null,
        ]}
        onPress={onSubmit}
      >
        {submitting ? (
          <ActivityIndicator color={COLORS.surface} />
        ) : (
          <>
            <Ionicons color={COLORS.surface} name="arrow-up-outline" size={18} />
            <Text style={styles.primaryButtonText}>Start request</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

function TaskList({
  expandedTaskId,
  projects,
  tasks,
  title,
  onToggleTask,
}: {
  expandedTaskId: string | null;
  projects: MobileProjectSummary[];
  tasks: MobileTaskSummary[];
  title: string;
  onToggleTask: (taskId: string) => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionMeta}>{tasks.length}</Text>
      </View>
      {tasks.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons color={COLORS.muted} name="file-tray-outline" size={22} />
          <Text style={styles.emptyText}>No active tasks.</Text>
        </View>
      ) : (
        tasks.map((task) => (
          <TaskRow
            key={task.id}
            expanded={expandedTaskId === task.id}
            projectLabel={projectName(projects, task.projectId)}
            task={task}
            onPress={() => onToggleTask(task.id)}
          />
        ))
      )}
    </View>
  );
}

function TaskRow({
  expanded,
  projectLabel,
  task,
  onPress,
}: {
  expanded: boolean;
  projectLabel: string;
  task: MobileTaskSummary;
  onPress: () => void;
}) {
  const bootstrap =
    task.bootstrapStatus.status === 'bootstrapping'
      ? 'Booting'
      : task.bootstrapStatus.status === 'error'
        ? 'Error'
        : task.bootstrapStatus.status === 'ready'
          ? 'Ready'
          : 'Idle';

  return (
    <Pressable
      accessibilityLabel={`Open task ${task.name}`}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.taskRow,
        expanded ? styles.taskRowExpanded : null,
        pressed ? styles.buttonPressed : null,
      ]}
      onPress={onPress}
    >
      <View style={styles.taskTopLine}>
        <Text style={styles.taskName} numberOfLines={2}>
          {task.name}
        </Text>
        <View style={[styles.statusPill, { borderColor: statusColor(task.status) }]}>
          <Text style={[styles.statusText, { color: statusColor(task.status) }]}>
            {statusLabel(task.status)}
          </Text>
        </View>
      </View>
      <Text style={styles.taskProject} numberOfLines={1}>
        {projectLabel}
      </Text>
      <View style={styles.taskMetaLine}>
        <MetaItem icon="pulse-outline" label={bootstrap} />
        <MetaItem icon="chatbubbles-outline" label={`${task.conversationCount}`} />
        <MetaItem
          icon="time-outline"
          label={formatTimestamp(task.lastInteractedAt ?? task.updatedAt)}
        />
      </View>
      {expanded ? (
        <View style={styles.taskDetails}>
          <DetailItem label="Branch" value={task.taskBranch ?? 'No branch'} />
          <DetailItem label="Updated" value={formatTimestamp(task.updatedAt)} />
          <DetailItem
            label="Providers"
            value={Object.keys(task.providerCounts).join(', ') || 'None'}
          />
          <DetailItem label="Review" value={task.needsReview ? 'Required' : 'Not required'} />
        </View>
      ) : null}
    </Pressable>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailItem}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function MetaItem({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.metaItem}>
      <Ionicons color={COLORS.muted} name={icon} size={14} />
      <Text style={styles.metaText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: COLORS.page,
  },
  flex: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 18,
    paddingBottom: 34,
    gap: 18,
  },
  connectionContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 18,
  },
  brandMark: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: COLORS.charcoal,
  },
  connectionTitle: {
    color: COLORS.ink,
    fontSize: 30,
    fontWeight: '700',
  },
  connectionCopy: {
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kicker: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  title: {
    color: COLORS.ink,
    fontSize: 31,
    fontWeight: '700',
  },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    padding: 12,
  },
  noticeText: {
    flex: 1,
    color: COLORS.ink,
    fontSize: 14,
    lineHeight: 20,
  },
  formGroup: {
    gap: 8,
  },
  label: {
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    color: COLORS.ink,
    fontSize: 16,
    paddingHorizontal: 14,
  },
  promptInput: {
    minHeight: 118,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    color: COLORS.ink,
    fontSize: 16,
    lineHeight: 22,
    padding: 14,
  },
  primaryButton: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 8,
    backgroundColor: COLORS.charcoal,
  },
  primaryButtonText: {
    color: COLORS.surface,
    fontSize: 15,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.78,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    width: '48.5%',
    minHeight: 92,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    padding: 13,
    gap: 5,
  },
  metricCardActive: {
    borderColor: COLORS.charcoal,
    backgroundColor: '#EFEEE7',
  },
  metricValue: {
    color: COLORS.ink,
    fontSize: 28,
    fontWeight: '800',
  },
  metricLabel: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: COLORS.ink,
    fontSize: 18,
    fontWeight: '700',
  },
  sectionMeta: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  rail: {
    gap: 9,
    paddingRight: 2,
  },
  projectChip: {
    width: 126,
    minHeight: 58,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 9,
    justifyContent: 'space-between',
  },
  projectChipActive: {
    borderColor: COLORS.charcoal,
    backgroundColor: COLORS.charcoal,
  },
  projectChipLabel: {
    color: COLORS.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  projectChipLabelActive: {
    color: COLORS.surface,
  },
  projectChipMeta: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  projectChipMetaActive: {
    color: '#D8D4CB',
  },
  taskRow: {
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    padding: 14,
    gap: 10,
  },
  taskRowExpanded: {
    borderColor: COLORS.charcoal,
  },
  taskTopLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  taskName: {
    flex: 1,
    color: COLORS.ink,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
  },
  taskProject: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  taskMetaLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  taskDetails: {
    borderTopWidth: 1,
    borderTopColor: COLORS.faint,
    paddingTop: 10,
    gap: 8,
  },
  detailItem: {
    flexDirection: 'row',
    gap: 10,
  },
  detailLabel: {
    width: 74,
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  detailValue: {
    flex: 1,
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  metaItem: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  statusPill: {
    minHeight: 28,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 9,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyState: {
    minHeight: 92,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 14,
    fontWeight: '600',
  },
});
