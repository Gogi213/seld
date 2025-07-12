// usePagination.js - хук для управления пагинацией графиков
import { useState, useEffect, useMemo } from 'react';

const tfList = ["1m", "5m", "15m", "30m", "1h"];

export const usePagination = (signals, pinSignalsTop, chartsPerPage = 9) => {
  const [currentPage, setCurrentPage] = useState(1);

  // Подготовка данных для графиков с сортировкой
  const allChartCoins = useMemo(() => {
    return signals
      .filter(s => s && s.symbol && typeof s.natr30m === 'number')
      .sort((a, b) => {
        if (pinSignalsTop) {
          const hasSignalsA = tfList.some(tf => a[`percentileSignal_${tf}`] || a[`percentileSignalExpired_${tf}`]);
          const hasSignalsB = tfList.some(tf => b[`percentileSignal_${tf}`] || b[`percentileSignalExpired_${tf}`]);
          if (hasSignalsA && !hasSignalsB) return -1;
          if (!hasSignalsA && hasSignalsB) return 1;
          return (b.natr30m || 0) - (a.natr30m || 0);
        } else {
          return (b.natr30m || 0) - (a.natr30m || 0);
        }
      });
  }, [signals, pinSignalsTop]);

  const totalPages = Math.ceil(allChartCoins.length / chartsPerPage);
  const startIndex = (currentPage - 1) * chartsPerPage;
  const currentPageCoins = allChartCoins.slice(startIndex, startIndex + chartsPerPage);

  // Сброс страницы при смене данных
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const goToNextPage = () => {
    setCurrentPage(prev => Math.min(totalPages, prev + 1));
  };

  const goToPrevPage = () => {
    setCurrentPage(prev => Math.max(1, prev - 1));
  };

  const resetToFirstPage = () => {
    setCurrentPage(1);
  };

  return {
    currentPage,
    totalPages,
    currentPageCoins,
    allChartCoins,
    goToNextPage,
    goToPrevPage,
    resetToFirstPage,
    canGoNext: currentPage < totalPages,
    canGoPrev: currentPage > 1
  };
};