// signalEngine.js (frontend, pure JS)
// Логика расчёта сигналов по объёму (SMA и процентиль) для браузера

export class VolumeSignalEngine {
  constructor(smaLength = 200, thresholdPercent = 50, percentileWindow = 200, percentileLevel = 5) {
    this.smaLength = smaLength;
    this.thresholdPercent = thresholdPercent;
    this.percentileWindow = percentileWindow;
    this.percentileLevel = percentileLevel;
    this.volumes = [];
  }

  update(volume) {
    this.volumes.push(volume);
    if (this.volumes.length > this.percentileWindow) this.volumes.shift();
  }

  getSMA() {
    if (this.volumes.length < this.smaLength) return null;
    const arr = this.volumes.slice(-this.smaLength);
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  getPercentileRank(volume) {
    if (this.volumes.length < this.percentileWindow) return null;
    const sorted = [...this.volumes].sort((a, b) => a - b);
    let rank = 0;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] < volume) rank++;
      else break;
    }
    return (rank / Math.max(sorted.length - 1, 1)) * 100;
  }

  checkSignals(volume) {
    this.update(volume);
    const sma = this.getSMA();
    const percentileRank = this.getPercentileRank(volume);
    const smaSignal = sma && volume < sma * (1 - this.thresholdPercent / 100);
    const percentileSignal = percentileRank !== null && percentileRank <= this.percentileLevel;
    return { smaSignal, percentileSignal, sma, percentileRank };
  }
}
