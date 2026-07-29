export default function Dashboard() {

  return (

    <div className="dashboard">

      <h1>SynthEdge Dashboard</h1>

      <p>
        Trading analytics workspace
      </p>


      <div className="stats-grid">


        <div className="card">
          <h3>Total Trades</h3>
          <h2>0</h2>
        </div>


        <div className="card">
          <h3>Win Rate</h3>
          <h2>0%</h2>
        </div>


        <div className="card">
          <h3>Profit Factor</h3>
          <h2>--</h2>
        </div>


        <div className="card">
          <h3>Account Growth</h3>
          <h2>--</h2>
        </div>


      </div>


      <div className="activity">

        <h2>
          Recent Activity
        </h2>

        <p>
          No trading sessions yet.
        </p>

      </div>


    </div>

  );

}
