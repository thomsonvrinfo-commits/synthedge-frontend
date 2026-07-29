import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="app-layout">

      <Topbar />

      <div className="app-body">

        <Sidebar />

        <main className="workspace">
          {children}
        </main>

      </div>

    </div>
  );
}
