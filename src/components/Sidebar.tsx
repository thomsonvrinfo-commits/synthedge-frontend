import { Link } from "react-router-dom";

import {
  LayoutDashboard,
  RotateCcw,
  FlaskConical,
  BookOpen,
  BarChart3,
  Settings
} from "lucide-react";


export default function Sidebar() {

  return (

    <aside className="sidebar">

      <h2>SynthEdge</h2>


      <nav className="sidebar-menu">


        <Link to="/">
          <LayoutDashboard size={18}/>
          Dashboard
        </Link>


        <Link to="/replay">
          <RotateCcw size={18}/>
          Replay
        </Link>


        <Link to="/backtest">
          <FlaskConical size={18}/>
          Backtest
        </Link>


        <Link to="/journal">
          <BookOpen size={18}/>
          Journal
        </Link>


        <Link to="/analytics">
          <BarChart3 size={18}/>
          Analytics
        </Link>


        <Link to="/settings">
          <Settings size={18}/>
          Settings
        </Link>


      </nav>


    </aside>

  );

}
