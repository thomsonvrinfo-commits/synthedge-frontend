
import Chart from "./chart/Chart";
export default function TradingWorkspace() {

  return (

    <div className="trading-workspace">


      <section className="chart-area">

        <Chart />

      </section>



      <aside className="right-panel">

        <h3>
          Trade Panel
        </h3>

        <p>
          Positions / Analytics
        </p>

      </aside>



      <footer className="timeline">

        <h3>
          Replay Timeline
        </h3>

      </footer>


    </div>

  );

}
