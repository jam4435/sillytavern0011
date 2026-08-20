import { useCallback, useRef, useState } from 'react';
import { PageState } from '../types';

export function shouldDeferSetupEventNotifications(
  currentPage: PageState,
  isLoading: boolean,
  isInitialRenamePending: boolean,
): boolean {
  return currentPage === 'setup' && (isLoading || isInitialRenamePending);
}

export function usePageFlow() {
  const [currentPage, setCurrentPage] = useState<PageState>('booting');
  const [savedGameExists, setSavedGameExists] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const canResolveInitialPageRef = useRef(true);

  const resolveInitialPage = useCallback((page: Exclude<PageState, 'booting'>): boolean => {
    if (!canResolveInitialPageRef.current) return false;
    setCurrentPage(page);
    return true;
  }, []);

  const moveFromInitialPage = useCallback((page: Exclude<PageState, 'booting'>) => {
    canResolveInitialPageRef.current = false;
    setCurrentPage(page);
  }, []);

  const handleStart = useCallback(() => {
    moveFromInitialPage('splash');
  }, [moveFromInitialPage]);

  const handleNewGame = useCallback(() => {
    moveFromInitialPage('setup');
  }, [moveFromInitialPage]);

  const handleSetupBack = useCallback(() => {
    moveFromInitialPage('splash');
  }, [moveFromInitialPage]);

  const goToGame = useCallback(() => {
    setCurrentPage('game');
  }, []);

  return {
    currentPage,
    setCurrentPage,
    resolveInitialPage,
    savedGameExists,
    setSavedGameExists,
    isLoading,
    setIsLoading,
    handleStart,
    handleNewGame,
    handleSetupBack,
    goToGame,
  };
}
