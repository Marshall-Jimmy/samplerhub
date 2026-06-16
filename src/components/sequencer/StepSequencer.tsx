import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { PlayCircleOutlined, PauseCircleOutlined, StepBackwardOutlined, StepForwardOutlined } from '@ant-design/icons';
import { PadConfig } from '../../stores/padStore';
import { SequencerPattern } from '../../stores/padStore';
import s from '../../styles/components/sequencer/step-sequencer.module.css';

interface StepSequencerProps {
  pads: PadConfig[];
  pattern: SequencerPattern;
  currentPatternIndex: number;
  isPlaying: boolean;
  currentStep: number;
  onToggleStep: (patternIndex: number, padId: string, stepIndex: number) => void;
  onSetStepVelocity: (patternIndex: number, padId: string, stepIndex: number, velocity: number) => void;
  onPlay: () => void;
  onStop: () => void;
  onPatternChange: (index: number) => void;
  onUpdatePattern: (index: number, updates: Partial<SequencerPattern>) => void;
  onTriggerPad: (padId: string, velocity?: number) => void;
}

export const StepSequencer: React.FC<StepSequencerProps> = ({
  pads,
  pattern,
  currentPatternIndex,
  isPlaying,
  currentStep,
  onToggleStep,
  onSetStepVelocity,
  onPlay,
  onStop,
  onPatternChange,
  onUpdatePattern,
  onTriggerPad,
}) => {
  const { t } = useTranslation();

  const handleStepClick = useCallback((padId: string, stepIndex: number) => {
    onToggleStep(currentPatternIndex, padId, stepIndex);
    // Preview the sound if activating
    const track = pattern.tracks[padId];
    const step = track?.[stepIndex];
    if (!step?.active) {
      onTriggerPad(padId, 0.8);
    }
  }, [currentPatternIndex, onToggleStep, pattern.tracks, onTriggerPad]);

  const handleVelocityChange = useCallback((padId: string, stepIndex: number, velocity: number) => {
    onSetStepVelocity(currentPatternIndex, padId, stepIndex, velocity);
  }, [currentPatternIndex, onSetStepVelocity]);

  const handleStepsChange = useCallback((steps: number) => {
    onUpdatePattern(currentPatternIndex, { steps });
  }, [currentPatternIndex, onUpdatePattern]);

  const handleSwingChange = useCallback((swing: number) => {
    onUpdatePattern(currentPatternIndex, { swing });
  }, [currentPatternIndex, onUpdatePattern]);

  const handleBpmChange = useCallback((bpm: number) => {
    onUpdatePattern(currentPatternIndex, { bpm });
  }, [currentPatternIndex, onUpdatePattern]);

  const getStepColor = (padId: string, stepIndex: number) => {
    const track = pattern.tracks[padId];
    const step = track?.[stepIndex];
    if (!step?.active) return '';
    const intensity = Math.round(step.velocity * 255);
    return `rgba(99, 102, 241, ${0.3 + step.velocity * 0.7})`;
  };

  return (
    <div className={s.sequencer}>
      {/* Toolbar */}
      <div className={s.toolbar}>
        <div className={s.transport}>
          <button
            className={s.transportBtn}
            onClick={() => onPatternChange(Math.max(0, currentPatternIndex - 1))}
            disabled={currentPatternIndex === 0}
          >
            <StepBackwardOutlined />
          </button>
          <button
            className={`${s.transportBtn} ${s.playBtn}`}
            onClick={isPlaying ? onStop : onPlay}
          >
            {isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
          </button>
          <button
            className={s.transportBtn}
            onClick={() => onPatternChange(currentPatternIndex + 1)}
          >
            <StepForwardOutlined />
          </button>
        </div>

        <div className={s.patternInfo}>
          <span className={s.patternName}>{pattern.name}</span>
          <span className={s.patternNumber}>P{currentPatternIndex + 1}</span>
        </div>

        <div className={s.controls}>
          <div className={s.control}>
            <label>{t('sequencer.steps')}</label>
            <select
              value={pattern.steps}
              onChange={(e) => handleStepsChange(Number(e.target.value))}
            >
              <option value={8}>8</option>
              <option value={16}>16</option>
              <option value={32}>32</option>
            </select>
          </div>

          <div className={s.control}>
            <label>{t('sequencer.bpm')}</label>
            <input
              type="number"
              min="60"
              max="200"
              value={pattern.bpm}
              onChange={(e) => handleBpmChange(Number(e.target.value))}
            />
          </div>

          <div className={s.control}>
            <label>{t('sequencer.swing')}</label>
            <input
              type="range"
              min="0"
              max="100"
              value={pattern.swing}
              onChange={(e) => handleSwingChange(Number(e.target.value))}
            />
            <span>{pattern.swing}%</span>
          </div>
        </div>
      </div>

      {/* Step Grid */}
      <div className={s.grid}>
        {/* Step numbers header */}
        <div className={s.row}>
          <div className={s.padLabel}></div>
          {Array.from({ length: pattern.steps }, (_, i) => (
            <div
              key={i}
              className={`${s.stepNumber} ${i === currentStep ? s.currentStep : ''} ${i % 4 === 0 ? s.beatStep : ''}`}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Pad rows */}
        {pads.map((pad) => (
          <div key={pad.id} className={s.row}>
            <div className={s.padLabel} title={pad.name}>
              <span className={s.padKey}>{pad.key}</span>
              <span className={s.padName}>{pad.name}</span>
            </div>
            {Array.from({ length: pattern.steps }, (_, stepIndex) => {
              const track = pattern.tracks[pad.id];
              const step = track?.[stepIndex];
              const isActive = step?.active ?? false;
              const velocity = step?.velocity ?? 0.8;

              return (
                <div
                  key={stepIndex}
                  className={`${s.step} ${isActive ? s.active : ''} ${stepIndex === currentStep ? s.current : ''}`}
                  style={isActive ? { backgroundColor: getStepColor(pad.id, stepIndex) } : undefined}
                  onClick={() => handleStepClick(pad.id, stepIndex)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (isActive) {
                      const newVelocity = velocity >= 1 ? 0.25 : velocity + 0.25;
                      handleVelocityChange(pad.id, stepIndex, newVelocity);
                    }
                  }}
                  title={isActive ? `Velocity: ${Math.round(velocity * 100)}%` : t('sequencer.clickToActivate')}
                >
                  {isActive && (
                    <div
                      className={s.velocityIndicator}
                      style={{ opacity: velocity }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Velocity legend */}
      <div className={s.legend}>
        <span>{t('sequencer.rightClickToChangeVelocity')}</span>
      </div>
    </div>
  );
};
