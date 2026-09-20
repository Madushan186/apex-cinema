import { isValidDateISO } from "@apex-cinema/booking-core";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { DateNav } from "@/components/staff/DateNav";
import { RequireRole } from "@/components/staff/RequireRole";
import {
  PARTY_ROOM_ID,
  ROOM_IDS,
  STATUS_BADGE_VARIANT,
  formatTimeOfDay,
  groupByRoom,
  roomNumber,
} from "@/components/staff/scheduleFormat";
import { StaffTopBar } from "@/components/staff/StaffTopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import type { ScheduleBooking } from "@/data/firebase/staffApi";
import { getStaffSchedule } from "@/data/firebase/staffApi";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { usePromise } from "@/hooks/usePromise";
import { useI18n } from "@/i18n/LocaleProvider";
import { getColomboTodayISO } from "@/lib/colomboTime";

function BookingRow({ booking }: { booking: ScheduleBooking }) {
  const { t } = useI18n();
  const statusKey = {
    "active-hold": "staff.statusActiveHold",
    "expired-hold": "staff.statusExpiredHold",
    confirmed: "staff.statusConfirmed",
    other: "staff.statusOther",
  } as const;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border-subtle p-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-foreground">
          {formatTimeOfDay(booking.startMinute)}–{formatTimeOfDay(booking.endMinute)} ·{" "}
          {t(`packages.tiers.${booking.packageId}.name`)}
        </p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {booking.customerName} · {booking.customerPhone} · {t("staff.peopleLabel", { count: booking.peopleCount })}
        </p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {t("staff.referenceLabel")}: {booking.referenceCode}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {booking.paymentStatus === "unpaid" ? <Badge variant="warning">{t("staff.unpaidBadge")}</Badge> : null}
        <Badge variant={STATUS_BADGE_VARIANT[booking.displayStatus]}>{t(statusKey[booking.displayStatus])}</Badge>
      </div>
    </div>
  );
}

function ScheduleBody() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const [dateISO, setDateISO] = useState(() => {
    const fromQuery = searchParams.get("date");
    return fromQuery && isValidDateISO(fromQuery) ? fromQuery : getColomboTodayISO();
  });
  const { data: bookings, error } = usePromise(() => getStaffSchedule(dateISO), [dateISO]);

  const grouped = bookings ? groupByRoom(bookings) : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("staff.scheduleTitle")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("staff.scheduleSubtitle", { date: dateISO })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link to="/staff/new-booking">{t("staff.newBookingLink")}</Link>
          </Button>
          <DateNav dateISO={dateISO} onChange={setDateISO} />
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-4">
        {error ? (
          <Notice variant="error">{t("staff.scheduleError")}</Notice>
        ) : !grouped ? (
          <Notice variant="info">{t("staff.loadingSchedule")}</Notice>
        ) : (
          ROOM_IDS.map((roomId) => {
            const roomBookings = grouped.get(roomId) ?? [];
            const isPartyRoom = roomId === PARTY_ROOM_ID;
            return (
              <Card key={roomId}>
                <CardHeader>
                  <CardTitle>{t("staff.roomLabel", { number: roomNumber(roomId) })}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {isPartyRoom ? (
                    <Notice variant="info">{t("staff.partyRoomNote")}</Notice>
                  ) : roomBookings.length === 0 ? (
                    <p className="text-muted-foreground text-sm">{t("staff.noBookings")}</p>
                  ) : (
                    roomBookings.map((booking) => <BookingRow key={booking.bookingId} booking={booking} />)
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

export function StaffSchedule() {
  const { t } = useI18n();
  useDocumentTitle(t("staff.scheduleTitle"));

  return (
    <RequireRole allowedRoles={["staff", "owner"]}>
      {(auth) => (
        <>
          <div className="mx-auto max-w-4xl px-4 pt-6">
            <StaffTopBar
              email={auth.user?.email ?? null}
              role={auth.role ?? "staff"}
              onSignOut={() => void auth.signOutStaff()}
              navLink={auth.role === "owner" ? { to: "/staff/overview", label: t("staff.viewOverviewLink") } : undefined}
            />
          </div>
          <ScheduleBody />
        </>
      )}
    </RequireRole>
  );
}
