import { useCallback, useState } from 'react';
import { PageState } from '../types';

export function usePageFlow() {
  const [currentPage, setCurrentPage] = useState<PageState>('start');
  const [savedGameExists, setSavedGameExists] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleStart = useCallback(() => {
    setCurrentPage('splash');
  }, []);

  const handleNewGame = useCallback(() => {
    setCurrentPage('setup');
  }, []);

  const handleSetupBack = useCallback(() => {
    setCurrentPage('splash');
  }, []);

  const goToGame = useCallback(() => {
    setCurrentPage('game');
  }, []);

  return {
    currentPage,
    setCurrentPage,
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
