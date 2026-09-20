import { Outlet, useLocation } from "react-router";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { MobileBookingBar } from "./MobileBookingBar";

export function Root() {
  const { pathname } = useLocation();
  const showMobileBookingBar = !pathname.startsWith("/book") && !pathname.startsWith("/staff");

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <Header />
      <main id="main-content" className={showMobileBookingBar ? "flex-1 pb-24 lg:pb-0" : "flex-1"}>
        <Outlet />
      </main>
      <Footer />
      {showMobileBookingBar ? <MobileBookingBar /> : null}
    </div>
  );
}
