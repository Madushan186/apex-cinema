import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router";
import { Root } from "@/components/layout/Root";
import { Notice } from "@/components/ui/notice";
import { useI18n } from "@/i18n/LocaleProvider";

// Every route is its own chunk — marketing pages never pull in the booking
// wizard's or the staff area's code, and vice versa (docs/PROGRESS.md
// "lazy-load route-specific code" requirement).
const Home = lazy(() => import("@/routes/Home").then((m) => ({ default: m.Home })));
const Packages = lazy(() => import("@/routes/Packages").then((m) => ({ default: m.Packages })));
const Rooms = lazy(() => import("@/routes/Rooms").then((m) => ({ default: m.Rooms })));
const Party = lazy(() => import("@/routes/Party").then((m) => ({ default: m.Party })));
const Faq = lazy(() => import("@/routes/Faq").then((m) => ({ default: m.Faq })));
const Policies = lazy(() => import("@/routes/Policies").then((m) => ({ default: m.Policies })));
const Contact = lazy(() => import("@/routes/Contact").then((m) => ({ default: m.Contact })));
const Book = lazy(() => import("@/routes/Book").then((m) => ({ default: m.Book })));
const StaffLogin = lazy(() => import("@/routes/staff/StaffLogin").then((m) => ({ default: m.StaffLogin })));
const StaffSchedule = lazy(() => import("@/routes/staff/StaffSchedule").then((m) => ({ default: m.StaffSchedule })));
const OwnerOverview = lazy(() =>
  import("@/routes/staff/OwnerOverview").then((m) => ({ default: m.OwnerOverview })),
);
const NewManualBooking = lazy(() =>
  import("@/routes/staff/NewManualBooking").then((m) => ({ default: m.NewManualBooking })),
);
const NotFound = lazy(() => import("@/routes/NotFound").then((m) => ({ default: m.NotFound })));

function RouteFallback() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <Notice variant="info">{t("common.loading")}</Notice>
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<Root />}>
          <Route index element={<Home />} />
          <Route path="packages" element={<Packages />} />
          <Route path="rooms" element={<Rooms />} />
          <Route path="party" element={<Party />} />
          <Route path="faq" element={<Faq />} />
          <Route path="policies" element={<Policies />} />
          <Route path="contact" element={<Contact />} />
          <Route path="book" element={<Book />} />
          <Route path="staff/login" element={<StaffLogin />} />
          <Route path="staff" element={<StaffSchedule />} />
          <Route path="staff/new-booking" element={<NewManualBooking />} />
          <Route path="staff/overview" element={<OwnerOverview />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
