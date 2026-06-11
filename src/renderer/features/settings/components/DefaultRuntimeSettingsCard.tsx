import React from 'react';
import { useTranslation } from 'react-i18next';
import type { AppSettings } from '@shared/app-settings';
import { isValidRuntimeId, type RuntimeId } from '@shared/runtime-registry';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import { AgentSelector } from '@renderer/lib/components/agent-selector/agent-selector';
import { SettingRow } from './SettingRow';

const DEFAULT_AGENT: RuntimeId = 'claude';

const DefaultRuntimeSettingsCard: React.FC = () => {
  const { t } = useTranslation();
  const {
    value: defaultAgentValue,
    update,
    isLoading: loading,
    isSaving: saving,
  } = useAppSettingsKey('defaultRuntime');

  const defaultRuntime: RuntimeId = isValidRuntimeId(defaultAgentValue)
    ? (defaultAgentValue as RuntimeId)
    : DEFAULT_AGENT;

  const handleChange = (agent: RuntimeId) => {
    update(agent as AppSettings['defaultRuntime']);
  };

  return (
    <SettingRow
      title={t('settings.defaultRuntime.title')}
      description={t('settings.defaultRuntime.description')}
      control={
        <div className="w-[183px] shrink-0">
          <AgentSelector
            value={defaultRuntime}
            onChange={handleChange}
            disabled={loading || saving}
            className="w-full"
          />
        </div>
      }
    />
  );
};

export default DefaultRuntimeSettingsCard;
