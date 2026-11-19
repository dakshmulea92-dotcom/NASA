/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { LunarProvider, useLunar } from './context/LunarContext.tsx';
import { AppShell } from './components/AppShell.tsx';
import { SiteCover } from './components/SiteCover.tsx';
import { CommandCenterPage } from './pages/CommandCenterPage.tsx';
import { LunarExplorerPage } from './pages/LunarExplorerPage.tsx';
import { LandingSitePage } from './pages/LandingSitePage.tsx';
import { TerrainPage } from './pages/TerrainPage.tsx';
import { EnvironmentPage } from './pages/EnvironmentPage.tsx';
import { IlluminationPage } from './pages/IlluminationPage.tsx';
import { EarthExplorerPage } from './pages/EarthExplorerPage.tsx';
import { MissionPlannerPage } from './pages/MissionPlannerPage.tsx';
import { SimulatorPage } from './pages/SimulatorPage.tsx';
import { RoverPage } from './pages/RoverPage.tsx';
import { AssistantPage } from './pages/AssistantPage.tsx';
import { DataCenterPage } from './pages/DataCenterPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import type { PageId } from './types/lunar.ts';

const PageRouter: React.FC = () => {
  const { activePage } = useLunar();

  switch (activePage) {
    case 'command-center':
      return <CommandCenterPage />;
    case 'lunar-explorer':
      return <LunarExplorerPage />;
    case 'landing-site':
      return <LandingSitePage />;
    case 'terrain':
      return <TerrainPage />;
    case 'environment':
      return <EnvironmentPage />;
    case 'illumination':
      return <IlluminationPage />;
    case 'earth-explorer':
      return <EarthExplorerPage />;
    case 'mission-planner':
      return <MissionPlannerPage />;
    case 'simulator':
      return <SimulatorPage />;
    case 'rover':
      return <RoverPage />;
    case 'assistant':
      return <AssistantPage />;
    case 'data-center':
      return <DataCenterPage />;
    case 'settings':
      return <SettingsPage />;
    default:
      return <CommandCenterPage />;
  }
};

const RootExperience: React.FC = () => {
  const { setActivePage } = useLunar();
  const [showCover, setShowCover] = useState(true);

  const handleEnterWorkspace = (targetPage: PageId = 'command-center') => {
    setActivePage(targetPage);
    setShowCover(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <AnimatePresence mode="wait">
      {showCover ? (
        <motion.div
          key="site-cover"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.28 }}
        >
          <SiteCover onEnterWorkspace={handleEnterWorkspace} />
        </motion.div>
      ) : (
        <motion.div
          key="command-workspace"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28 }}
        >
          <AppShell
            onOpenCover={() => {
              setShowCover(true);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            <PageRouter />
          </AppShell>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default function App() {
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  useEffect(() => {
    const handler = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <LunarProvider>
        {gmpQuotaExceeded && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
            <span>
              Google Maps Platform quota reached. If you are the app owner, visit{' '}
              <a
                href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold text-amber-950 hover:text-amber-800"
              >
                maps developer site
              </a>{' '}
              for instructions to update your account.
            </span>
          </div>
        )}
        <RootExperience />
      </LunarProvider>
    </MotionConfig>
  );
}
