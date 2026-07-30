/**
 * Converts chart objects from candle-index coordinates
 * into time-based coordinates so they survive timeframe switches.
 *
 * Example:
 * H1 candle index 250
 * becomes:
 * timestamp: 1716465600
 *
 * Then M5 can rebuild the correct index.
 */

export function anchorObjectToTime(object, candles) {
  if (!object || !candles || candles.length === 0) {
    return object;
  }

  const anchored = { ...object };

  // Trendlines / Rays / Lines
  if (object.startIndex !== undefined) {
    const candle = candles[object.startIndex];

    if (candle) {
      anchored.startTime = candle.epoch;
    }
  }

  if (object.endIndex !== undefined) {
    const candle = candles[object.endIndex];

    if (candle) {
      anchored.endTime = candle.epoch;
    }
  }


  // Single point objects
  if (object.absIndex !== undefined) {
    const candle = candles[object.absIndex];

    if (candle) {
      anchored.time = candle.epoch;
    }
  }


  // Remove old index references
  delete anchored.startIndex;
  delete anchored.endIndex;
  delete anchored.absIndex;


  anchored.timeAnchored = true;

  return anchored;
}


/**
 * Converts timestamp-based drawings back into
 * indexes after a new timeframe loads.
 */

export function reanchorObjectToIndex(object, candles) {
  if (!object || !candles || candles.length === 0) {
    return object;
  }

  const restored = { ...object };


  if (object.startTime !== undefined) {
    restored.startIndex = findClosestCandle(
      candles,
      object.startTime
    );
  }


  if (object.endTime !== undefined) {
    restored.endIndex = findClosestCandle(
      candles,
      object.endTime
    );
  }


  if (object.time !== undefined) {
    restored.absIndex = findClosestCandle(
      candles,
      object.time
    );
  }


  delete restored.startTime;
  delete restored.endTime;
  delete restored.time;


  restored.timeAnchored = false;

  return restored;
}


/**
 * Finds the candle closest to a timestamp.
 */
function findClosestCandle(candles, targetTime) {

  let closestIndex = 0;
  let smallestDiff = Infinity;


  candles.forEach((candle, index)=>{

    const diff = Math.abs(
      candle.epoch - targetTime
    );


    if(diff < smallestDiff){
      smallestDiff = diff;
      closestIndex = index;
    }

  });


  return closestIndex;
}
