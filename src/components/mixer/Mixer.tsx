import React from 'react';
import { useTranslation } from 'react-i18next';
import { UpOutlined, DownOutlined, SoundOutlined } from '@ant-design/icons';
import { MixerProps } from './types';
import s from '../../styles/components/mixer/mixer.module.css';

export const Mixer: React.FC<MixerProps> = ({
  channels,
  masterVolume,
  effects,
  visible,
  onToggleVisible,
  onMasterVolumeChange,
  onEffectChange,
  callbacks,
}) => {
  const { t } = useTranslation();

  return (
    <div className={`${s.mixer} ${visible ? s.visible : ''}`}>
      {/* Toggle button */}
      <button className={s.toggleBtn} onClick={onToggleVisible}>
        {visible ? <DownOutlined /> : <UpOutlined />}
        <span>{visible ? t('mixer.hide') : t('mixer.show')}</span>
      </button>

      {/* Mixer panel */}
      <div className={s.panel}>
        {/* Channel strips */}
        <div className={s.channels}>
          {channels.map((channel) => (
            <div key={channel.id} className={s.channel}>
              <div className={s.channelHeader}>
                {channel.key && (
                  <span className={s.channelKey}>{channel.key}</span>
                )}
                <span className={s.channelName}>{channel.name}</span>
              </div>

              {/* Volume fader */}
              <div className={s.fader}>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={channel.volume}
                  onChange={(e) => callbacks.onVolumeChange(channel.id, parseFloat(e.target.value))}
                  className={s.verticalSlider}
                />
                <span className={s.faderValue}>{Math.round(channel.volume * 100)}</span>
              </div>

              {/* Pan */}
              <div className={s.knobRow}>
                <label>{t('mixer.pan')}</label>
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.1"
                  value={channel.pan}
                  onChange={(e) => callbacks.onPanChange(channel.id, parseFloat(e.target.value))}
                />
              </div>

              {/* Pitch */}
              {channel.pitch !== undefined && callbacks.onPitchChange && (
                <div className={s.knobRow}>
                  <label>{t('mixer.pitch')}</label>
                  <input
                    type="range"
                    min="-12"
                    max="12"
                    step="1"
                    value={channel.pitch}
                    onChange={(e) => callbacks.onPitchChange!(channel.id, parseInt(e.target.value))}
                  />
                  <span>{channel.pitch > 0 ? `+${channel.pitch}` : channel.pitch}</span>
                </div>
              )}

              {/* Delay Send */}
              {channel.delaySend !== undefined && callbacks.onDelaySendChange && (
                <div className={s.knobRow}>
                  <label>{t('mixer.delay')}</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={channel.delaySend}
                    onChange={(e) => callbacks.onDelaySendChange!(channel.id, parseFloat(e.target.value))}
                  />
                </div>
              )}

              {/* Reverb Send */}
              {channel.reverbSend !== undefined && callbacks.onReverbSendChange && (
                <div className={s.knobRow}>
                  <label>{t('mixer.reverb')}</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={channel.reverbSend}
                    onChange={(e) => callbacks.onReverbSendChange!(channel.id, parseFloat(e.target.value))}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Master & Effects section */}
        <div className={s.masterSection}>
          <div className={s.sectionTitle}>{t('mixer.master')}</div>

          <div className={s.masterFader}>
            <SoundOutlined />
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={masterVolume}
              onChange={(e) => onMasterVolumeChange(parseFloat(e.target.value))}
              className={s.verticalSlider}
            />
            <span>{Math.round(masterVolume * 100)}</span>
          </div>

          <div className={s.effects}>
            <div className={s.effectControl}>
              <label>{t('mixer.delayTime')}</label>
              <input
                type="range"
                min="0.05"
                max="1"
                step="0.01"
                value={effects.delayTime}
                onChange={(e) => onEffectChange('delayTime', parseFloat(e.target.value))}
              />
              <span>{Math.round(effects.delayTime * 1000)}ms</span>
            </div>

            <div className={s.effectControl}>
              <label>{t('mixer.delayFeedback')}</label>
              <input
                type="range"
                min="0"
                max="0.95"
                step="0.01"
                value={effects.delayFeedback}
                onChange={(e) => onEffectChange('delayFeedback', parseFloat(e.target.value))}
              />
              <span>{Math.round(effects.delayFeedback * 100)}%</span>
            </div>

            <div className={s.effectControl}>
              <label>{t('mixer.delayMix')}</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={effects.delayMix}
                onChange={(e) => onEffectChange('delayMix', parseFloat(e.target.value))}
              />
              <span>{Math.round(effects.delayMix * 100)}%</span>
            </div>

            <div className={s.effectControl}>
              <label>{t('mixer.reverbMix')}</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={effects.reverbMix}
                onChange={(e) => onEffectChange('reverbMix', parseFloat(e.target.value))}
              />
              <span>{Math.round(effects.reverbMix * 100)}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
