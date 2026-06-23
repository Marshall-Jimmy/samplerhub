import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  FolderOpenOutlined,
  SearchOutlined,
  StarOutlined,
  UnorderedListOutlined,
  ClockCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import s from '../../styles/components/empty-state.module.css';

export type EmptyStateType = 'no-samples' | 'no-results' | 'no-favorites' | 'no-playlist' | 'no-recent' | 'error-state';

interface EmptyStateProps {
  type?: EmptyStateType;
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

const iconMap: Record<EmptyStateType, React.ReactNode> = {
  'no-samples': <FolderOpenOutlined />,
  'no-results': <SearchOutlined />,
  'no-favorites': <StarOutlined />,
  'no-playlist': <UnorderedListOutlined />,
  'no-recent': <ClockCircleOutlined />,
  'error-state': <WarningOutlined />,
};

const titleKeyMap: Record<EmptyStateType, string> = {
  'no-samples': 'empty.noSamples.title',
  'no-results': 'empty.noResults.title',
  'no-favorites': 'empty.noFavorites.title',
  'no-playlist': 'empty.noPlaylist.title',
  'no-recent': 'empty.noRecent.title',
  'error-state': 'empty.errorState.title',
};

const descKeyMap: Record<EmptyStateType, string> = {
  'no-samples': 'empty.noSamples.description',
  'no-results': 'empty.noResults.description',
  'no-favorites': 'empty.noFavorites.description',
  'no-playlist': 'empty.noPlaylist.description',
  'no-recent': 'empty.noRecent.description',
  'error-state': 'empty.errorState.description',
};

const EmptyState: React.FC<EmptyStateProps> = ({ type = 'no-samples', title, description, action }) => {
  const { t } = useTranslation();

  return (
    <div className={s.container}>
      <div className={s.iconWrap}>
        {iconMap[type]}
      </div>
      <h3 className={s.title}>{title || t(titleKeyMap[type])}</h3>
      <p className={s.description}>{description || t(descKeyMap[type])}</p>
      {action && <div className={s.actionArea}>{action}</div>}
    </div>
  );
};

export default EmptyState;
