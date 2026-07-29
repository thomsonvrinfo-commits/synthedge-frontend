import { useEffect, useRef } from "react";

import {
  renderGridLayer,
  renderCandleLayer
} from "../../lib/chart/chartRenderer";

import {
  buildTransform
} from "../../lib/chart/chartEngine";

import {
  fetchMergedCandles
} from "../../lib/chart/historicalCandles";


export default function Chart() {

  const canvasRef = useRef<HTMLCanvasElement | null>(null);


  useEffect(() => {

    async function loadChart() {

      const canvas = canvasRef.current;

      if (!canvas) return;


      const ctx = canvas.getContext("2d");

      if (!ctx) return;


      const candles = await fetchMergedCandles(
        "Volatility 75 Index",
        60,
        1706745600,
        1706749200
      );


      console.log("SYNTHEDGE CANDLES:", candles);


      if (!candles || candles.length === 0) {
        console.warn("No candles returned");
        return;
      }


      const transform = buildTransform({

        visibleCandles: candles,

        sliceStart: 0,

        W: canvas.width,

        H: canvas.height

      });


      renderGridLayer(
        ctx,
        transform,
        "dark"
      );


      renderCandleLayer(
        ctx,
        transform,
        candles,
        "dark"
      );


    }


    loadChart();


  }, []);


  return (

    <div className="chart-container">

      <canvas
        ref={canvasRef}
        width={900}
        height={500}
      />

    </div>

  );

}
