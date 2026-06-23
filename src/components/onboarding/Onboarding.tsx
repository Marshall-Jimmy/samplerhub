import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../stores/settingsStore';
import { useProfileStore } from '../../stores/profileStore';
import { ipcClient } from '../../services/ipcClient';
import i18n from '../../i18n';

const LANGUAGES = [
  { code: 'zh-CN', label: '中文', flag: '🇨🇳' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'pt-BR', label: 'Português', flag: '🇧🇷' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'ug', label: 'ئۇيغۇرچە', flag: '🇨🇳' },
];

const MODES = [
  {
    id: 'music' as const,
    icon: '🎵',
    gradient: 'from-indigo-500 via-purple-500 to-pink-500',
  },
  {
    id: 'game' as const,
    icon: '🎮',
    gradient: 'from-emerald-500 via-teal-500 to-cyan-500',
  },
  {
    id: 'post' as const,
    icon: '🎬',
    gradient: 'from-orange-500 via-amber-500 to-yellow-500',
  },
];

const TOTAL_STEPS = 4;

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
    scale: 0.95,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 300 : -300,
    opacity: 0,
    scale: 0.95,
  }),
};

const Onboarding: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const { t, i18n: i18nInstance } = useTranslation();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [selectedLang, setSelectedLang] = useState(
    i18nInstance.resolvedLanguage || i18nInstance.language || 'zh-CN'
  );
  const [selectedMode, setSelectedMode] = useState<'music' | 'game' | 'post'>('music');
  const [addedFolders, setAddedFolders] = useState<string[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const setHasCompletedOnboarding = useSettingsStore((s: any) => s.setHasCompletedOnboarding);
  const setAppMode = useProfileStore((s: any) => s.setAppMode);

  const goNext = useCallback(() => {
    setDirection(1);
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1);
    } else {
      // Final step - complete onboarding
      setHasCompletedOnboarding(true);
      setAppMode(selectedMode);
      onComplete();
    }
  }, [step, selectedMode, setHasCompletedOnboarding, setAppMode, onComplete]);

  const goBack = useCallback(() => {
    setDirection(-1);
    setStep(Math.max(0, step - 1));
  }, [step]);

  const handleSelectLang = useCallback((code: string) => {
    setSelectedLang(code);
    i18nInstance.changeLanguage(code);
  }, [i18nInstance]);

  const handleAddFolder = useCallback(async () => {
    setIsAdding(true);
    try {
      const result = await ipcClient.openFoldersDialog();
      if (result && result.length > 0) {
        for (const folder of result) {
          if (!addedFolders.includes(folder)) {
            await ipcClient.addWatchedFolder(folder);
            setAddedFolders((prev) => [...prev, folder]);
          }
        }
      }
    } catch (err) {
      console.error('[Onboarding] Failed to add folder:', err);
    } finally {
      setIsAdding(false);
    }
  }, [addedFolders]);

  const progress = ((step + 1) / TOTAL_STEPS) * 100;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base)',
        overflow: 'hidden',
      }}
    >
      {/* Animated background gradient */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse at 30% 20%, rgba(99,102,241,0.15) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(34,211,238,0.1) 0%, transparent 50%)',
        pointerEvents: 'none',
      }} />

      {/* Content container */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 560,
        padding: '0 24px',
      }}>
        {/* Progress bar */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 24,
          right: 24,
          height: 3,
          background: 'var(--border-subtle)',
          borderRadius: 2,
          overflow: 'hidden',
        }}>
          <motion.div
            initial={{ width: '25%' }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
            style={{
              height: '100%',
              background: 'linear-gradient(90deg, var(--brand-primary), var(--brand-accent))',
              borderRadius: 2,
            }}
          />
        </div>

        {/* Step indicator dots */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 8,
          marginBottom: 40,
          marginTop: 20,
        }}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <motion.div
              key={i}
              animate={{
                width: i === step ? 24 : 8,
                background: i <= step ? 'var(--brand-primary)' : 'var(--border-default)',
              }}
              transition={{ duration: 0.3 }}
              style={{
                height: 8,
                borderRadius: 4,
              }}
            />
          ))}
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {step === 0 && (
              <WelcomeStep onNext={goNext} />
            )}
            {step === 1 && (
              <LanguageStep
                selectedLang={selectedLang}
                onSelect={handleSelectLang}
                onNext={goNext}
                onBack={goBack}
              />
            )}
            {step === 2 && (
              <ModeStep
                selectedMode={selectedMode}
                onSelect={setSelectedMode}
                onNext={goNext}
                onBack={goBack}
              />
            )}
            {step === 3 && (
              <FolderStep
                addedFolders={addedFolders}
                isAdding={isAdding}
                onAdd={handleAddFolder}
                onNext={goNext}
                onBack={goBack}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

/* ─── Step Components ─── */

const WelcomeStep: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const { t } = useTranslation();
  return (
    <div style={{ textAlign: 'center' }}>
      {/* Logo / Icon */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: 'backOut', delay: 0.1 }}
        style={{
          width: 100,
          height: 100,
          margin: '0 auto 28px',
          borderRadius: 24,
          background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-accent))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 48,
          boxShadow: '0 20px 60px rgba(99,102,241,0.3)',
        }}
      >
        🎵
      </motion.div>

      <motion.h1
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: 'var(--text-primary)',
          margin: '0 0 12px',
          letterSpacing: '-0.5px',
        }}
      >
        {t('onboarding.welcome.title', "Jima's SamplerHub")}
      </motion.h1>

      <motion.p
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        style={{
          fontSize: 15,
          color: 'var(--text-secondary)',
          margin: '0 0 8px',
          lineHeight: 1.6,
        }}
      >
        {t('onboarding.welcome.subtitle', 'Your intelligent sample management workstation')}
      </motion.p>

      <motion.p
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
        style={{
          fontSize: 13,
          color: 'var(--text-tertiary)',
          margin: '0 0 36px',
          lineHeight: 1.5,
        }}
      >
        {t('onboarding.welcome.description', 'Scan, classify, search, and play your samples with AI-powered tools. Let\'s get you set up.')}
      </motion.p>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <button
          onClick={onNext}
          style={{
            padding: '12px 40px',
            fontSize: 15,
            fontWeight: 600,
            color: '#fff',
            background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-accent))',
            border: 'none',
            borderRadius: 12,
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(99,102,241,0.3)',
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
            (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 30px rgba(99,102,241,0.4)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
            (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(99,102,241,0.3)';
          }}
        >
          {t('onboarding.common.getStarted', 'Get Started')}
        </button>
      </motion.div>
    </div>
  );
};

const LanguageStep: React.FC<{
  selectedLang: string;
  onSelect: (code: string) => void;
  onNext: () => void;
  onBack: () => void;
}> = ({ selectedLang, onSelect, onNext, onBack }) => {
  const { t } = useTranslation();
  return (
    <div>
      <h2 style={{
        fontSize: 22,
        fontWeight: 600,
        color: 'var(--text-primary)',
        margin: '0 0 6px',
      }}>
        {t('onboarding.language.title', 'Choose Your Language')}
      </h2>
      <p style={{
        fontSize: 14,
        color: 'var(--text-secondary)',
        margin: '0 0 24px',
      }}>
        {t('onboarding.language.subtitle', 'Select your preferred language. You can change it later in settings.')}
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 8,
        marginBottom: 32,
        maxHeight: 320,
        overflowY: 'auto',
        paddingRight: 4,
      }}>
        {LANGUAGES.map((lang) => {
          const isSelected = selectedLang === lang.code;
          return (
            <motion.button
              key={lang.code}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelect(lang.code)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 14px',
                fontSize: 14,
                color: isSelected ? 'var(--brand-primary)' : 'var(--text-primary)',
                background: isSelected ? 'var(--brand-primary-dim, rgba(99,102,241,0.15))' : 'var(--bg-surface)',
                border: `1.5px solid ${isSelected ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                borderRadius: 10,
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 20 }}>{lang.flag}</span>
              <span style={{ fontWeight: isSelected ? 600 : 400 }}>{lang.label}</span>
            </motion.button>
          );
        })}
      </div>

      <StepButtons onNext={onNext} onBack={onBack} nextLabel={t('onboarding.common.next', 'Next')} />
    </div>
  );
};

const ModeStep: React.FC<{
  selectedMode: 'music' | 'game' | 'post';
  onSelect: (mode: 'music' | 'game' | 'post') => void;
  onNext: () => void;
  onBack: () => void;
}> = ({ selectedMode, onSelect, onNext, onBack }) => {
  const { t } = useTranslation();
  return (
    <div>
      <h2 style={{
        fontSize: 22,
        fontWeight: 600,
        color: 'var(--text-primary)',
        margin: '0 0 6px',
      }}>
        {t('onboarding.mode.title', 'Select Your Mode')}
      </h2>
      <p style={{
        fontSize: 14,
        color: 'var(--text-secondary)',
        margin: '0 0 24px',
      }}>
        {t('onboarding.mode.subtitle', 'Choose the workflow that fits your needs. You can switch later.')}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
        {MODES.map((mode) => {
          const isSelected = selectedMode === mode.id;
          return (
            <motion.button
              key={mode.id}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => onSelect(mode.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '18px 20px',
                background: isSelected ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                border: `1.5px solid ${isSelected ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                borderRadius: 14,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s',
                boxShadow: isSelected ? '0 4px 20px rgba(99,102,241,0.15)' : 'none',
              }}
            >
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: `linear-gradient(135deg, ${isSelected ? 'var(--brand-primary)' : 'var(--border-default)'}, ${isSelected ? 'var(--brand-accent)' : 'var(--border-subtle)'})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
                flexShrink: 0,
                transition: 'all 0.3s',
              }}>
                {mode.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  marginBottom: 2,
                }}>
                  {t(`onboarding.mode.${mode.id}.label`, mode.id === 'music' ? 'Music Production' : mode.id === 'game' ? 'Game Audio' : 'Post Production')}
                </div>
                <div style={{
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                }}>
                  {t(`onboarding.mode.${mode.id}.desc`, mode.id === 'music' ? 'Manage samples for music production' : mode.id === 'game' ? 'Organize game sound effects & SFX' : 'Handle post-production audio')}
                </div>
              </div>
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: 'var(--brand-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 12,
                    flexShrink: 0,
                  }}
                >
                  ✓
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </div>

      <StepButtons onNext={onNext} onBack={onBack} nextLabel={t('onboarding.common.next', 'Next')} />
    </div>
  );
};

const FolderStep: React.FC<{
  addedFolders: string[];
  isAdding: boolean;
  onAdd: () => void;
  onNext: () => void;
  onBack: () => void;
}> = ({ addedFolders, isAdding, onAdd, onNext, onBack }) => {
  const { t } = useTranslation();
  return (
    <div>
      <h2 style={{
        fontSize: 22,
        fontWeight: 600,
        color: 'var(--text-primary)',
        margin: '0 0 6px',
      }}>
        {t('onboarding.folder.title', 'Add Your Sample Library')}
      </h2>
      <p style={{
        fontSize: 14,
        color: 'var(--text-secondary)',
        margin: '0 0 24px',
      }}>
        {t('onboarding.folder.subtitle', 'Select folders containing your audio samples. You can add more later.')}
      </p>

      {/* Add folder button */}
      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={onAdd}
        disabled={isAdding}
        style={{
          width: '100%',
          padding: '20px',
          border: '2px dashed var(--border-default)',
          borderRadius: 14,
          background: 'transparent',
          color: 'var(--text-secondary)',
          fontSize: 14,
          cursor: isAdding ? 'wait' : 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          marginBottom: 16,
          transition: 'all 0.2s',
        }}
      >
        <span style={{ fontSize: 28 }}>📂</span>
        <span>
          {isAdding
            ? t('onboarding.folder.adding', 'Adding...')
            : t('onboarding.folder.clickToAdd', 'Click to add sample folders')
          }
        </span>
      </motion.button>

      {/* Added folders list */}
      {addedFolders.length > 0 && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          marginBottom: 24,
          maxHeight: 120,
          overflowY: 'auto',
        }}>
          {addedFolders.map((folder) => (
            <div
              key={folder}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                background: 'var(--bg-surface)',
                borderRadius: 8,
                fontSize: 13,
                color: 'var(--text-primary)',
              }}
            >
              <span>📁</span>
              <span style={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {folder}
              </span>
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                style={{ color: 'var(--brand-primary)', fontSize: 14 }}>✓</motion.span>
            </div>
          ))}
        </div>
      )}

      <StepButtons
        onNext={onNext}
        onBack={onBack}
        nextLabel={t('onboarding.common.finish', 'Start Using')}
        showSkip={false}
      />
    </div>
  );
};

const StepButtons: React.FC<{
  onNext: () => void;
  onBack: () => void;
  nextLabel: string;
  showSkip?: boolean;
}> = ({ onNext, onBack, nextLabel, showSkip = true }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  }}>
    <button
      onClick={onBack}
      style={{
        padding: '10px 20px',
        fontSize: 14,
        color: 'var(--text-secondary)',
        background: 'transparent',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
      }}
    >
      ← {showSkip ? '' : ''}
    </button>
    <button
      onClick={onNext}
      style={{
        padding: '10px 28px',
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
        background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-accent))',
        border: 'none',
        borderRadius: 10,
        cursor: 'pointer',
        boxShadow: '0 2px 12px rgba(99,102,241,0.25)',
        transition: 'transform 0.2s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
      }}
    >
      {nextLabel}
    </button>
  </div>
);

export default Onboarding;
